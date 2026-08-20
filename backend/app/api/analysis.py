import os
import uuid

import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.schemas.question import (
    ClarificationResponse,
    CompletedAnalysisResponse,
    QuestionRequest,
)
from backend.services.analysis_executor import (
    AnalysisExecutionError,
    execute_analysis_plan,
)
from backend.services.analysis_planner import create_analysis_plan
from backend.services.insight_generator import generate_chart_insight
from backend.services.insight_polisher import polish_chart_insight
from backend.services.warning_generator import generate_analysis_warnings


router = APIRouter()

UPLOAD_FOLDER = "backend/uploads"


def load_dataset(file_id: str) -> pd.DataFrame:
    """Find and load an uploaded dataset by its generated ID."""
    files = os.listdir(UPLOAD_FOLDER)

    matched_file = next(
        (
            filename
            for filename in files
            if filename.startswith(file_id)
        ),
        None,
    )

    if not matched_file:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    file_path = os.path.join(UPLOAD_FOLDER, matched_file)

    if matched_file.endswith(".csv"):
        return pd.read_csv(file_path)

    return pd.read_excel(file_path)


@router.get("/dataset/{file_id}/summary")
def get_summary(file_id: str):
    df = load_dataset(file_id)

    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist(),
        "data_types": {
            column: str(dtype)
            for column, dtype in df.dtypes.items()
        },
        "missing_values": df.isnull().sum().to_dict(),
        "numeric_summary": df.describe().to_dict(),
    }


@router.get("/dataset/{file_id}/column/{column_name}")
def get_column_summary(file_id: str, column_name: str):
    df = load_dataset(file_id)

    if column_name not in df.columns:
        raise HTTPException(
            status_code=404,
            detail=f"Column '{column_name}' not found in the dataset",
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
        },
    }

    if pd.api.types.is_numeric_dtype(column_data):
        mean = column_data.mean()
        minimum = column_data.min()
        maximum = column_data.max()

        summary["mean"] = float(mean) if pd.notna(mean) else None
        summary["min"] = float(minimum) if pd.notna(minimum) else None
        summary["max"] = float(maximum) if pd.notna(maximum) else None

    return summary


@router.post(
    "/dataset/{file_id}/ask",
    response_model=ClarificationResponse | CompletedAnalysisResponse,
)
def ask_dataset(
    file_id: str,
    request: QuestionRequest,
):
    df = load_dataset(file_id)

    conversation_id = (
        request.conversation_id
        or str(uuid.uuid4())
    )

    # 1. Ask the AI whether it needs clarification or has a plan.
    decision = create_analysis_plan(
        df=df,
        question=request.question,
        history=request.history,
    )

    # 2. Return the AI's clarification question without running pandas.
    if decision.status == "needs_clarification":
        return ClarificationResponse(
            conversation_id=conversation_id,
            message=decision.question,
            options=decision.options,
            allow_free_text=True,
        )

    # 3. The request is clear, so execute the validated plan.
    try:
        chart = execute_analysis_plan(
            df=df,
            plan=decision.plan,
        )
        draft_answer = generate_chart_insight(chart)
        warnings = generate_analysis_warnings(
            df=df,
            plan=decision.plan,
            chart=chart,
        )
        answer = polish_chart_insight(
            question=request.question,
            chart=chart,
            draft=draft_answer,
            assumptions=decision.plan.assumptions,
            warnings=warnings,
        )

    except AnalysisExecutionError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    # 4. Return the calculated chart specification to Next.js.
    return CompletedAnalysisResponse(
        conversation_id=conversation_id,
        answer=answer,
        charts=[chart],
        assumptions=decision.plan.assumptions,
        warnings=warnings,
    )
