from __future__ import annotations

import math
import re

import numpy as np
import pandas as pd

from backend.schemas.question import KpiAnalysisPlan, KpiSpec
from backend.services.analysis_executor import (
    AnalysisExecutionError,
    aggregation_function,
    apply_filters,
    json_safe_value,
)


NUMERIC_AGGREGATIONS = {
    "sum",
    "mean",
    "median",
    "min",
    "max",
}


def execute_kpi_plan(
    df: pd.DataFrame,
    plan: KpiAnalysisPlan,
) -> KpiSpec:
    """Execute a validated KPI plan using trusted pandas operations."""

    validate_kpi_plan_columns(df, plan)

    working_df = apply_filters(df.copy(), plan.filters)

    if working_df.empty:
        raise AnalysisExecutionError(
            "No rows remain after applying the requested filters."
        )

    value = calculate_kpi_value(working_df, plan)

    return KpiSpec(
        id=build_kpi_id(plan),
        title=plan.title,
        value=value,
        format=plan.format,
        currency=plan.currency,
        description=plan.description,
    )


def validate_kpi_plan_columns(
    df: pd.DataFrame,
    plan: KpiAnalysisPlan,
) -> None:
    """Verify that KPI measure and filter columns exist and are compatible."""

    available_columns = set(df.columns.astype(str))
    requested_columns = {plan.measure.column}
    requested_columns.update(
        condition.column
        for condition in plan.filters
    )

    missing_columns = requested_columns - available_columns

    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise AnalysisExecutionError(
            f"The KPI plan references missing columns: {missing}"
        )

    if plan.measure.aggregation in NUMERIC_AGGREGATIONS:
        series = df[plan.measure.column]

        if not pd.api.types.is_numeric_dtype(series):
            raise AnalysisExecutionError(
                f"Aggregation '{plan.measure.aggregation}' requires a "
                f"numeric column, but '{plan.measure.column}' is not numeric."
            )


def calculate_kpi_value(
    df: pd.DataFrame,
    plan: KpiAnalysisPlan,
) -> int | float:
    """Calculate the plan's single aggregate and return a JSON-safe number."""

    series = df[plan.measure.column]
    aggregation = aggregation_function(plan.measure.aggregation)
    raw_value = series.agg(aggregation)
    value = json_safe_value(raw_value)

    if value is None or isinstance(value, bool):
        raise AnalysisExecutionError(
            "The KPI calculation did not produce a valid numeric value."
        )

    if isinstance(value, np.integer):
        value = int(value)
    elif isinstance(value, np.floating):
        value = float(value)

    if not isinstance(value, (int, float)):
        raise AnalysisExecutionError(
            "The KPI calculation did not produce a numeric value."
        )

    if isinstance(value, float) and not math.isfinite(value):
        raise AnalysisExecutionError(
            "The KPI calculation produced a non-finite value."
        )

    return value


def build_kpi_id(plan: KpiAnalysisPlan) -> str:
    """Build a stable identifier from the KPI title and calculation."""

    raw_id = "-".join(
        [
            plan.title,
            plan.measure.aggregation,
            plan.measure.column,
        ]
    ).lower()
    normalized_id = re.sub(r"[^a-z0-9]+", "-", raw_id).strip("-")

    return (normalized_id or "kpi")[:100].rstrip("-")
