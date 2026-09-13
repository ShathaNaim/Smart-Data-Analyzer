import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.dataset import preview_transformation_endpoint, create_transformation_endpoint
from backend.schemas.dataset_transformation import TransformationCreate
from backend.services.dataset_transformer import apply_transformations, TransformationError


class ColumnRemovalTests(unittest.TestCase):
    def setUp(self):
        self.frame = pd.DataFrame({"a": [1, 2], "b": [3, 4], "c": [5, 6]})
        self.request = TransformationCreate(transformation_type="hide_column", column_names=["a", "c"])

    def test_removal_preserves_rows_original_and_supports_undo(self):
        change = SimpleNamespace(transformation_type="hide_column", config=self.request.to_config())
        result = apply_transformations(self.frame, [change])
        pd.testing.assert_frame_equal(result, self.frame[["b"]])
        pd.testing.assert_frame_equal(apply_transformations(self.frame, []), self.frame)
        self.assertEqual(self.frame.columns.tolist(), ["a", "b", "c"])

    def test_invalid_selection_and_last_column(self):
        for names in [["a", "b", "c"], ["missing"]]:
            with self.assertRaises(TransformationError):
                apply_transformations(self.frame, [SimpleNamespace(transformation_type="hide_column", config={"column_names": names})])
        with self.assertRaises(TransformationError):
            apply_transformations(self.frame[["a"]], [SimpleNamespace(transformation_type="hide_column", config={"column_name": "a"})])

    def test_schema_rejects_empty_duplicate_or_ambiguous_selection(self):
        for config in [{"column_names": []}, {"column_names": ["a", "a"]}, {"column_names": ["a"], "column_name": "b"}, {}]:
            with self.assertRaises(ValidationError):
                TransformationCreate(transformation_type="hide_column", **config)

    def test_preview_returns_columns_and_does_not_save(self):
        db = Mock()
        dataset = SimpleNamespace(transformations=[])
        with patch("backend.app.api.dataset.get_owned_dataset", return_value=dataset), patch("backend.app.api.dataset.load_working_dataset", return_value=self.frame):
            result = preview_transformation_endpoint(uuid.uuid4(), self.request, db, uuid.uuid4())
        self.assertEqual(result["removed_columns"], ["a", "c"])
        self.assertEqual(result["columns_after"], ["b"])
        self.assertEqual(result["rows_after"], 2)
        self.assertEqual(result["revision"], "")
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_apply_requires_preview_and_rejects_stale_revision(self):
        db = Mock()
        with self.assertRaises(HTTPException) as missing:
            create_transformation_endpoint(uuid.uuid4(), self.request, db, uuid.uuid4())
        self.assertEqual(missing.exception.status_code, 422)
        self.request.expected_revision = "old"
        with patch("backend.app.api.dataset.get_owned_dataset", return_value=SimpleNamespace(transformations=[])), patch("backend.app.api.dataset.load_original_dataset", return_value=self.frame):
            with self.assertRaises(HTTPException) as stale:
                create_transformation_endpoint(uuid.uuid4(), self.request, db, uuid.uuid4())
        self.assertEqual(stale.exception.status_code, 409)
        db.add.assert_not_called()
