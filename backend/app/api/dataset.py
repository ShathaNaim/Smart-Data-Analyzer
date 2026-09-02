import math
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.anonymous_identity import get_anonymous_owner_id
from backend.database import get_db
from backend.models.dataset import Dataset
from backend.models.dataset_transformation import DatasetTransformation
from backend.schemas.dataset import DatasetSummaryResponse
from backend.schemas.dataset_transformation import (
    DatasetDetailResponse,
    TransformationCreate,
    TransformationResponse,
)
from backend.services.dataset_transformer import (
    UPLOAD_FOLDER,
    DatasetAccessError,
    TransformationError,
    apply_transformations,
    get_owned_dataset,
    json_safe_records,
    load_original_dataset,
    load_working_dataset,
)


router = APIRouter(
    prefix="/datasets",
    tags=["datasets"],
)


@router.get("", response_model=list[DatasetSummaryResponse])
def list_datasets_endpoint(
    limit: int = Query(default=5, ge=1, le=50),
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> list[Dataset]:
    """Return the current browser's most recently uploaded datasets."""

    statement = (
        select(Dataset)
        .where(Dataset.owner_id == owner_id)
        .order_by(Dataset.created_at.desc())
        .limit(limit)
    )

    return list(db.scalars(statement).all())


@router.delete(
    "/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dataset_endpoint(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> None:
    """Delete an owned dataset, its dependent records, and its stored file."""
    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
    except DatasetAccessError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    if os.path.basename(dataset.stored_filename) != dataset.stored_filename:
        raise HTTPException(status_code=500, detail="The stored filename is invalid.")

    file_path = os.path.join(UPLOAD_FOLDER, dataset.stored_filename)
    staged_path = f"{file_path}.deleting-{uuid.uuid4()}"
    file_was_staged = False

    try:
        if os.path.isfile(file_path):
            os.replace(file_path, staged_path)
            file_was_staged = True
        db.delete(dataset)
        db.commit()
    except Exception as error:
        db.rollback()
        if file_was_staged and os.path.isfile(staged_path):
            os.replace(staged_path, file_path)
        raise HTTPException(
            status_code=500,
            detail="Could not delete the dataset.",
        ) from error

    if file_was_staged:
        try:
            os.remove(staged_path)
        except OSError:
            # The database deletion succeeded; a stale staged file can be
            # cleaned up later without exposing the dataset to the user.
            pass


@router.get("/{dataset_id}", response_model=DatasetDetailResponse)
def get_dataset_endpoint(
    dataset_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=100),
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DatasetDetailResponse:
    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        df = load_working_dataset(dataset)
    except (DatasetAccessError, TransformationError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    total_pages = max(1, math.ceil(len(df) / page_size))
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size

    return DatasetDetailResponse(
        id=dataset.id,
        original_filename=dataset.original_filename,
        extension=dataset.extension,
        file_size=dataset.file_size,
        row_count=len(df),
        original_columns=dataset.columns,
        columns=[str(column) for column in df.columns],
        description=dataset.description,
        created_at=dataset.created_at,
        preview=json_safe_records(df.iloc[start : start + page_size]),
        page=safe_page,
        page_size=page_size,
        total_pages=total_pages,
        transformations=[
            TransformationResponse.model_validate(item)
            for item in dataset.transformations
        ],
    )


@router.post(
    "/{dataset_id}/transformations",
    response_model=TransformationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_transformation_endpoint(
    dataset_id: uuid.UUID,
    data: TransformationCreate,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> TransformationResponse:
    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        current_df = apply_transformations(
            load_original_dataset(dataset), dataset.transformations
        )
        candidate = DatasetTransformation(
            dataset_id=dataset.id,
            transformation_type=data.transformation_type,
            config=data.to_config(),
        )
        apply_transformations(current_df, [candidate])
    except DatasetAccessError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except TransformationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        db.add(candidate)
        db.commit()
        db.refresh(candidate)
    except Exception:
        db.rollback()
        raise
    return TransformationResponse.model_validate(candidate)


@router.delete(
    "/{dataset_id}/transformations/{transformation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def undo_transformation_endpoint(
    dataset_id: uuid.UUID,
    transformation_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> None:
    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
    except DatasetAccessError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    if not dataset.transformations or dataset.transformations[-1].id != transformation_id:
        raise HTTPException(
            status_code=409,
            detail="Only the most recent transformation can be undone.",
        )
    db.delete(dataset.transformations[-1])
    db.commit()
