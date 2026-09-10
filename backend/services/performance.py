"""Content-free timings correlated across async requests and sync worker threads."""

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from time import perf_counter
from uuid import uuid4

logger = logging.getLogger("uvicorn.error.performance")
request_id: ContextVar[str] = ContextVar("performance_request_id", default="outside-request")


@contextmanager
def measure_stage(stage: str):
    """Stage names must be fixed developer labels, never user input."""
    started = perf_counter()
    outcome = "ok"
    try:
        yield
    except BaseException:
        outcome = "error"
        raise
    finally:
        logger.info(
            "performance request_id=%s stage=%s duration_ms=%.2f outcome=%s",
            request_id.get(), stage, (perf_counter() - started) * 1000, outcome,
        )


def timed_stage(stage: str):
    """Instrument a synchronous service without changing its return or errors."""
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            with measure_stage(stage):
                return function(*args, **kwargs)
        return wrapped
    return decorate


class PerformanceMiddleware:
    """Measure the full ASGI request; do not read bodies, headers, or raw URLs."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = request_id.set(uuid4().hex)
        started = perf_counter()
        status_code = 500
        outcome = "error"

        async def timed_send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, timed_send)
            outcome = "ok" if status_code < 400 else "error"
        finally:
            route = scope.get("route")
            logger.info(
                "performance request_id=%s stage=request_total route=%s "
                "duration_ms=%.2f status=%s outcome=%s",
                request_id.get(), getattr(route, "path", "unmatched"),
                (perf_counter() - started) * 1000, status_code, outcome,
            )
            request_id.reset(token)
