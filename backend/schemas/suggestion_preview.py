from __future__ import annotations

from typing import Literal

from pydantic import model_validator

from backend.schemas.question import (
    ChartAnalysisPlan,
    ChartSpec,
    KpiAnalysisPlan,
    KpiSpec,
    StrictSchema,
)


class SuggestionPreviewRequest(StrictSchema):
    output_type: Literal["chart", "kpi"]

    chart_plan: ChartAnalysisPlan | None = None
    kpi_plan: KpiAnalysisPlan | None = None

    @model_validator(mode="after")
    def validate_selected_plan(
        self,
    ) -> "SuggestionPreviewRequest":
        if self.output_type == "chart":
            if self.chart_plan is None:
                raise ValueError(
                    "A chart preview requires chart_plan."
                )

            if self.kpi_plan is not None:
                raise ValueError(
                    "A chart preview cannot include kpi_plan."
                )

        if self.output_type == "kpi":
            if self.kpi_plan is None:
                raise ValueError(
                    "A KPI preview requires kpi_plan."
                )

            if self.chart_plan is not None:
                raise ValueError(
                    "A KPI preview cannot include chart_plan."
                )

        return self


class SuggestionPreviewResponse(StrictSchema):
    output_type: Literal["chart", "kpi"]

    chart: ChartSpec | None = None
    kpi: KpiSpec | None = None

    warnings: list[str] = []

    @model_validator(mode="after")
    def validate_preview_result(
        self,
    ) -> "SuggestionPreviewResponse":
        if self.output_type == "chart":
            if self.chart is None or self.kpi is not None:
                raise ValueError(
                    "A chart preview must contain only a chart."
                )

        if self.output_type == "kpi":
            if self.kpi is None or self.chart is not None:
                raise ValueError(
                    "A KPI preview must contain only a KPI."
                )

        return self