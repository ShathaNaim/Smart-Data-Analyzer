from fastapi import HTTPException, Request, status

from backend.config import get_settings


def require_auth_origin(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    origin = request.headers.get("origin")
    allowed_origins = get_settings().auth_allowed_origins

    if not origin or origin not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Request origin is not allowed.",
        )