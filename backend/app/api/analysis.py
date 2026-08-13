import os
import pandas as pd

from fastapi import APIRouter, HTTPException

router = APIRouter()
from backend.schemas.question import QuestionRequest
from backend.services.data_agent import ask_dataframe

UPLOAD_FOLDER = "backend/uploads"


@router.get("/dataset/{file_id}/summary")
def get_summary(file_id: str):
    files = os.listdir(UPLOAD_FOLDER)

    matched_file = next(
        (file for file in files if file.startswith(file_id)),
        None
    )

    if not matched_file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    file_path = os.path.join(UPLOAD_FOLDER, matched_file)

    if matched_file.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    numeric_summary = (
    df.describe()
    .to_dict())

    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist(),
        "data_types": {
            column: str(dtype)
            for column, dtype in df.dtypes.items()
        },
        "missing_values": df.isnull().sum().to_dict(),
        "numeric_summary": numeric_summary
    }


@router.get("/dataset/{file_id}/column/{column_name}")
def get_column_summary(file_id: str, column_name: str):
    files = os.listdir(UPLOAD_FOLDER)

    matched_file = next(
        (file for file in files if file.startswith(file_id)),
        None
    )

    if not matched_file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    file_path = os.path.join(UPLOAD_FOLDER, matched_file)

    if matched_file.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    if column_name not in df.columns:
        raise HTTPException(
            status_code=404,
            detail=f"Column '{column_name}' not found in the dataset"
        )

    column_data = df[column_name]

    summary = {
        "column_name": column_name,
        "data_type": str(column_data.dtype),
        "missing_values": int(column_data.isnull().sum()),
        "unique_values": int(column_data.nunique()),
        "top_5_values": {
            str(value): int(count)
            for value, count in column_data.value_counts().head(5).items()
        }
    }

    if pd.api.types.is_numeric_dtype(column_data):
        mean = column_data.mean()
        minimum = column_data.min()
        maximum = column_data.max()

        summary["mean"] = float(mean) if pd.notna(mean) else None
        summary["min"] = float(minimum) if pd.notna(minimum) else None
        summary["max"] = float(maximum) if pd.notna(maximum) else None

    return summary



@router.post("/dataset/{file_id}/ask")
def ask_dataset(file_id: str, request: QuestionRequest):
    files = os.listdir(UPLOAD_FOLDER)

    matched_file = next(
        (file for file in files if file.startswith(file_id)),
        None
    )

    if not matched_file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    file_path = os.path.join(UPLOAD_FOLDER, matched_file)

    if matched_file.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    answer = ask_dataframe(
        df,
        request.question
    )

    return {
        "question": request.question,
        "answer": answer
    }
