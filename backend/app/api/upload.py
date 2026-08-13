import pandas as pd
import os
import shutil
import uuid

from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

# it should be a database or a cloud storage in production, but we will use a local folder temporarily ############
###################################################################################################################
UPLOAD_FOLDER = "backend/uploads"

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith((".csv", ".xlsx")):
        raise HTTPException(
            status_code=400,
            detail="Only CSV and Excel files are supported"
        )

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

    return {
        "file_id": file_id,
        "filename": file.filename,
        "rows": len(df),
        "columns": df.columns.tolist(),
        "preview": df.head(5).to_dict(orient="records")
    }