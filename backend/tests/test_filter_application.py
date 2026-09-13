import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.dataset import create_transformation_endpoint
from backend.app.api.analysis import load_owned_dataset
from backend.schemas.dataset_transformation import TransformationCreate
from backend.services.ai_cache import input_fingerprint


class FilterApplicationTests(unittest.TestCase):
    def setUp(self):
        self.dataset = SimpleNamespace(id=uuid.uuid4(), transformations=[], description=None,
                                       stored_filename="test.csv", file_size=10)
        self.owner = uuid.uuid4()
        self.frame = pd.DataFrame({"department": ["Industrial", "Mechanical"]})
        self.request = TransformationCreate(transformation_type="filter_rows", expected_revision="",
            filters=[{"column_name": "department", "operator": "eq", "value": "Industrial"}])

    def test_saved_filter_reaches_analysis_and_changes_cache_key(self):
        db = Mock()
        def refresh(record):
            record.id = uuid.uuid4()
            record.created_at = datetime.now(timezone.utc)
        db.refresh.side_effect = refresh
        before = input_fingerprint(self.dataset)
        with patch("backend.app.api.dataset.get_owned_dataset", return_value=self.dataset), patch("backend.app.api.dataset.load_original_dataset", return_value=self.frame):
            result = create_transformation_endpoint(self.dataset.id, self.request, db, self.owner)
        db.commit.assert_called_once()
        saved = db.add.call_args.args[0]
        self.assertEqual(result.transformation_type, "filter_rows")
        self.dataset.transformations = [saved]
        self.assertNotEqual(before, input_fingerprint(self.dataset))
        with patch("backend.app.api.analysis.get_owned_dataset", return_value=self.dataset), patch("backend.services.dataset_transformer.load_original_dataset", return_value=self.frame):
            filtered, _ = load_owned_dataset(str(self.dataset.id), db, self.owner)
        self.assertEqual(filtered["department"].tolist(), ["Industrial"])
        self.dataset.transformations = []
        self.assertEqual(before, input_fingerprint(self.dataset))

    def test_empty_and_stale_filters_are_not_saved(self):
        for revision, value, status in [("old", "Industrial", 409), ("", "Missing", 422)]:
            with self.subTest(status=status):
                db = Mock()
                self.request.expected_revision = revision
                self.request.filters[0].value = value
                with patch("backend.app.api.dataset.get_owned_dataset", return_value=self.dataset), patch("backend.app.api.dataset.load_original_dataset", return_value=self.frame):
                    with self.assertRaises(HTTPException) as raised:
                        create_transformation_endpoint(self.dataset.id, self.request, db, self.owner)
                self.assertEqual(raised.exception.status_code, status)
                db.add.assert_not_called()
                db.commit.assert_not_called()

    def test_filter_conditions_are_required_and_cannot_attach_to_other_operations(self):
        with self.assertRaises(ValidationError):
            TransformationCreate(transformation_type="filter_rows")
        with self.assertRaises(ValidationError):
            TransformationCreate(transformation_type="remove_duplicates", filters=self.request.filters)
