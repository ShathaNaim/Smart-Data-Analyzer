from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from backend.services.performance import timed_stage
from backend.schemas.question import (
    AnalysisPlan,
    ChartAxis,
    ChartSeries,
    ChartSpec,
    FilterCondition,
)


class AnalysisExecutionError(ValueError):
    """Raised when a validated plan cannot safely run on the dataset."""


SUPPORTED_CHART_TYPES = {
    "scatter",
    "histogram",
    "line",
    "bar",
    "area",
    "pie",
    "donut",
    "horizontal_bar",
}


@timed_stage("chart_calculation")
def execute_analysis_plan(
    df: pd.DataFrame,
    plan: AnalysisPlan,
) -> ChartSpec:
    """
    Execute a declarative analysis plan using trusted pandas operations.

    The function never evaluates Python code supplied by the AI.
    """

    if plan.chart_type not in SUPPORTED_CHART_TYPES:
        raise AnalysisExecutionError(
            f"Chart type '{plan.chart_type}' is not supported yet."
        )

    working_df = df.copy()

    validate_plan_columns(working_df, plan)

    working_df = apply_filters(
        working_df,
        plan.filters,
    )

    if working_df.empty:
        raise AnalysisExecutionError(
            "No rows remain after applying the requested filters."
        )

    if plan.chart_type in {"scatter", "histogram"}:
        return execute_numeric_chart(working_df, plan)

    working_df, dimension_columns = prepare_dimensions(
        working_df,
        plan,
    )

    result = aggregate_data(
        working_df,
        plan,
        dimension_columns,
    )

    result = sort_result(result, plan)
    result = result.head(plan.row_limit)

    if result.empty:
        raise AnalysisExecutionError(
            "The analysis produced no chart data."
        )

    data = dataframe_to_chart_rows(result)

    first_dimension = plan.dimensions[0]

    return ChartSpec(
        id=build_chart_id(plan),
        type=plan.chart_type,
        title=build_chart_title(plan),
        subtitle=plan.intent,
        x_axis=ChartAxis(
            key=first_dimension.alias,
            label=humanize_label(first_dimension.alias),
            value_type=infer_axis_value_type(
                result[first_dimension.alias],
                first_dimension.time_granularity,
            ),
        ),
        series=[
            ChartSeries(
                key=measure.alias,
                label=humanize_label(measure.alias),
                format="number",
            )
            for measure in plan.measures
        ],
        data=data,
    )


def validate_plan_columns(
    df: pd.DataFrame,
    plan: AnalysisPlan,
) -> None:
    """
    Verify that every AI-selected column actually exists.
    """

    available_columns = set(df.columns.astype(str))

    requested_columns = {
        dimension.column
        for dimension in plan.dimensions
    }

    requested_columns.update(
        measure.column
        for measure in plan.measures
    )

    requested_columns.update(
        condition.column
        for condition in plan.filters
    )

    missing_columns = requested_columns - available_columns

    if missing_columns:
        missing = ", ".join(sorted(missing_columns))

        raise AnalysisExecutionError(
            f"The plan references missing columns: {missing}"
        )

    aliases = [
        dimension.alias
        for dimension in plan.dimensions
    ] + [
        measure.alias
        for measure in plan.measures
    ]

    if len(aliases) != len(set(aliases)):
        raise AnalysisExecutionError(
            "Dimension and measure aliases must be unique."
        )

    if len(plan.dimensions) != 1:
        raise AnalysisExecutionError(
            "The first chart version requires exactly one dimension."
        )

    if plan.chart_type in {"scatter", "histogram"}:
        numeric_columns = {dimension.column for dimension in plan.dimensions} | {measure.column for measure in plan.measures}
        for name in numeric_columns:
            if not pd.api.types.is_numeric_dtype(df[name]) or pd.api.types.is_bool_dtype(df[name]):
                raise AnalysisExecutionError(f"{plan.chart_type.title()} requires numeric columns; '{name}' is not numeric.")
        if plan.chart_type == "scatter" and plan.dimensions[0].column == plan.measures[0].column:
            raise AnalysisExecutionError("Choose two different numeric columns for a scatter plot.")

    for measure in plan.measures:
        series = df[measure.column]

        if (
            measure.aggregation
            in {"sum", "mean", "median", "min", "max"}
            and not pd.api.types.is_numeric_dtype(series)
        ):
            raise AnalysisExecutionError(
                f"Aggregation '{measure.aggregation}' requires a numeric "
                f"column, but '{measure.column}' is not numeric."
            )


