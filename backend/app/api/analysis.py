import uuid

import pandas as pd
from backend.services.dataset_profiler import json_safe_value
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.app.auth_dependencies import get_workspace_owner_id
from backend.database import get_db
from backend.schemas.question import (
    ClarificationResponse,
    CompletedAnalysisResponse,
    QuestionRequest,
)
from backend.services.analysis_executor import (
    AnalysisExecutionError,
    execute_analysis_plan,
)
from backend.services.ai_rate_limiter import enforce_ai_usage_limit
from backend.services.ai_cache import get_cached_ai_result
from backend.services.analysis_planner import create_analysis_plan
from backend.services.insight_generator import generate_chart_insight
from backend.services.insight_polisher import polish_chart_insight
from backend.services.warning_generator import generate_analysis_warnings
from backend.services.kpi_executor import execute_kpi_plan
from backend.schemas.semantic_profile import SemanticDatasetProfile
from backend.services.semantic_profiler import (
    SemanticProfileError,
)
from backend.schemas.analysis_suggestion import AnalysisSuggestions
from backend.services.analysis_suggester import (
    SuggestionGenerationError,
)
from backend.schemas.suggestion_preview import (
    SuggestionPreviewRequest,
    SuggestionPreviewResponse,
)
from backend.services.dataset_transformer import (
    DatasetAccessError,
    TransformationError,
    get_owned_dataset,
    load_working_dataset,
)

router = APIRouter()

def load_owned_dataset(
    file_id: str, db: Session, owner_id: uuid.UUID
) -> tuple[pd.DataFrame, str | None]:
    try:
        dataset_id = uuid.UUID(file_id)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found",
        ) from error

    try:
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        return load_working_dataset(dataset), dataset.description
    except (DatasetAccessError, TransformationError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/dataset/{file_id}/summary")
def get_summary(
    file_id: str,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
):
    df, _ = load_owned_dataset(file_id, db, owner_id)

    return {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist(),
        "data_types": {
            column: str(dtype)
            for column, dtype in df.dtypes.items()
        },
        "missing_values": df.isnull().sum().to_dict(),
        "numeric_summary": {
            str(column): {str(stat): json_safe_value(value) for stat, value in stats.items()}
            for column, stats in df.describe().to_dict().items()
        },
    }


@router.post(
    "/dataset/{file_id}/semantic-profile",
    response_model=SemanticDatasetProfile,
)
def get_semantic_profile(
    file_id: str,
    response: Response,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
) -> SemanticDatasetProfile:
    """
    Generate a validated semantic profile for an uploaded dataset.

    This is a POST endpoint because it triggers an AI operation.
    """

    try:
        dataset_id = uuid.UUID(file_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Dataset not found") from error

    try:
        return get_cached_ai_result(db, dataset_id, owner_id, response, "profile")
    except (DatasetAccessError, TransformationError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except SemanticProfileError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error


@router.get("/dataset/{file_id}/column/{column_name}")
def get_column_summary(
    file_id: str,
    column_name: str,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
):
    df, _ = load_owned_dataset(file_id, db, owner_id)

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

        summary["mean"] = json_safe_value(mean)
        summary["min"] = json_safe_value(minimum)
        summary["max"] = json_safe_value(maximum)

    return summary


@router.post(
    "/dataset/{file_id}/ask",
    response_model=ClarificationResponse | CompletedAnalysisResponse,
)
def ask_dataset(
    file_id: str,
    request: QuestionRequest,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
    _ai_usage: None = Depends(enforce_ai_usage_limit),
):
    df, dataset_description = load_owned_dataset(file_id, db, owner_id)

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
    response: Response,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
) -> AnalysisSuggestions:
    """
    Generate validated KPI and chart suggestions for an uploaded dataset.

    This endpoint returns calculation plans, not calculated results.
    """

    try:
        dataset_id = uuid.UUID(file_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Dataset not found") from error

    try:
        return get_cached_ai_result(db, dataset_id, owner_id, response, "suggestions")
    except (DatasetAccessError, TransformationError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_workspace_owner_id),
) -> SuggestionPreviewResponse:
    """
    Safely execute one selected KPI or chart suggestion.

    The AI-generated plan is still validated and executed only through
    trusted pandas operations.
    """

    df, _ = load_owned_dataset(file_id, db, owner_id)

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
