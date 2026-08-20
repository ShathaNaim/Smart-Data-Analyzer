import pandas as pd
import os
import shutil
import uuid
from fastapi import Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.dataset import Dataset
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

# it should be a database or a cloud storage in production, but we will use a local folder temporarily ############
###################################################################################################################
UPLOAD_FOLDER = "backend/uploads"

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
): 

    file_id = str(uuid.uuid4())

    extension = os.path.splitext(file.filename)[1]

    saved_filename = f"{file_id}{extension}"

    file_path = os.path.join(
        UPLOAD_FOLDER,
        saved_filename
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if extension == ".csv":
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    dataset = Dataset(
    id=uuid.UUID(file_id),
    original_filename=file.filename,
    stored_filename=saved_filename,
    extension=extension,
    file_size=os.path.getsize(file_path),
    row_count=len(df),
    columns=[str(column) for column in df.columns],
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
        "preview": df.head(5).to_dict(orient="records")
    }