def execute_numeric_chart(df: pd.DataFrame, plan: AnalysisPlan) -> ChartSpec:
    dimension = plan.dimensions[0]
    source_columns = [dimension.column] + [measure.column for measure in plan.measures]
    values = df[source_columns].replace([np.inf, -np.inf], np.nan).dropna()
    if values.empty:
        raise AnalysisExecutionError("No finite numeric observations remain for this chart.")
    if plan.chart_type == "scatter":
        if len(values) < 2 or any(values[column].nunique() < 2 for column in source_columns):
            raise AnalysisExecutionError("Scatter plots require at least two valid pairs and variation in both columns.")
        # A reproducible sample avoids displaying only the beginning of a large dataset.
        if len(values) > plan.row_limit:
            values = values.sample(n=plan.row_limit, random_state=0)
        measure = plan.measures[0]
        result = pd.DataFrame({dimension.alias: values[dimension.column], measure.alias: values[measure.column]})
        series = ChartSeries(key=measure.alias, label=measure.column, format="number")
        axis_type = "number"
        subtitle = f"Individual observations of {measure.column} against {dimension.column}; no aggregation."
    else:
        try:
            counts, edges = np.histogram(values[dimension.column].to_numpy(dtype=float), bins=plan.bin_count or min(10, plan.row_limit))
        except (ValueError, OverflowError, IndexError) as error:
            raise AnalysisExecutionError("The numeric range cannot be divided into bins. Try fewer bins or rescale the values.") from error
        if not np.isfinite(edges).all() or not np.all(np.diff(edges) > 0):
            raise AnalysisExecutionError("The numeric range cannot be divided into valid bins. Try fewer bins or rescale the values.")
        count_key = "count" if dimension.alias != "count" else "frequency"
        edge_labels = [f"{edge:.6g}" for edge in edges]
        if len(set(edge_labels)) != len(edge_labels):
            edge_labels = [f"{edge:.17g}" for edge in edges]
        rows = []
        for index, count in enumerate(counts):
            closing = "]" if index == len(counts) - 1 else ")"
            rows.append({dimension.alias: f"[{edge_labels[index]}, {edge_labels[index + 1]}{closing}", count_key: int(count)})
        result = pd.DataFrame(rows)
        series = ChartSeries(key=count_key, label="Count", format="integer")
        axis_type = "category"
        subtitle = "Frequency in equal-width bins; lower bounds included, upper bounds excluded except in the final bin."
    return ChartSpec(
        id=build_chart_id(plan), type=plan.chart_type,
        title=(f"Distribution of {dimension.column}" if plan.chart_type == "histogram" else f"{plan.measures[0].column} vs {dimension.column}")[:300],
        subtitle=subtitle[:500],
        x_axis=ChartAxis(key=dimension.alias, label=dimension.column[:200], value_type=axis_type),
        series=[series], data=dataframe_to_chart_rows(result),
    )


def apply_filters(
    df: pd.DataFrame,
    filters: list[FilterCondition],
) -> pd.DataFrame:
    """
    Apply only explicitly supported filtering operations.
    """

    result = df

    for condition in filters:
        column = result[condition.column]
        value = condition.value

        if condition.operator == "eq":
            mask = column == value

        elif condition.operator == "ne":
            mask = column != value

        elif condition.operator == "gt":
            require_filter_value(condition)
            mask = column > value

        elif condition.operator == "gte":
            require_filter_value(condition)
            mask = column >= value

        elif condition.operator == "lt":
            require_filter_value(condition)
            mask = column < value

        elif condition.operator == "lte":
            require_filter_value(condition)
            mask = column <= value

        elif condition.operator == "contains":
            if not isinstance(value, str):
                raise AnalysisExecutionError(
                    "'contains' requires a string value."
                )

            mask = (
                column.astype("string")
                .str.contains(value, case=False, regex=False, na=False)
            )

        elif condition.operator == "in":
            if not isinstance(value, list):
                raise AnalysisExecutionError(
                    "'in' requires a list value."
                )

            mask = column.isin(value)

        elif condition.operator == "between":
            if not isinstance(value, list) or len(value) != 2:
                raise AnalysisExecutionError(
                    "'between' requires exactly two values."
                )

            mask = column.between(
                value[0],
                value[1],
                inclusive="both",
            )

        elif condition.operator == "is_null":
            mask = column.isna()

        elif condition.operator == "is_not_null":
            mask = column.notna()

        else:
            raise AnalysisExecutionError(
                f"Unsupported filter operator: {condition.operator}"
            )

        result = result.loc[mask]

    return result


def require_filter_value(
    condition: FilterCondition,
) -> None:
    if condition.value is None or isinstance(condition.value, list):
        raise AnalysisExecutionError(
            f"Operator '{condition.operator}' requires one scalar value."
        )


