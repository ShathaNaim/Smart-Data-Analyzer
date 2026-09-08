from __future__ import annotations

import math
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Generator

from fastapi import Depends, HTTPException, Response, status

from backend.app.anonymous_identity import get_anonymous_owner_id
from backend.config import get_settings


@dataclass
class _OwnerUsage:
    minute_requests: deque[float] = field(default_factory=deque)
    day: str = ""
    day_count: int = 0
    active_requests: int = 0


@dataclass(frozen=True)
class AIUsageStatus:
    minute_remaining: int
    day_remaining: int


class AIUsageLimitExceeded(Exception):
    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = max(1, retry_after)


class InMemoryAIUsageLimiter:
    """Thread-safe demo limiter scoped to one Python process."""

    def __init__(
        self,
        requests_per_minute: int,
        requests_per_day: int,
        concurrent_requests: int,
    ) -> None:
        self.requests_per_minute = requests_per_minute
        self.requests_per_day = requests_per_day
        self.concurrent_requests = concurrent_requests
        self._usage: dict[uuid.UUID, _OwnerUsage] = {}
        self._lock = threading.Lock()

    def acquire(
        self,
        owner_id: uuid.UUID,
        now: datetime | None = None,
    ) -> AIUsageStatus:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        current = current.astimezone(timezone.utc)
        timestamp = current.timestamp()
        current_day = current.date().isoformat()

        with self._lock:
            usage = self._usage.setdefault(owner_id, _OwnerUsage())

            if usage.day != current_day:
                usage.day = current_day
                usage.day_count = 0

            cutoff = timestamp - 60
            while usage.minute_requests and usage.minute_requests[0] <= cutoff:
                usage.minute_requests.popleft()

            if usage.active_requests >= self.concurrent_requests:
                raise AIUsageLimitExceeded(
                    "Another AI analysis is already running. Please wait for it to finish.",
                    retry_after=1,
                )

            if usage.day_count >= self.requests_per_day:
                tomorrow = datetime.combine(
                    current.date() + timedelta(days=1),
                    time.min,
                    tzinfo=timezone.utc,
                )
                raise AIUsageLimitExceeded(
                    "You have reached today's AI analysis limit. Try again tomorrow.",
                    retry_after=math.ceil((tomorrow - current).total_seconds()),
                )

            if len(usage.minute_requests) >= self.requests_per_minute:
                retry_after = math.ceil(usage.minute_requests[0] + 60 - timestamp)
                raise AIUsageLimitExceeded(
                    "Too many AI requests. Please wait a moment and try again.",
                    retry_after=retry_after,
                )

            usage.minute_requests.append(timestamp)
            usage.day_count += 1
            usage.active_requests += 1

            return AIUsageStatus(
                minute_remaining=self.requests_per_minute - len(usage.minute_requests),
                day_remaining=self.requests_per_day - usage.day_count,
            )

    def release(self, owner_id: uuid.UUID) -> None:
        with self._lock:
            usage = self._usage.get(owner_id)
            if usage is not None and usage.active_requests > 0:
                usage.active_requests -= 1


settings = get_settings()
ai_usage_limiter = InMemoryAIUsageLimiter(
    requests_per_minute=settings.ai_requests_per_minute,
    requests_per_day=settings.ai_requests_per_day,
    concurrent_requests=settings.ai_concurrent_requests,
)


def enforce_ai_usage_limit(
    response: Response,
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> Generator[None, None, None]:
    try:
        usage_status = ai_usage_limiter.acquire(owner_id)
    except AIUsageLimitExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(error),
            headers={"Retry-After": str(error.retry_after)},
        ) from error

    response.headers["X-RateLimit-Remaining-Minute"] = str(
        usage_status.minute_remaining
    )
    response.headers["X-RateLimit-Remaining-Day"] = str(usage_status.day_remaining)

    try:
        yield
    finally:
        ai_usage_limiter.release(owner_id)
