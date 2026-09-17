import pandas as pd
import os
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.dataset import Dataset
from backend.app.auth_dependencies import get_workspace_owner_id
from backend.services.object_storage import (
    ObjectStorageError,
    delete_object,
    upload_object,
)
from backend.config import get_settings
from backend.services.dataset_transformer import json_safe_records

router = APIRouter()

SUPPORTED_EXTENSIONS = {".csv", ".xlsx"}
CONTENT_TYPES = {
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id)
):
    clean_description = (
        description.strip()
        if description and description.strip()
        else None
    )

    if clean_description and len(clean_description) > 2_000:
        raise HTTPException(
            status_code=422,
            detail="Dataset description cannot exceed 2,000 characters.",
        )

    file_id = str(uuid.uuid4())

    extension = os.path.splitext(file.filename or "")[1].lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail="Only CSV and Excel (.xlsx) files are supported.",
        )
    settings = get_settings()

    # Measure the actual uploaded content instead of trusting request headers.
    await file.seek(0)
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size == 0:
        raise HTTPException(
            status_code=422,
            detail="The uploaded file is empty.",
        )

    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"The maximum supported file size is "
                f"{settings.max_upload_size_mb} MB."
            ),
        )

    try:
        if extension == ".csv":
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file, engine="openpyxl")
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail="The uploaded file could not be read as CSV or Excel.",
        ) from error

    row_count = len(df.index)
    column_count = len(df.columns)

    if row_count == 0:
        raise HTTPException(
            status_code=422,
            detail="The dataset must contain at least one data row.",
        )

    if column_count == 0:
        raise HTTPException(
            status_code=422,
            detail="The dataset must contain at least one column.",
        )

    if row_count > settings.max_dataset_rows:
        raise HTTPException(
            status_code=413,
            detail=(
                f"The maximum supported dataset size is "
                f"{settings.max_dataset_rows:,} rows."
            ),
        )

    if column_count > settings.max_dataset_columns:
        raise HTTPException(
            status_code=413,
            detail=(
                f"The maximum supported number of columns is "
                f"{settings.max_dataset_columns:,}."
            ),
        )

    await file.seek(0)
    object_key = f"datasets/{owner_id}/{file_id}{extension}"

    try:
        upload_object(file.file, object_key, CONTENT_TYPES[extension])
    except ObjectStorageError as error:
        raise HTTPException(
            status_code=503,
            detail="File storage is temporarily unavailable.",
        ) from error

    dataset = Dataset(
        id=uuid.UUID(file_id),
        original_filename=file.filename,
        stored_filename=object_key,
        extension=extension,
        file_size=file_size,
        row_count=len(df),
        columns=[str(column) for column in df.columns],
        description=clean_description,
        owner_id=owner_id,
    )
    try:
        db.add(dataset)
        db.commit()
    except Exception as error:
        db.rollback()
        try:
            delete_object(object_key)
        except ObjectStorageError:
            pass
        raise HTTPException(
            status_code=500,
            detail="Failed to save dataset metadata to the database.",
        ) from error

    return {
        "file_id": file_id,
        "filename": file.filename,
        "rows": len(df),
        "columns": df.columns.tolist(),
        "preview": json_safe_records(df.head(5)),
        "description": dataset.description,
    }
