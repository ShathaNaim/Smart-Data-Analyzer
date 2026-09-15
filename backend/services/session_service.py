import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from backend.models.user_session import UserSession
import os

from fastapi import Response


SESSION_COOKIE_NAME = "smart_analyzer_session"
SESSION_LIFETIME = timedelta(days=7)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id) -> tuple[UserSession, str]:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)

    session = UserSession(
        user_id=user_id,
        token_hash=hash_session_token(token),
        expires_at=now + SESSION_LIFETIME,
    )

    return session, token

def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        path="/",
    )