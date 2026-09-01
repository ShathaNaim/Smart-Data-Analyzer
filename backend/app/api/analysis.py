import os
import uuid

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.dataset import Dataset
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
from backend.services.kpi_executor import execute_kpi_plan
from backend.services.warning_generator import generate_analysis_warnings
from backend.services.kpi_executor import execute_kpi_plan
from backend.schemas.semantic_profile import SemanticDatasetProfile
from backend.services.semantic_profiler import (
    SemanticProfileError,
    create_semantic_profile,
)
from backend.schemas.analysis_suggestion import AnalysisSuggestions
from backend.services.analysis_suggester import (
    SuggestionGenerationError,
    generate_analysis_suggestions,
)
from backend.schemas.suggestion_preview import (
    SuggestionPreviewRequest,
    SuggestionPreviewResponse,
)

router = APIRouter()

UPLOAD_FOLDER = "backend/uploads"


def get_dataset_description(db: Session, file_id: str) -> str | None:
    """Load stored user context for an uploaded dataset."""
    try:
        dataset_id = uuid.UUID(file_id)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found",
        ) from error

    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found",
        )

    return dataset.description


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


@router.post(
    "/dataset/{file_id}/semantic-profile",
    response_model=SemanticDatasetProfile,
)
def get_semantic_profile(
    file_id: str,
    db: Session = Depends(get_db),
) -> SemanticDatasetProfile:
    """
    Generate a validated semantic profile for an uploaded dataset.

    This is a POST endpoint because it triggers an AI operation.
    """

    df = load_dataset(file_id)
    dataset_description = get_dataset_description(db, file_id)

    try:
        return create_semantic_profile(
            df,
            dataset_description=dataset_description,
        )
    except SemanticProfileError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error


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
    db: Session = Depends(get_db),
):
    df = load_dataset(file_id)
    dataset_description = get_dataset_description(db, file_id)

    conversation_id = (
        request.conversation_id
        or str(uuid.uuid4())
    )

    # 1. Ask the AI whether it needs clarification or has a plan.
    decision = create_analysis_plan(
        df=df,
        question=request.question,
        history=request.history,
        dataset_description=dataset_description,
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
        if decision.plan.output_type == "chart":
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

            charts = [chart]
            kpis = []

        else:
            kpi = execute_kpi_plan(
                df=df,
                plan=decision.plan,
            )

            answer = (
                f"{kpi.title}: "
                f"{kpi.value:,.2f}"
                if isinstance(kpi.value, float)
                else f"{kpi.title}: {kpi.value:,}"
            )

            warnings = []
            charts = []
            kpis = [kpi]

    except AnalysisExecutionError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    # 4. Return the calculated chart or KPI specification to Next.js.
    return CompletedAnalysisResponse(
        conversation_id=conversation_id,
        answer=answer,
        charts=charts,
        kpis=kpis,
        assumptions=decision.plan.assumptions,
        warnings=warnings,
    )


@router.post(
    "/dataset/{file_id}/analysis-suggestions",
    response_model=AnalysisSuggestions,
)
def get_analysis_suggestions(
    file_id: str,
    db: Session = Depends(get_db),
) -> AnalysisSuggestions:
    """
    Generate validated KPI and chart suggestions for an uploaded dataset.

    This endpoint returns calculation plans, not calculated results.
    """

    df = load_dataset(file_id)
    dataset_description = get_dataset_description(db, file_id)

    try:
        return generate_analysis_suggestions(
            df,
            dataset_description=dataset_description,
        )
    except (
        SemanticProfileError,
        SuggestionGenerationError,
    ) as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error




@router.post(
    "/dataset/{file_id}/suggestion-preview",
    response_model=SuggestionPreviewResponse,
)
def preview_analysis_suggestion(
    file_id: str,
    request: SuggestionPreviewRequest,
) -> SuggestionPreviewResponse:
    """
    Safely execute one selected KPI or chart suggestion.

    The AI-generated plan is still validated and executed only through
    trusted pandas operations.
    """

    df = load_dataset(file_id)

    try:
        if request.output_type == "chart":
            if request.chart_plan is None:
                raise AnalysisExecutionError(
                    "A chart preview requires a chart plan."
                )

            chart = execute_analysis_plan(
                df=df,
                plan=request.chart_plan,
            )

            warnings = generate_analysis_warnings(
                df=df,
                plan=request.chart_plan,
                chart=chart,
            )

            return SuggestionPreviewResponse(
                output_type="chart",
                chart=chart,
                kpi=None,
                warnings=warnings,
            )

        if request.kpi_plan is None:
            raise AnalysisExecutionError(
                "A KPI preview requires a KPI plan."
            )

        kpi = execute_kpi_plan(
            df=df,
            plan=request.kpi_plan,
        )

        return SuggestionPreviewResponse(
            output_type="kpi",
            chart=None,
            kpi=kpi,
            warnings=[],
        )

    except AnalysisExecutionError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
