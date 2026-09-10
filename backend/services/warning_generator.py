from __future__ import annotations

import pandas as pd

from backend.services.performance import timed_stage
from backend.schemas.question import AnalysisPlan, ChartSpec
from backend.services.analysis_executor import apply_filters, prepare_dimensions


@timed_stage("analysis_warnings")
def generate_analysis_warnings(
    df: pd.DataFrame,
    plan: AnalysisPlan,
    chart: ChartSpec,
) -> list[str]:
    """Describe data conditions that could affect interpretation."""
    warnings: list[str] = []
    filtered_df = apply_filters(df, plan.filters)

    excluded_rows = len(df) - len(filtered_df)
    if excluded_rows > 0:
        warnings.append(
            f"{excluded_rows:,} of {len(df):,} rows were excluded by "
            "the requested filters."
        )

    analyzed_columns = {
        dimension.column for dimension in plan.dimensions
    } | {
        measure.column for measure in plan.measures
    }

    for column_name in sorted(analyzed_columns):
        missing_count = int(filtered_df[column_name].isna().sum())
        if missing_count > 0:
            warnings.append(
                f"Column '{column_name}' contains {missing_count:,} missing "
                "values; pandas excludes them where required by the analysis."
            )

    for dimension in plan.dimensions:
        if dimension.time_granularity is None:
            continue

        source = filtered_df[dimension.column]
        invalid_dates = int(
            (source.notna() & pd.to_datetime(source, errors="coerce").isna()).sum()
        )

        if invalid_dates > 0:
            warnings.append(
                f"Column '{dimension.column}' contains {invalid_dates:,} "
                "values that could not be interpreted as dates and were excluded."
            )

    prepared_df, dimension_columns = prepare_dimensions(filtered_df, plan)
    group_count = int(
        prepared_df[dimension_columns[0]].nunique(dropna=True)
    )

    if group_count > plan.row_limit:
        warnings.append(
            f"The analysis produced {group_count:,} groups, but only "
            f"{plan.row_limit:,} are displayed."
        )

    if len(chart.data) > 30:
        warnings.append(
            f"This chart contains {len(chart.data):,} categories and may be "
            "difficult to read. Consider requesting fewer categories."
        )

    return warnings[:10]
