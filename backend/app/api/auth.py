from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import update
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from zstandard import backend

from backend.database import get_db
from backend.models.user import User
from backend.models.user_session import UserSession
from backend.schemas.auth import (
    AuthResponse,
    MessageResponse,
    MessageResponse,
    SigninRequest,
    SignupRequest,
    UserResponse,
)
from backend.services.password_service import hash_password, verify_password
from backend.services.session_service import SESSION_COOKIE_NAME, clear_session_cookie, create_session, hash_session_token, set_session_cookie
from datetime import datetime, timezone

from backend.services.auth_rate_limiter import enforce_auth_limit
from backend.app.auth_security import require_auth_origin
from sqlalchemy import select
from backend.app.auth_dependencies import get_current_user

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
    dependencies=[Depends(require_auth_origin)],
)
DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-check")


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    payload: SignupRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    enforce_auth_limit(
        "signup-global",
        "all",
        limit=20,
        window_seconds=600,
    )

    enforce_auth_limit(
        "signup-email",
        str(payload.email),
        limit=3,
        window_seconds=900,
    )
    user = User(
        email=str(payload.email),
        password_hash=hash_password(payload.password),
    )

    try:
        db.add(user)
        db.flush()

        session, token = create_session(user.id)
        db.add(session)

        result = AuthResponse(
            user=UserResponse.model_validate(user),
        )

        db.commit()

    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not create this account. Try signing in instead.",
        ) from error

    set_session_cookie(response, token)

    return result


@router.post("/signin", response_model=AuthResponse)
def signin(
    payload: SigninRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    enforce_auth_limit(
        "signin-global",
        "all",
        limit=60,
        window_seconds=600,
    )

    enforce_auth_limit(
        "signin-email",
        str(payload.email),
        limit=5,
        window_seconds=900,
    )
    user = db.scalar(
        select(User).where(User.email == str(payload.email))
    )

    stored_hash = (
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    )
    password_matches = verify_password(payload.password, stored_hash)

    if user is None or not password_matches or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    session, token = create_session(user.id)

    result = AuthResponse(
        user=UserResponse.model_validate(user),
    )

    try:
        db.add(session)
        db.commit()
    except Exception:
        db.rollback()
        raise

    set_session_cookie(response, token)

    return result

@router.post("/signout", response_model=MessageResponse)
def signout(
        response: Response,
        session_token: str | None = Cookie(
            default=None,
            alias=SESSION_COOKIE_NAME,
        ),
        db: Session = Depends(get_db),
    ) -> MessageResponse:
        if session_token and len(session_token) <= 128:
            statement = (
                update(UserSession)
                .where(
                    UserSession.token_hash
                    == hash_session_token(session_token),
                    UserSession.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc))
            )

            try:
                db.execute(statement)
                db.commit()
            except Exception:
                db.rollback()
                raise

        clear_session_cookie(response)

        return MessageResponse(message="Signed out successfully.")

@router.get("/me", response_model=AuthResponse)
def get_me(
    user: User = Depends(get_current_user),
) -> AuthResponse:
    return AuthResponse(
        user=UserResponse.model_validate(user),
    )