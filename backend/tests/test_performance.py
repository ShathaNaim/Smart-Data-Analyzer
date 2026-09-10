import asyncio
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from backend.services.performance import (
    PerformanceMiddleware, measure_stage, request_id, timed_stage,
)

LOGGER = "uvicorn.error.performance"


class PerformanceTests(unittest.TestCase):
    def test_duration_and_return_value(self):
        @timed_stage("calculation")
        def calculate():
            return 42

        with self.assertLogs(LOGGER, level="INFO") as logs:
            with patch("backend.services.performance.perf_counter", side_effect=[1, 1.125]):
                self.assertEqual(calculate(), 42)
        self.assertIn("duration_ms=125.00 outcome=ok", logs.output[0])

    def test_exception_is_preserved_without_logging_its_contents(self):
        error = ValueError("private spreadsheet value")
        with self.assertLogs(LOGGER, level="INFO") as logs:
            with self.assertRaises(ValueError) as raised:
                with measure_stage("spreadsheet_parse"):
                    raise error
        self.assertIs(raised.exception, error)
        self.assertIn("outcome=error", logs.output[0])
        self.assertNotIn(str(error), logs.output[0])


class RequestTimingTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_requests_propagate_ids_to_workers_without_logging_inputs(self):
        app = FastAPI()
        app.add_middleware(PerformanceMiddleware)

        @app.get("/datasets/{private_name}")
        async def example(private_name: str):
            def work():
                with measure_stage("calculation"):
                    return request_id.get()
            return {"id": await run_in_threadpool(work)}

        with self.assertLogs(LOGGER, level="INFO") as logs:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                results = await asyncio.gather(
                    client.get("/datasets/secret-one?question=private-question"),
                    client.get("/datasets/secret-two"),
                )
        ids = [result.json()["id"] for result in results]
        self.assertEqual(len(set(ids)), 2)
        for identifier in ids:
            matching = [line for line in logs.output if f"request_id={identifier}" in line]
            self.assertEqual(len(matching), 2)
            self.assertTrue(any("stage=calculation" in line for line in matching))
            self.assertTrue(any("route=/datasets/{private_name}" in line for line in matching))
        output = "\n".join(logs.output)
        for secret in ["secret-one", "secret-two", "private-question"]:
            self.assertNotIn(secret, output)
        self.assertEqual(request_id.get(), "outside-request")

    async def test_failed_request_is_logged_and_context_reset(self):
        async def failing_app(scope, receive, send):
            raise RuntimeError("private-error")

        with self.assertLogs(LOGGER, level="INFO") as logs:
            with self.assertRaises(RuntimeError):
                await PerformanceMiddleware(failing_app)({"type": "http"}, None, None)
        self.assertIn("status=500 outcome=error", logs.output[0])
        self.assertNotIn("private-error", logs.output[0])
        self.assertEqual(request_id.get(), "outside-request")
