import hashlib
import hmac
import os
import secrets
import uuid

from fastapi import Cookie, Response


ANONYMOUS_COOKIE_NAME = "smart_analyzer_device"
ANONYMOUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def _cookie_secret() -> bytes:
    secret = os.getenv("ANONYMOUS_COOKIE_SECRET")
    if not secret or len(secret) < 32:
        raise RuntimeError(
            "ANONYMOUS_COOKIE_SECRET must be configured with at least 32 characters"
        )
    return secret.encode("utf-8")


def _sign(owner_id: uuid.UUID) -> str:
    return hmac.new(
        _cookie_secret(), str(owner_id).encode("ascii"), hashlib.sha256
    ).hexdigest()


def create_signed_owner_cookie(owner_id: uuid.UUID) -> str:
    return f"{owner_id}.{_sign(owner_id)}"


def read_signed_owner_cookie(value: str | None) -> uuid.UUID | None:
    if not value:
        return None

    try:
        raw_owner_id, supplied_signature = value.rsplit(".", 1)
        owner_id = uuid.UUID(raw_owner_id)
    except (ValueError, AttributeError):
        return None

    if not hmac.compare_digest(_sign(owner_id), supplied_signature):
        return None
    return owner_id


def get_anonymous_owner_id(
    response: Response,
    device_cookie: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
) -> uuid.UUID:
    owner_id = read_signed_owner_cookie(device_cookie)
    if owner_id is not None:
        return owner_id

    owner_id = uuid.UUID(bytes=secrets.token_bytes(16), version=4)
    response.set_cookie(
        key=ANONYMOUS_COOKIE_NAME,
        value=create_signed_owner_cookie(owner_id),
        max_age=ANONYMOUS_COOKIE_MAX_AGE,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        path="/",
    )
    return owner_id
