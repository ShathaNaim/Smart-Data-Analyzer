import pandas as pd
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.dataset import Dataset
from backend.app.anonymous_identity import get_anonymous_owner_id

router = APIRouter()

# it should be a database or a cloud storage in production, but we will use a local folder temporarily ############
###################################################################################################################
UPLOAD_FOLDER = "backend/uploads"
SUPPORTED_EXTENSIONS = {".csv", ".xlsx"}

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id)
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

    saved_filename = f"{file_id}{extension}"

    file_path = os.path.join(
        UPLOAD_FOLDER,
        saved_filename
    )

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        if extension == ".csv":
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path, engine="openpyxl")
    except Exception as error:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=422,
            detail="The uploaded file could not be read as CSV or Excel.",
        ) from error

    dataset = Dataset(
        id=uuid.UUID(file_id),
        original_filename=file.filename,
        stored_filename=saved_filename,
        extension=extension,
        file_size=os.path.getsize(file_path),
        row_count=len(df),
        columns=[str(column) for column in df.columns],
        description=clean_description,
        owner_id=owner_id,
    )
    try:
        db.add(dataset)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save dataset metadata to the database.",
        )

    return {
        "file_id": file_id,
        "filename": file.filename,
        "rows": len(df),
        "columns": df.columns.tolist(),
        "preview": df.head(5).to_dict(orient="records"),
        "description": dataset.description,
    }
