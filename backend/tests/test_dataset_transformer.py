import unittest
from types import SimpleNamespace

import pandas as pd

from backend.services.dataset_transformer import (
    TransformationError,
    apply_transformations,
    evaluate_formula,
    json_safe_records,
)


def transformation(kind: str, **config):
    return SimpleNamespace(transformation_type=kind, config=config)


class DatasetTransformerTests(unittest.TestCase):
    def test_trim_preserves_missing_numbers_and_original(self) -> None:
        source = pd.DataFrame({"mixed": [" Amman ", None, 42, "  "], "number": pd.Series([1, None, 3, 4], dtype="Int64")})
        result = apply_transformations(source, [
            transformation("trim_whitespace", column_name="mixed"),
            transformation("trim_whitespace", column_name="number"),
        ])
        self.assertEqual(result["mixed"].tolist(), ["Amman", None, 42, ""])
        pd.testing.assert_series_equal(result["number"], source["number"])
        self.assertEqual(source["mixed"].iloc[0], " Amman ")

    def test_duplicates_keep_first_and_undo_by_replay(self) -> None:
        source = pd.DataFrame({"city": [" Amman", "Amman", "Amman"], "value": [1, 1, 2]})
        trim = transformation("trim_whitespace", column_name="city")
        result = apply_transformations(source, [trim, transformation("remove_duplicates")])
        self.assertEqual(result.index.tolist(), [0, 2])
        self.assertEqual(result["value"].tolist(), [1, 2])
        self.assertEqual(len(apply_transformations(source, [trim])), 3)
        self.assertEqual(len(source), 3)

    def test_evaluates_chained_formula_with_parentheses(self) -> None:
        source = pd.DataFrame(
            {"col1": [2, 3], "col2": [4, 5], "col3": [1, 2]}
        )

        result = evaluate_formula(source, "col1 * 10 - col2 + col3")

        self.assertEqual(result.tolist(), [17.0, 27.0])

    def test_braces_support_column_names_with_spaces(self) -> None:
        source = pd.DataFrame({"Unit Price": [5, 8], "quantity": [2, 3]})

        result = evaluate_formula(source, "{Unit Price} * quantity")

        self.assertEqual(result.tolist(), [10.0, 24.0])

    def test_formula_rejects_function_calls(self) -> None:
        source = pd.DataFrame({"value": [1]})

        with self.assertRaisesRegex(TransformationError, "only columns"):
            evaluate_formula(source, "__import__('os').system('whoami')")

    def test_applies_calculation_rename_and_hide_in_order(self) -> None:
        source = pd.DataFrame({"revenue": [10, 20], "cost": [4, 5]})
        result = apply_transformations(
            source,
            [
                transformation(
                    "calculated_column",
                    column_name="revenue",
                    new_column_name="profit",
                    operator="subtract",
                    right_column="cost",
                ),
                transformation(
                    "rename_column", column_name="profit", new_column_name="net"
                ),
                transformation("hide_column", column_name="cost"),
            ],
        )

        self.assertEqual(result.columns.tolist(), ["revenue", "net"])
        self.assertEqual(result["net"].tolist(), [6, 15])
        self.assertEqual(source.columns.tolist(), ["revenue", "cost"])

    def test_rejects_overwriting_an_existing_column(self) -> None:
        source = pd.DataFrame({"revenue": [10], "cost": [4]})
        with self.assertRaisesRegex(TransformationError, "already exists"):
            apply_transformations(
                source,
                [
                    transformation(
                        "calculated_column",
                        column_name="revenue",
                        new_column_name="cost",
                        operator="add",
                        right_value=1,
                    )
                ],
            )

    def test_division_by_zero_becomes_json_null(self) -> None:
        source = pd.DataFrame({"value": [4, 5], "divisor": [2, 0]})
        result = apply_transformations(
            source,
            [
                transformation(
                    "calculated_column",
                    column_name="value",
                    new_column_name="ratio",
                    operator="divide",
                    right_column="divisor",
                )
            ],
        )

        records = json_safe_records(result)
        self.assertEqual(records[0]["ratio"], 2.0)
        self.assertIsNone(records[1]["ratio"])


if __name__ == "__main__":
    unittest.main()
