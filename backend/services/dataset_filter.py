import pandas as pd

from backend.schemas.dataset_transformation import DatasetFilterCondition


class DatasetFilterError(ValueError):
    """Raised when a filter cannot be applied to the dataset."""

def build_filter_mask(
    column: pd.Series,
    condition: DatasetFilterCondition,
) -> pd.Series:
    if condition.operator == "is_null":
        return column.isna()

    if condition.operator == "is_not_null":
        return column.notna()

    if condition.operator == "contains":
        return (
            column.astype("string")
            .str.contains(
                condition.value,
                case=False,
                regex=False,
                na=False,
            )
        )

    if condition.operator == "eq":
        return column.notna() & column.eq(condition.value).fillna(False)

    if condition.operator == "ne":
        return column.notna() & column.ne(condition.value).fillna(False)

    if condition.operator == "in":
        return column.notna() & column.isin(condition.value)

    if condition.operator == "none_of":
        return (column.notna() & ~column.isin(condition.value)) | (
            column.isna() & condition.include_missing
        )

    if condition.operator == "one_of":
        return (column.notna() & column.isin(condition.value)) | (
            column.isna() & condition.include_missing
        )

    if condition.operator in ("gt", "gte", "lt", "lte", "between"):
        if (
            not pd.api.types.is_numeric_dtype(column)
            or pd.api.types.is_bool_dtype(column)
        ):
            raise DatasetFilterError(
                "These comparison filters currently require a numeric column."
            )

        values = (
            condition.value
            if isinstance(condition.value, list)
            else [condition.value]
        )

        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise DatasetFilterError(
                    "Enter numeric values for this filter."
                )

        if condition.operator == "between":
            lower, upper = values

            if lower > upper:
                raise DatasetFilterError(
                    "The start value must not exceed the end value."
                )

            mask = column.between(lower, upper, inclusive="both")
        else:
            value = values[0]

            if condition.operator == "gt":
                mask = column > value
            elif condition.operator == "gte":
                mask = column >= value
            elif condition.operator == "lt":
                mask = column < value
            else:
                mask = column <= value

        return column.notna() & mask.fillna(False)

    raise DatasetFilterError(
        f"Filter operator '{condition.operator}' is not implemented yet."
    )

def apply_dataset_filters(
    df: pd.DataFrame,
    filters: list[DatasetFilterCondition],
) -> pd.DataFrame:
    if not filters:
        raise DatasetFilterError("Add at least one filter condition.")

    result = df.copy()

    for condition in filters:
        if condition.column_name not in result.columns:
            raise DatasetFilterError(
                f"Column '{condition.column_name}' no longer exists."
            )

        try:
            mask = build_filter_mask(
                result[condition.column_name],
                condition,
            )
        except (TypeError, ValueError) as error:
            raise DatasetFilterError(
                f"Cannot apply '{condition.operator}' to "
                f"column '{condition.column_name}': {error}"
            ) from error

        result = result.loc[mask]

    return result
