"""Shared chart-selection rules for questions and proactive suggestions."""

CHART_GUIDANCE = """
Supported chart capabilities and selection rules:
- Choose the simplest chart that answers the analytical question; advanced
  charts are optional, never a diversity quota. Explain why the choice is useful.
- bar: categorical comparisons; one dimension and 1-5 aggregated measures.
- line: trends over real dates; one time dimension and aggregated measures.
- area: additive volume over real dates; avoid implying unrelated totals.
- pie: composition, one non-negative aggregated measure and few categories.
- scatter: explore a relationship between TWO DIFFERENT numeric, non-boolean,
  non-identifier columns with variation and sufficient paired observations.
  The dimension is raw X, one measure is raw Y with aggregation="none".
  Never group or average scatter observations. Use no date grouping and sort=[].
  Use row_limit=1000 unless the user specifies a smaller point limit.
  Missing/infinite pairs are excluded; large datasets use a reproducible sample.
  Do not claim causation or invent a correlation statistic.
- histogram: understand distribution, spread, or concentration of ONE numeric,
  non-boolean, non-identifier column. The dimension is that numeric column;
  measures=[]; sort=[]; no date grouping. Set bin_count=10 initially (2-50)
  and row_limit >= bin_count. All valid observations are counted, not sampled.
  Counts use equal-width bins; the upper endpoint belongs to the next bin,
  except the final upper endpoint is included. Constant values are allowed.
- Set bin_count=null for all other chart types. aggregation="none" is allowed
  only for scatter. Existing grouped charts and KPIs require aggregation.
- For numeric X vs numeric Y relationship requests, consider scatter before
  grouped averages. For frequency/distribution requests, consider histogram.
- Prefer bar when comparing numeric summaries across named categories.
- If metadata cannot establish numeric suitability or the user's intended
  variables, ask a focused clarification (questions) or omit the suggestion.
"""
