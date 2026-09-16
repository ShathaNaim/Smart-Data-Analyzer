import unittest
import uuid
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import HTTPException

from backend.app.api.analysis import preview_analysis_suggestion
from backend.schemas.suggestion_preview import SuggestionPreviewRequest


class ManualChartPreviewTests(unittest.TestCase):
    def preview(self, chart_type="bar", aggregation="sum", measure="sales", granularity=None):
        request = SuggestionPreviewRequest.model_validate({
            "output_type": "chart",
            "kpi_plan": None,
            "chart_plan": {
                "output_type": "chart", "intent": "Manual chart",
                "chart_type": chart_type,
                "dimensions": [{"column": "date" if granularity else "region", "alias": "manual_category", "time_granularity": granularity}],
                "measures": [{"column": measure, "alias": "manual_value", "aggregation": aggregation}],
                "sort": [{"column": "manual_value", "direction": "desc"}],
                "row_limit": 1, "filters": [], "assumptions": [],
            },
        })
        frame = pd.DataFrame({
            "region": ["A", "B", "A"], "sales": [10, 25, 20],
            "date": ["2026-01-01", "2026-02-01", "2026-01-20"],
        })
        with patch("backend.app.api.analysis.load_owned_dataset", return_value=(frame, None)):
            return preview_analysis_suggestion("dataset", request, Mock(), uuid.uuid4())

    def test_all_chart_types_aggregate_sort_and_limit(self):
        for chart_type in ("bar", "line", "area", "pie", "donut", "horizontal_bar"):
            with self.subTest(chart_type=chart_type):
                response = self.preview(chart_type)
                self.assertEqual(response.chart.type, chart_type)
                self.assertEqual(response.chart.data, [{"manual_category": "A", "manual_value": 30}])

    def test_date_grouping(self):
        response = self.preview("line", granularity="month")
        self.assertEqual(response.chart.data[0]["manual_value"], 30)
        self.assertIn("2026-01", str(response.chart.data[0]["manual_category"]))

    def test_count_accepts_text_columns(self):
        response = self.preview(aggregation="count", measure="region")
        self.assertEqual(response.chart.data[0]["manual_value"], 2)

    def test_numeric_calculation_rejects_text_columns(self):
        with self.assertRaises(HTTPException) as context:
            self.preview(aggregation="mean", measure="region")
        self.assertEqual(context.exception.status_code, 422)
        self.assertIn("numeric", context.exception.detail)