def prepare_dimensions(
    df: pd.DataFrame,
    plan: AnalysisPlan,
) -> tuple[pd.DataFrame, list[str]]:
    """
    Copy or transform source dimensions into their safe aliases.
    """

    result = df.copy()
    dimension_columns: list[str] = []

    for dimension in plan.dimensions:
        source = result[dimension.column]

        if dimension.time_granularity is None:
            result[dimension.alias] = source
        else:
            dates = pd.to_datetime(
                source,
                errors="coerce",
            )

            if dates.notna().sum() == 0:
                raise AnalysisExecutionError(
                    f"Column '{dimension.column}' could not be parsed as dates."
                )

            result[dimension.alias] = convert_time_granularity(
                dates,
                dimension.time_granularity,
            )

        dimension_columns.append(dimension.alias)

    return result, dimension_columns


def convert_time_granularity(
    dates: pd.Series,
    granularity: str,
) -> pd.Series:
    if granularity == "day":
        return dates.dt.strftime("%Y-%m-%d")

    if granularity == "week":
        return dates.dt.to_period("W").astype("string")

    if granularity == "month":
        return dates.dt.to_period("M").astype("string")

    if granularity == "quarter":
        return dates.dt.to_period("Q").astype("string")

    if granularity == "year":
        return dates.dt.year.astype("Int64")

    raise AnalysisExecutionError(
        f"Unsupported time granularity: {granularity}"
    )


def aggregate_data(
    df: pd.DataFrame,
    plan: AnalysisPlan,
    dimension_columns: list[str],
) -> pd.DataFrame:
    """
    Group the dataframe and calculate measures using named aggregations.
    """

    named_aggregations: dict[str, pd.NamedAgg] = {}

    for measure in plan.measures:
        named_aggregations[measure.alias] = pd.NamedAgg(
            column=measure.column,
            aggfunc=aggregation_function(measure.aggregation),
        )

    result = (
        df.groupby(
            dimension_columns,
            dropna=False,
            observed=True,
        )
        .agg(**named_aggregations)
        .reset_index()
    )

    return result


def aggregation_function(aggregation: str) -> str:
    supported = {
        "sum": "sum",
        "mean": "mean",
        "median": "median",
        "min": "min",
        "max": "max",
        "count": "count",
        "nunique": "nunique",
    }

    try:
        return supported[aggregation]
    except KeyError as error:
        raise AnalysisExecutionError(
            f"Unsupported aggregation: {aggregation}"
        ) from error


def sort_result(
    result: pd.DataFrame,
    plan: AnalysisPlan,
) -> pd.DataFrame:
    if not plan.sort:
        return result

    columns: list[str] = []
    ascending: list[bool] = []

    for sort_rule in plan.sort:
        if sort_rule.column not in result.columns:
            raise AnalysisExecutionError(
                f"Cannot sort by unknown result column "
                f"'{sort_rule.column}'."
            )

        columns.append(sort_rule.column)
        ascending.append(sort_rule.direction == "asc")

    return result.sort_values(
        by=columns,
        ascending=ascending,
        kind="stable",
    )


def dataframe_to_chart_rows(
    df: pd.DataFrame,
) -> list[dict[str, Any]]:
    """
    Convert pandas and NumPy values into JSON-safe Python values.
    """

    rows: list[dict[str, Any]] = []

    for record in df.to_dict(orient="records"):
        rows.append(
            {
                str(key): json_safe_value(value)
                for key, value in record.items()
            }
        )

    return rows


def json_safe_value(value: Any) -> Any:
    if value is None or value is pd.NA:
        return None

    if isinstance(value, (pd.Timestamp, pd.Period)):
        return str(value)

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        value = float(value)

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, (str, int, bool)):
        return value

    if pd.isna(value):
        return None

    return str(value)


def infer_axis_value_type(
    series: pd.Series,
    time_granularity: str | None,
) -> str:
    if time_granularity is not None:
        return "date"

    if pd.api.types.is_numeric_dtype(series):
        return "number"

    return "category"


def build_chart_id(plan: AnalysisPlan) -> str:
    parts = [
        plan.chart_type,
        *[
            dimension.alias
            for dimension in plan.dimensions
        ],
        *[
            measure.alias
            for measure in plan.measures
        ],
    ]

    return "-".join(
        part.strip().lower().replace("_", "-").replace(" ", "-")
        for part in parts
    )


def build_chart_title(plan: AnalysisPlan) -> str:
    measure_labels = ", ".join(
        humanize_label(measure.alias)
        for measure in plan.measures
    )

    dimension_labels = ", ".join(
        humanize_label(dimension.alias)
        for dimension in plan.dimensions
    )

    return f"{measure_labels} by {dimension_labels}"


def humanize_label(value: str) -> str:
    return value.replace("_", " ").strip().title()
