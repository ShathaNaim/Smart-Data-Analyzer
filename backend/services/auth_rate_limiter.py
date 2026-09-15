import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, or_
from sqlalchemy.dialects.postgresql import insert

from backend.database import SessionLocal
from backend.models.auth_rate_limit import AuthRateLimit


def enforce_auth_limit(
    scope: str,
    identifier: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate limits must be positive.")

    secret = os.getenv("ANONYMOUS_COOKIE_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("ANONYMOUS_COOKIE_SECRET is not configured.")

    key = hmac.new(
        secret.encode("utf-8"),
        f"auth-rate-limit:{scope}:{identifier}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=window_seconds)
    expired = AuthRateLimit.expires_at <= now

    statement = (
        insert(AuthRateLimit)
        .values(
            key=key,
            window_started_at=now,
            attempts=1,
            expires_at=expires_at,
        )
        .on_conflict_do_update(
            index_elements=[AuthRateLimit.key],
            set_={
                "window_started_at": case(
                    (expired, now),
                    else_=AuthRateLimit.window_started_at,
                ),
                "attempts": case(
                    (expired, 1),
                    else_=AuthRateLimit.attempts + 1,
                ),
                "expires_at": case(
                    (expired, expires_at),
                    else_=AuthRateLimit.expires_at,
                ),
            },
            where=or_(
                expired,
                AuthRateLimit.attempts < limit,
            ),
        )
        .returning(AuthRateLimit.key)
    )

    with SessionLocal.begin() as db:
        accepted_key = db.execute(statement).scalar_one_or_none()

    if accepted_key is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please try again later.",
            headers={"Retry-After": str(window_seconds)},
        )