"""Measure cursor execution during an explicitly scoped dataset lookup."""

from contextlib import contextmanager
from contextvars import ContextVar
from time import perf_counter

from sqlalchemy import event

from backend.services.performance import logger, request_id

_query_times: ContextVar[list[float] | None] = ContextVar("dataset_query_times", default=None)


def install_query_timing(engine):
    @event.listens_for(engine, "before_cursor_execute")
    def before(connection, cursor, statement, parameters, context, executemany):
        if _query_times.get() is not None:
            context._dataset_timing_started = perf_counter()

    def finish(context, outcome):
        timings = _query_times.get()
        started = getattr(context, "_dataset_timing_started", None)
        if timings is None or started is None:
            return
        elapsed = perf_counter() - started
        del context._dataset_timing_started
        timings.append(elapsed)
        logger.info(
            "performance request_id=%s stage=dataset_query_execute query_number=%d "
            "duration_ms=%.2f outcome=%s",
            request_id.get(), len(timings), elapsed * 1000, outcome,
        )

    @event.listens_for(engine, "after_cursor_execute")
    def after(connection, cursor, statement, parameters, context, executemany):
        finish(context, "ok")

    @event.listens_for(engine, "handle_error")
    def failed(exception_context):
        finish(exception_context.execution_context, "error")


@contextmanager
def measure_dataset_queries():
    timings = []
    token = _query_times.set(timings)
    started = perf_counter()
    outcome = "ok"
    try:
        yield
    except BaseException:
        outcome = "error"
        raise
    finally:
        elapsed = perf_counter() - started
        _query_times.reset(token)
        logger.info(
            "performance request_id=%s stage=dataset_query_processing "
            "query_count=%d duration_ms=%.2f outcome=%s",
            request_id.get(), len(timings), max(0, elapsed - sum(timings)) * 1000, outcome,
        )
