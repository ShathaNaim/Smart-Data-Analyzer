from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def build_dataset_profile(
    df: pd.DataFrame,
) -> dict[str, Any]:
    """
    Build a safe statistical profile without using AI.

    The complete dataset is never returned. Only metadata, summary
    statistics, and up to five sample values per column are included.
    """

    columns: list[dict[str, Any]] = []

    for original_column_name in df.columns:
        column_name = str(original_column_name)
        series = df[original_column_name]

        non_null_series = series.dropna()
        non_null_count = int(series.notna().sum())
        unique_count = int(series.nunique(dropna=True))

        column_profile: dict[str, Any] = {
            "name": column_name,
            "data_type": str(series.dtype),
            "missing_values": int(series.isna().sum()),
            "non_null_values": non_null_count,
            "unique_values": unique_count,
            "unique_ratio": (
                round(unique_count / non_null_count, 4)
                if non_null_count > 0
                else 0
            ),
            "sample_values": [
                json_safe_value(value)
                for value in (
                    non_null_series
                    .drop_duplicates()
                    .head(5)
                    .tolist()
                )
            ],
            "numeric_statistics": None,
            "date_parse_ratio": calculate_date_parse_ratio(series),
            "average_text_length": calculate_average_text_length(series),
        }

        if pd.api.types.is_numeric_dtype(series):
            column_profile["numeric_statistics"] = {
                "minimum": json_safe_value(non_null_series.min()),
                "maximum": json_safe_value(non_null_series.max()),
                "mean": json_safe_value(non_null_series.mean()),
                "median": json_safe_value(non_null_series.median()),
                "zero_values": int(series.eq(0).sum()),
                "negative_values": int(series.lt(0).sum()),
            }

        columns.append(column_profile)

    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": columns,
    }


def calculate_date_parse_ratio(
    series: pd.Series,
) -> float | None:
    """
    Estimate whether a text column contains dates.

    Numeric columns are excluded because pandas may interpret ordinary
    numbers as timestamps.
    """

    if pd.api.types.is_datetime64_any_dtype(series):
        return 1.0

    if not (
        pd.api.types.is_object_dtype(series)
        or pd.api.types.is_string_dtype(series)
    ):
        return None

    values = series.dropna()

    if values.empty:
        return None

    parsed_values = pd.to_datetime(
        values,
        errors="coerce",
    )

    return round(
        float(parsed_values.notna().mean()),
        4,
    )


def calculate_average_text_length(
    series: pd.Series,
) -> float | None:
    """Calculate average text length for string-like columns."""

    if not (
        pd.api.types.is_object_dtype(series)
        or pd.api.types.is_string_dtype(series)
    ):
        return None

    values = series.dropna().astype(str)

    if values.empty:
        return None

    return round(
        float(values.str.len().mean()),
        2,
    )


def json_safe_value(value: Any) -> Any:
    """Convert pandas and NumPy scalar values into JSON-safe values."""

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