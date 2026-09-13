import math
import logging
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
    LEGACY_UPLOAD_FOLDER,
    DatasetAccessError,
    TransformationError,
    apply_transformations,
    get_owned_dataset,
    json_safe_records,
    load_original_dataset,
    load_working_dataset,
)
from backend.services.object_storage import ObjectStorageError, delete_object


logger = logging.getLogger(__name__)


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

    object_key = dataset.stored_filename

    try:
        db.delete(dataset)
        db.commit()
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete the dataset.",
        ) from error

    if os.path.basename(object_key) == object_key:
        legacy_path = os.path.join(LEGACY_UPLOAD_FOLDER, object_key)
        try:
            if os.path.isfile(legacy_path):
                os.remove(legacy_path)
        except OSError:
            logger.exception("Could not delete legacy dataset file %s", legacy_path)
    else:
        try:
            delete_object(object_key)
        except ObjectStorageError:
            logger.exception("Could not delete orphaned R2 object %s", object_key)


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
    "/{dataset_id}/transformations/preview",
)
def preview_transformation_endpoint(
    dataset_id: uuid.UUID,
    data: TransformationCreate,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> dict:
    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        before = load_working_dataset(dataset)
        candidate = DatasetTransformation(
            transformation_type=data.transformation_type, config=data.to_config()
        )
        after = apply_transformations(before, [candidate])
        if data.transformation_type == "filter_rows":
            excluded = before.loc[
                ~before.index.isin(after.index)
            ]

            return {
                "rows_before": len(before),
                "rows_after": len(after),
                "affected_rows": len(excluded),
                "revision": ",".join(
                    str(item.id)
                    for item in dataset.transformations
                ),
                "before": json_safe_records(before.head(5)),
                "after": json_safe_records(after.head(5)),
                "excluded_preview": json_safe_records(
                    excluded.head(5)
                ),
                "can_apply": len(after) > 0,
            }
        if data.transformation_type == "hide_column":
            return {
                "rows_before": len(before), "rows_after": len(after),
                "columns_before": before.columns.tolist(),
                "columns_after": after.columns.tolist(),
                "removed_columns": [column for column in before.columns if column not in after.columns],
                "revision": ",".join(str(item.id) for item in dataset.transformations),
                "before": json_safe_records(before.head(5)),
                "after": json_safe_records(after.head(5)),
            }
        if data.transformation_type == "remove_duplicates":
            changed = before.duplicated(keep="first")
        elif data.transformation_type == "trim_whitespace":
            changed = before[data.column_name].map(
                lambda value: isinstance(value, str) and value != value.strip()
            )
        else:
            raise TransformationError("Preview supports cleaning and column removal only.")
        indices = before.index[changed][:5]
        return {
            "rows_before": len(before),
            "rows_after": len(after),
            "affected_rows": int(changed.sum()),
            "revision": ",".join(str(item.id) for item in dataset.transformations),
            "before": json_safe_records(before.loc[indices]),
            "after": json_safe_records(after.loc[after.index.intersection(indices)]),
        }
    except DatasetAccessError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except TransformationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


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
    requires_preview = (
        data.column_names is not None
        or data.transformation_type == "filter_rows"
    )

    if requires_preview and data.expected_revision is None:
        raise HTTPException(
            status_code=422,
            detail="Preview this change before applying it.",
        )
    try:
        db.execute(select(Dataset.id).where(Dataset.id == dataset_id, Dataset.owner_id == owner_id).with_for_update())
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        current_df = apply_transformations(
            load_original_dataset(dataset), dataset.transformations
        )
        if data.expected_revision is not None and data.expected_revision != ",".join(
            str(item.id) for item in dataset.transformations
        ):
            raise HTTPException(status_code=409, detail="The dataset changed. Preview the change again.")
        candidate = DatasetTransformation(
            dataset_id=dataset.id,
            transformation_type=data.transformation_type,
            config=data.to_config(),
        )
        updated_df = apply_transformations(current_df, [candidate])

        if (
            data.transformation_type == "filter_rows"
            and updated_df.empty
        ):
            raise TransformationError(
                "This filter would exclude every record. "
                "Adjust the conditions to keep at least one record."
            )
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
        db.execute(select(Dataset.id).where(Dataset.id == dataset_id, Dataset.owner_id == owner_id).with_for_update())
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
