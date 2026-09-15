import unittest
import uuid
from unittest.mock import Mock, patch

import pandas as pd
from pydantic import ValidationError

from backend.schemas.question import ChartAnalysisPlan
from backend.services.analysis_executor import AnalysisExecutionError, execute_analysis_plan
from backend.services.warning_generator import generate_analysis_warnings


def plan(kind, **overrides):
    return ChartAnalysisPlan.model_validate({
        "output_type": "chart", "intent": "Explore numeric observations",
        "chart_type": kind,
        "dimensions": [{"column": "x", "alias": "x_value", "time_granularity": None}],
        "measures": [{"column": "y", "alias": "y_value", "aggregation": "none"}] if kind == "scatter" else [],
        "row_limit": 1000, "filters": [], "sort": [], "assumptions": [],
        "bin_count": 2 if kind == "histogram" else None,
        **overrides,
    })


class AdvancedChartTests(unittest.TestCase):
    def test_scatter_preserves_pairs_and_repeated_x(self):
        frame = pd.DataFrame({"x": [1, 1, 2, None, 4], "y": [2, 3, 4, 5, float("inf")]})
        chart = execute_analysis_plan(frame, plan("scatter"))
        self.assertEqual(chart.data, [
            {"x_value": 1.0, "y_value": 2.0},
            {"x_value": 1.0, "y_value": 3.0},
            {"x_value": 2.0, "y_value": 4.0},
        ])
        warnings = generate_analysis_warnings(frame, plan("scatter"), chart)
        self.assertTrue(any("2 rows" in warning for warning in warnings))

    def test_sampling_is_reproducible_and_disclosed(self):
        frame = pd.DataFrame({"x": range(100), "y": range(100)})
        request = plan("scatter", row_limit=5)
        first = execute_analysis_plan(frame, request)
        second = execute_analysis_plan(frame, request)
        self.assertEqual(first.data, second.data)
        self.assertEqual(len(first.data), 5)
        self.assertTrue(any("sample" in warning for warning in generate_analysis_warnings(frame, request, first)))

    def test_histogram_counts_all_values_and_includes_final_endpoint(self):
        frame = pd.DataFrame({"x": [0, 1, 2, 3, 4, None, float("inf")]})
        chart = execute_analysis_plan(frame, plan("histogram"))
        self.assertEqual([row["count"] for row in chart.data], [2, 3])
        self.assertEqual([row["x_value"] for row in chart.data], ["[0, 2)", "[2, 4]"])

    def test_histogram_constant_values_and_empty_bins(self):
        chart = execute_analysis_plan(pd.DataFrame({"x": [7, 7, 7]}), plan("histogram", bin_count=4))
        self.assertEqual(sum(row["count"] for row in chart.data), 3)
        self.assertEqual(len(chart.data), 4)
        self.assertEqual(sum(row["count"] == 0 for row in chart.data), 3)

    def test_invalid_numeric_data_is_rejected(self):
        for kind in ("scatter", "histogram"):
            for values in (["A", "B"], [True, False], [float("nan"), float("inf")]):
                with self.subTest(kind=kind, values=values), self.assertRaises(AnalysisExecutionError):
                    execute_analysis_plan(pd.DataFrame({"x": values, "y": [1, 2]}), plan(kind))

    def test_scatter_requires_variation(self):
        with self.assertRaises(AnalysisExecutionError):
            execute_analysis_plan(pd.DataFrame({"x": [1, 1], "y": [2, 3]}), plan("scatter"))

    def test_schema_rejects_incompatible_calculations(self):
        cases = [
            ("scatter", {"measures": [{"column": "y", "alias": "y_value", "aggregation": "mean"}]}),
            ("histogram", {"bin_count": 51}),
            ("histogram", {"sort": [{"column": "x_value", "direction": "asc"}]}),
            ("histogram", {"bin_count": 10, "row_limit": 5}),
            ("histogram", {"bin_count": None, "row_limit": 1}),
            ("scatter", {"row_limit": 1}),
        ]
        for kind, overrides in cases:
            with self.subTest(kind=kind, overrides=overrides), self.assertRaises(ValidationError):
                plan(kind, **overrides)

    def test_both_ai_flows_use_shared_chart_guidance(self):
        from backend.services.chart_guidance import CHART_GUIDANCE
        from backend.services.analysis_planner import SYSTEM_PROMPT as question_prompt
        from backend.services.analysis_suggester import SYSTEM_PROMPT as suggestion_prompt
        self.assertIn(CHART_GUIDANCE, question_prompt)
        self.assertIn(CHART_GUIDANCE, suggestion_prompt)

    def test_preview_and_dashboard_round_trip(self):
        from backend.app.api.analysis import preview_analysis_suggestion
        from backend.schemas.suggestion_preview import SuggestionPreviewRequest
        from backend.schemas.dashboard import DashboardItemSave
        frame = pd.DataFrame({"x": [1, 2, 3], "y": [5, 7, 9]})
        for kind in ("scatter", "histogram"):
            with self.subTest(kind=kind):
                request = SuggestionPreviewRequest(output_type="chart", chart_plan=plan(kind), kpi_plan=None)
                with patch("backend.app.api.analysis.load_owned_dataset", return_value=(frame, None)):
                    response = preview_analysis_suggestion("dataset", request, Mock(), uuid.uuid4())
                saved = DashboardItemSave(title=response.chart.title, chart_spec=response.chart)
                restored = DashboardItemSave.model_validate_json(saved.model_dump_json())
                self.assertEqual(restored.chart_spec.type, kind)
                self.assertEqual(restored.chart_spec.data, response.chart.data)
