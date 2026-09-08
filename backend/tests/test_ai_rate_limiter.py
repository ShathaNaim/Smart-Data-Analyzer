import unittest
import uuid
from datetime import datetime, timedelta, timezone

from backend.services.ai_rate_limiter import (
    AIUsageLimitExceeded,
    InMemoryAIUsageLimiter,
)


class AIUsageLimiterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.now = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)

    def test_enforces_minute_limit_and_allows_requests_after_window(self) -> None:
        limiter = InMemoryAIUsageLimiter(2, 10, 2)

        limiter.acquire(self.owner_id, self.now)
        limiter.release(self.owner_id)
        limiter.acquire(self.owner_id, self.now + timedelta(seconds=1))
        limiter.release(self.owner_id)

        with self.assertRaisesRegex(AIUsageLimitExceeded, "Too many"):
            limiter.acquire(self.owner_id, self.now + timedelta(seconds=2))

        status = limiter.acquire(self.owner_id, self.now + timedelta(seconds=61))
        self.assertEqual(status.minute_remaining, 1)

    def test_enforces_daily_limit_and_resets_on_next_day(self) -> None:
        limiter = InMemoryAIUsageLimiter(10, 1, 1)

        limiter.acquire(self.owner_id, self.now)
        limiter.release(self.owner_id)

        with self.assertRaisesRegex(AIUsageLimitExceeded, "today"):
            limiter.acquire(self.owner_id, self.now + timedelta(hours=1))

        status = limiter.acquire(self.owner_id, self.now + timedelta(days=1))
        self.assertEqual(status.day_remaining, 0)

    def test_concurrent_rejection_does_not_consume_another_request(self) -> None:
        limiter = InMemoryAIUsageLimiter(5, 5, 1)

        limiter.acquire(self.owner_id, self.now)
        with self.assertRaisesRegex(AIUsageLimitExceeded, "already running"):
            limiter.acquire(self.owner_id, self.now)

        limiter.release(self.owner_id)
        status = limiter.acquire(self.owner_id, self.now)
        self.assertEqual(status.day_remaining, 3)


if __name__ == "__main__":
    unittest.main()
