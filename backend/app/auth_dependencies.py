from datetime import datetime, timezone
import uuid

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.app.anonymous_identity import ANONYMOUS_COOKIE_NAME, get_anonymous_owner_id
from backend.models.user import User
from backend.models.user_session import UserSession
from backend.services.session_service import (
    SESSION_COOKIE_NAME,
    hash_session_token,
)


def get_current_user(
    session_token: str | None = Cookie(
        default=None,
        alias=SESSION_COOKIE_NAME,
    ),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please sign in to continue.",
    )

    if not session_token or len(session_token) > 128:
        raise unauthorized

    statement = (
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(
            UserSession.token_hash == hash_session_token(session_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(timezone.utc),
            User.is_active.is_(True),
        )
    )

    user = db.scalar(statement)

    if user is None:
        raise unauthorized

    return user


def get_workspace_owner_id(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    device_cookie: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Use a validated account session, or guest identity when no session exists.

    An invalid or expired session must return 401 instead of silently switching
    the request to a different workspace.
    """
    if session_token is not None:
        return get_current_user(session_token=session_token, db=db).id
    return get_anonymous_owner_id(response=response, device_cookie=device_cookie)
