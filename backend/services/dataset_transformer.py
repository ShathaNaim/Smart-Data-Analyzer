from __future__ import annotations

import ast
import os
import re
import uuid

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.dataset import Dataset
from backend.models.dataset_transformation import DatasetTransformation
from backend.services.dataset_profiler import json_safe_value


UPLOAD_FOLDER = "backend/uploads"


class DatasetAccessError(ValueError):
    pass


class TransformationError(ValueError):
    pass


BRACED_COLUMN_PATTERN = re.compile(r"\{([^{}]+)\}")
FORMULA_OPERATORS = {
    ast.Add: lambda left, right: left + right,
    ast.Sub: lambda left, right: left - right,
    ast.Mult: lambda left, right: left * right,
    ast.Div: lambda left, right: left / right,
}


def evaluate_formula(df: pd.DataFrame, expression: str):
    """Evaluate arithmetic only; names resolve exclusively to dataset columns."""
    aliases: dict[str, str] = {}

    def replace_braced_column(match: re.Match[str]) -> str:
        column_name = match.group(1)
        if column_name not in df.columns:
            raise TransformationError(f"Column '{column_name}' does not exist.")
        alias = f"__column_{len(aliases)}"
        aliases[alias] = column_name
        return alias

    normalized = BRACED_COLUMN_PATTERN.sub(replace_braced_column, expression.strip())
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError as error:
        raise TransformationError("The calculation formula is not valid.") from error

    def evaluate(node: ast.AST):
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.BinOp) and type(node.op) in FORMULA_OPERATORS:
            return FORMULA_OPERATORS[type(node.op)](evaluate(node.left), evaluate(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = evaluate(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, (int, float))
            and not isinstance(node.value, bool)
        ):
            return float(node.value)
        if isinstance(node, ast.Name):
            column_name = aliases.get(node.id, node.id)
            if column_name not in df.columns:
                raise TransformationError(f"Column '{column_name}' does not exist.")
            return pd.to_numeric(df[column_name], errors="coerce")
        raise TransformationError(
            "Formulas may contain only columns, numbers, parentheses, +, -, *, and /."
        )

    try:
        result = evaluate(tree)
    except ZeroDivisionError as error:
        raise TransformationError("The formula divides by zero.") from error
    if isinstance(result, pd.Series):
        return result.replace([np.inf, -np.inf], np.nan)
    if not np.isfinite(result):
        return np.nan
    return result


def get_owned_dataset(db: Session, dataset_id: uuid.UUID, owner_id: uuid.UUID) -> Dataset:
    statement = (
        select(Dataset)
        .options(selectinload(Dataset.transformations))
        .where(Dataset.id == dataset_id, Dataset.owner_id == owner_id)
    )
    dataset = db.scalar(statement)
    if dataset is None:
        raise DatasetAccessError("Dataset not found.")
    return dataset


def load_original_dataset(dataset: Dataset) -> pd.DataFrame:
    file_path = os.path.join(UPLOAD_FOLDER, dataset.stored_filename)
    if not os.path.isfile(file_path):
        raise DatasetAccessError("The stored dataset file could not be found.")
    if dataset.extension == ".csv":
        return pd.read_csv(file_path)
    return pd.read_excel(file_path, engine="openpyxl")


def apply_transformations(
    df: pd.DataFrame, transformations: list[DatasetTransformation]
) -> pd.DataFrame:
    result = df.copy()
    for transformation in transformations:
        config = transformation.config
        kind = transformation.transformation_type
        column = config["column_name"]
        if column not in result.columns:
            raise TransformationError(f"Column '{column}' no longer exists.")

        if kind == "hide_column":
            result = result.drop(columns=[column])
            continue

        target = config["new_column_name"].strip()
        if not target:
            raise TransformationError("Column names cannot be empty.")
        if kind == "calculated_column" and target in result.columns:
            raise TransformationError(f"Column '{target}' already exists.")
        if kind == "rename_column" and target != column and target in result.columns:
            raise TransformationError(f"Column '{target}' already exists.")

        if kind == "rename_column":
            result = result.rename(columns={column: target})
            continue

        if "expression" in config:
            result[target] = evaluate_formula(result, str(config["expression"]))
            continue

        left = pd.to_numeric(result[column], errors="coerce")
        if "right_column" in config:
            right_name = config["right_column"]
            if right_name not in result.columns:
                raise TransformationError(f"Column '{right_name}' no longer exists.")
            right = pd.to_numeric(result[right_name], errors="coerce")
        else:
            right = float(config["right_value"])

        operator = config["operator"]
        if operator == "add":
            calculated = left + right
        elif operator == "subtract":
            calculated = left - right
        elif operator == "multiply":
            calculated = left * right
        elif operator == "divide":
            calculated = left / right
            calculated = calculated.replace([np.inf, -np.inf], np.nan)
        else:
            raise TransformationError("Unsupported calculation operator.")
        result[target] = calculated
    return result


def load_working_dataset(dataset: Dataset) -> pd.DataFrame:
    return apply_transformations(load_original_dataset(dataset), dataset.transformations)


def json_safe_records(df: pd.DataFrame) -> list[dict[str, object | None]]:
    return [
        {str(column): json_safe_value(value) for column, value in row.items()}
        for row in df.to_dict(orient="records")
    ]
