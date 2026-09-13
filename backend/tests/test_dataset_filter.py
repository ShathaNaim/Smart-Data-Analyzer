import unittest

import pandas as pd

from backend.schemas.dataset_transformation import DatasetFilterCondition
from backend.services.dataset_filter import (
    DatasetFilterError,
    apply_dataset_filters,
)
from types import SimpleNamespace

from backend.schemas.dataset_transformation import TransformationCreate
from backend.services.dataset_transformer import apply_transformations

class DatasetFilterTests(unittest.TestCase):
    def test_all_conditions_must_match(self):
        source = pd.DataFrame({
            "department": [
                "Industrial",
                "Industrial",
                "Mechanical",
            ],
            "students": [90, 15, 50],
        })

        conditions = [
            DatasetFilterCondition(
                column_name="department",
                operator="eq",
                value="Industrial",
            ),
            DatasetFilterCondition(
                column_name="students",
                operator="gt",
                value=20,
            ),
        ]

        result = apply_dataset_filters(source, conditions)

        self.assertEqual(result.index.tolist(), [0])
        self.assertEqual(result["students"].tolist(), [90])
        self.assertEqual(len(source), 3)



    def test_missing_values_require_explicit_selection(self):
        source = pd.DataFrame({
            "department": ["Industrial", None, "Mechanical"],
        })

        result = apply_dataset_filters(source, [
            DatasetFilterCondition(
                column_name="department",
                operator="ne",
                value="Industrial",
            ),
        ])
        self.assertEqual(result.index.tolist(), [2])

        missing = apply_dataset_filters(source, [
            DatasetFilterCondition(
                column_name="department",
                operator="is_null",
            ),
        ])
        self.assertEqual(missing.index.tolist(), [1])

    def test_between_includes_both_endpoints(self):
        source = pd.DataFrame({
            "students": [19, 20, 25, 30, 31, None],
        })

        result = apply_dataset_filters(source, [
            DatasetFilterCondition(
                column_name="students",
                operator="between",
                value=[20, 30],
            ),
        ])

        self.assertEqual(result.index.tolist(), [1, 2, 3])


    def test_invalid_filters_are_rejected(self):
        source = pd.DataFrame({
            "department": ["Industrial", "Mechanical"],
            "students": [90, 22],
        })

        invalid_conditions = [
            DatasetFilterCondition(
                column_name="missing_column",
                operator="eq",
                value="Industrial",
            ),
            DatasetFilterCondition(
                column_name="students",
                operator="between",
                value=[30, 20],
            ),
            DatasetFilterCondition(
                column_name="department",
                operator="gt",
                value=20,
            ),
        ]

        for condition in invalid_conditions:
            with self.subTest(condition=condition):
                with self.assertRaises(DatasetFilterError):
                    apply_dataset_filters(source, [condition])

    def test_saved_filter_and_undo(self):
        source = pd.DataFrame({
            "department": ["Industrial", "Mechanical"],
            "students": [90, 22],
        })

        request = TransformationCreate(
            transformation_type="filter_rows",
            filters=[
                DatasetFilterCondition(
                    column_name="students",
                    operator="gt",
                    value=30,
                ),
            ],
        )

        saved_change = SimpleNamespace(
            transformation_type=request.transformation_type,
            config=request.to_config(),
        )

        result = apply_transformations(source, [saved_change])
        self.assertEqual(result.index.tolist(), [0])

        restored = apply_transformations(source, [])
        pd.testing.assert_frame_equal(restored, source)

    if __name__ == "__main__":
        unittest.main()