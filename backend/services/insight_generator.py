
from backend.services.performance import timed_stage
from backend.schemas.question import ChartSpec

@timed_stage("draft_insight")
def generate_chart_insight(chart: ChartSpec) -> str:
    if not chart.data or not chart.series:
        return "The analysis completed, but no result was available."

    dimension_key = chart.x_axis.key
    series = chart.series[0]
    measure_key = series.key

    numeric_rows = [
        row
        for row in chart.data
        if isinstance(row.get(measure_key), (int, float))
    ]

    if not numeric_rows:
        return "The analysis completed, but no numeric result was available."

    highest_row = max(
        numeric_rows,
        key=lambda row: row[measure_key],
    )

    category = highest_row.get(dimension_key)
    value = highest_row[measure_key]

    return (
    f"The highest {series.label.lower()} was "
    f"{value:,.2f} for {chart.x_axis.label} {category}."
)
