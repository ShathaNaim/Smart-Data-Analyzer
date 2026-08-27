from __future__ import annotations

import json
import re

import dotenv
import pandas as pd
from langchain_openai import ChatOpenAI

from backend.schemas.analysis_suggestion import AnalysisSuggestions
from backend.services.analysis_executor import (
    AnalysisExecutionError,
    validate_plan_columns,
)
from backend.services.dataset_profiler import build_dataset_profile
from backend.services.kpi_executor import validate_kpi_plan_columns
from backend.services.semantic_profiler import create_semantic_profile


dotenv.load_dotenv()


SYSTEM_PROMPT = """
You are an analytics recommendation planner.

Your job is to suggest useful KPI cards and charts based on deterministic
dataset metadata and a validated semantic profile.

You only create declarative plans.
You do not calculate results.
You do not generate Python, JavaScript, SQL, or chart-library code.
You may only reference columns included in the supplied metadata.
Never invent columns, formulas, currencies, or dataset values.

General suggestion rules:
- Return between two and four useful KPI suggestions when supported.
- Return between two and four useful chart suggestions when supported.
- Prefer a small set of meaningful and diverse analyses.
- Do not create multiple suggestions that answer essentially the same question.
- Every suggestion must explain why it is useful.
- Confidence must reflect semantic certainty.
- Use lower confidence when a suggestion depends on assumptions.
- Use short lowercase IDs containing letters, numbers, and hyphens.
- IDs must be unique across all KPI and chart suggestions.

KPI rules:
- KPI suggestions must contain a complete KpiAnalysisPlan.
- A KPI must produce exactly one numeric value.
- Use exactly one measure.
- Do not include dimensions, grouping, sorting, row limits, or chart types.
- Use nunique for distinct entities.
- Use count for non-null values.
- Use sum only for additive values.
- Use mean for measurements where a total would not be meaningful.
- Never invent formulas for profit, growth, conversion, churn, or performance.
- Never invent a currency code.
- The suggestion title and KPI plan title must match.
- Prefer integer formatting for counts and distinct counts.

Chart rules:
- Chart suggestions must contain a complete ChartAnalysisPlan.
- Every chart must contain exactly one dimension.
- Use between one and five measures.
- Use bar charts for comparisons across categories.
- Use line charts for trends over a real date or time dimension.
- Use area charts only for suitable volume trends over time.
- Use pie charts only for one measure over a small number of categories.
- Do not use identifiers as chart dimensions unless explicitly meaningful.
- Keep row_limit at or below 1000.
- Avoid charts with extremely high-cardinality dimensions.
- Do not suggest line or area charts without a valid date or time dimension.

Quality rules:
- Prefer analyses that help a user understand size, composition, trends,
  performance, workload, or distribution.
- Do not suggest analyses solely because columns are available.
- Do not suggest a KPI or chart when its meaning would be misleading.
- Include important uncertainty in the plan assumptions and response warnings.
"""


class SuggestionGenerationError(ValueError):
    """Raised when AI-generated suggestions are unsafe or invalid."""


def generate_analysis_suggestions(
    df: pd.DataFrame,
) -> AnalysisSuggestions:
    """
    Generate validated KPI and chart plans without calculating their results.
    """

    metadata = build_dataset_profile(df)
    semantic_profile = create_semantic_profile(df)

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
    )

    structured_llm = llm.with_structured_output(
        AnalysisSuggestions,
    )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": (
                "Generate analysis suggestions using the following inputs.\n\n"
                "Deterministic dataset metadata:\n"
                + json.dumps(metadata, ensure_ascii=False)
                + "\n\nValidated semantic profile:\n"
                + semantic_profile.model_dump_json()
            ),
        },
    ]

    result = structured_llm.invoke(messages)

    if isinstance(result, AnalysisSuggestions):
        suggestions = result
    else:
        suggestions = AnalysisSuggestions.model_validate(result)

    validate_analysis_suggestions(
        df=df,
        suggestions=suggestions,
    )

    return suggestions


def validate_analysis_suggestions(
    df: pd.DataFrame,
    suggestions: AnalysisSuggestions,
) -> None:
    """
    Validate IDs, titles, referenced columns, and supported operations.
    """

    all_suggestions = [
        *suggestions.kpi_suggestions,
        *suggestions.chart_suggestions,
    ]

    if not all_suggestions:
        raise SuggestionGenerationError(
            "The AI did not produce any analysis suggestions."
        )

    suggestion_ids = [
        suggestion.id
        for suggestion in all_suggestions
    ]

    if len(suggestion_ids) != len(set(suggestion_ids)):
        raise SuggestionGenerationError(
            "Analysis suggestion IDs must be unique."
        )

    for suggestion_id in suggestion_ids:
        if not re.fullmatch(
            r"[a-z0-9]+(?:-[a-z0-9]+)*",
            suggestion_id,
        ):
            raise SuggestionGenerationError(
                f"Invalid suggestion ID: {suggestion_id}"
            )

    try:
        for suggestion in suggestions.kpi_suggestions:
            if suggestion.title != suggestion.plan.title:
                raise SuggestionGenerationError(
                    f"KPI suggestion '{suggestion.id}' has inconsistent titles."
                )

            validate_kpi_plan_columns(
                df=df,
                plan=suggestion.plan,
            )

        for suggestion in suggestions.chart_suggestions:
            validate_plan_columns(
                df=df,
                plan=suggestion.plan,
            )

    except AnalysisExecutionError as error:
        raise SuggestionGenerationError(
            str(error)
        ) from error