import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd

from backend.app.api.dataset import filter_values_endpoint, preview_transformation_endpoint
from backend.schemas.dataset_transformation import DatasetFilterCondition, TransformationCreate
from backend.services.dataset_filter import apply_dataset_filters


class HeaderFilterTests(unittest.TestCase):
    def test_selection_preserves_types_and_combines_missing(self):
        frame = pd.DataFrame({'value': [1, 2, None, 3]})
        for operator, values, missing, expected in [
            ('one_of', [1, 3], True, [0, 2, 3]),
            ('one_of', [], False, []),
            ('one_of', [], True, [2]),
            ('none_of', [1], True, [1, 2, 3]),
            ('none_of', [], False, [0, 1, 3]),
        ]:
            with self.subTest(operator=operator, values=values, missing=missing):
                condition = DatasetFilterCondition(column_name='value', operator=operator,
                    value=values, include_missing=missing)
                self.assertEqual(apply_dataset_filters(frame, [condition]).index.tolist(), expected)
        booleans = pd.DataFrame({'value': [True, False, None]})
        condition = DatasetFilterCondition(column_name='value', operator='one_of', value=[False])
        self.assertEqual(apply_dataset_filters(booleans, [condition]).index.tolist(), [1])

    def test_values_search_and_paging_use_entire_dataset(self):
        frame = pd.DataFrame({'value': list(range(150)) + [None, 1]})
        with patch('backend.app.api.dataset.get_owned_dataset'), patch('backend.app.api.dataset.load_working_dataset', return_value=frame):
            result = filter_values_endpoint(uuid.uuid4(), 'value', '', 100, 100, Mock(), uuid.uuid4())
            self.assertEqual(result['values'], list(range(100, 150)))
            self.assertTrue(result['has_missing'])
            self.assertFalse(result['has_more'])
            result = filter_values_endpoint(uuid.uuid4(), 'value', '149', 0, 100, Mock(), uuid.uuid4())
            self.assertEqual(result['values'], [149])

    def test_preview_paginates_without_saving_and_allows_zero_matches(self):
        frame = pd.DataFrame({'value': list(range(60))})
        dataset = SimpleNamespace(transformations=[])
        db = Mock()
        request = TransformationCreate(transformation_type='filter_rows', filters=[
            {'column_name': 'value', 'operator': 'none_of', 'value': [0]}])
        with patch('backend.app.api.dataset.get_owned_dataset', return_value=dataset), patch('backend.app.api.dataset.load_working_dataset', return_value=frame):
            result = preview_transformation_endpoint(uuid.uuid4(), request, db, uuid.uuid4(), page=2, page_size=20)
            self.assertEqual(result['rows_after'], 59)
            self.assertEqual(result['preview'][0]['value'], 21)
            self.assertEqual(result['total_pages'], 3)
            request.filters[0].operator = 'one_of'
            request.filters[0].value = []
            result = preview_transformation_endpoint(uuid.uuid4(), request, db, uuid.uuid4())
            self.assertFalse(result['can_apply'])
            self.assertEqual(result['preview'], [])
        db.add.assert_not_called()
        db.commit.assert_not_called()
