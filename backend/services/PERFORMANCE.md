Performance timings appear in the backend's normal Uvicorn INFO logs. Restart
the backend to load the instrumentation; no database migration is needed.
The logger name is `uvicorn.error.performance`. Custom logging configurations
must enable INFO for this logger and route it to a handler.

Example format (illustrative, not measured):

```text
performance request_id=abc stage=file_download duration_ms=1200.00 outcome=ok
performance request_id=abc stage=spreadsheet_parse duration_ms=800.00 outcome=ok
performance request_id=abc stage=transformations duration_ms=300.00 outcome=ok
performance request_id=abc stage=request_total route=/dataset/{file_id}/ask duration_ms=7500.00 status=200 outcome=ok
```

Group lines by the generated request_id. Durations are milliseconds: 1000 ms
equals one second. The instrumentation logs fixed stage names, durations,
outcomes, route templates and generated IDs. It does not log request bodies,
questions, filenames, column names, data values, cookies, or exception messages.
Existing application/server logging is independent of this instrumentation.

Stages include dataset_lookup (metadata and ownership), file_download,
spreadsheet_parse, transformations, analysis_planning, chart_calculation,
kpi_calculation, draft_insight, analysis_warnings, and answer_polishing.
Legacy local uploads use spreadsheet_parse_local, which includes local file I/O.
AI cache requests also report ai_cache_lookup and, on a miss, ai_cache_lock_wait,
semantic_profile_generation and suggestion_generation as applicable.

AI-related stages measure the whole service operation, including prompt
preparation and validation, not only network time. Polishing can return its
existing fallback: outcome=ok means the service returned, not that the AI
provider necessarily succeeded. Cache hits omit download and generation stages.

request_total covers application request handling through response delivery and
cleanup, not browser rendering or the client's full network round trip. Stage
durations need not sum to the total: routing, serialization, dependency handling,
and other work are included in the total. Do not add request_total to its stages.

To establish a baseline:

1. Open an existing dataset and preview a suggested chart or ask a question.
2. Repeat the same action five times and collect the matching request log groups.
3. Compare the first request separately from the median of later requests.
4. Repeat with a larger dataset and one with saved transformations.
5. Compare download + parsing + transformations against request_total before
   deciding whether a prepared-dataset cache is the next priority.

No AI requests or live database calls are made by the instrumentation tests.
