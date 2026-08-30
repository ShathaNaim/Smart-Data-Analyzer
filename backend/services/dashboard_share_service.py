from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.dashboard import Dashboard
from backend.models.dashboard_share_link import DashboardShareLink
from backend.services.dashboard_service import (
    DashboardNotFoundError,
    get_dashboard,
)


class ShareLinkNotFoundError(Exception):
    """Raised when a share token is invalid, inactive, or expired."""


def hash_share_token(token: str) -> str:
    """Create the SHA-256 hash stored in the database."""

    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def create_dashboard_share_link(
    db: Session,
    dashboard_id: uuid.UUID,
    expires_in_days: int | None,
    owner_id: uuid.UUID,
) -> tuple[DashboardShareLink, str]:
    """
    Create a new share link and disable previous links.

    The raw token is returned once but is never stored in the database.
    """

    dashboard = get_dashboard(
        db=db,
        dashboard_id=dashboard_id,
        owner_id=owner_id,
    )

    now = datetime.now(timezone.utc)

    existing_links = db.scalars(
        select(DashboardShareLink).where(
            DashboardShareLink.dashboard_id == dashboard.id,
            DashboardShareLink.is_active.is_(True),
        )
    ).all()

    for existing_link in existing_links:
        existing_link.is_active = False

    raw_token = secrets.token_urlsafe(32)

    expires_at = (
        now + timedelta(days=expires_in_days)
        if expires_in_days is not None
        else None
    )

    share_link = DashboardShareLink(
        dashboard_id=dashboard.id,
        token_hash=hash_share_token(raw_token),
        is_active=True,
        expires_at=expires_at,
    )

    try:
        db.add(share_link)
        db.commit()
        db.refresh(share_link)
    except Exception:
        db.rollback()
        raise

    return share_link, raw_token


def revoke_dashboard_share_links(
    db: Session,
    dashboard_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> None:
    """Disable every active share link for a dashboard."""

    get_dashboard(
        db=db,
        dashboard_id=dashboard_id,
        owner_id=owner_id,
    )

    active_links = db.scalars(
        select(DashboardShareLink).where(
            DashboardShareLink.dashboard_id == dashboard_id,
            DashboardShareLink.is_active.is_(True),
        )
    ).all()

    for share_link in active_links:
        share_link.is_active = False

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def get_dashboard_by_share_token(
    db: Session,
    token: str,
) -> Dashboard:
    """
    Resolve a public token to its read-only dashboard.

    Invalid, revoked, and expired tokens produce the same error so callers
    cannot discover private sharing state.
    """

    token_hash = hash_share_token(token)

    statement = (
        select(DashboardShareLink)
        .options(
            selectinload(DashboardShareLink.dashboard)
            .selectinload(Dashboard.items)
        )
        .where(
            DashboardShareLink.token_hash == token_hash,
            DashboardShareLink.is_active.is_(True),
        )
    )

    share_link = db.scalar(statement)

    if share_link is None:
        raise ShareLinkNotFoundError(
            "The shared dashboard link is unavailable."
        )

    now = datetime.now(timezone.utc)

    if (
        share_link.expires_at is not None
        and share_link.expires_at <= now
    ):
        share_link.is_active = False

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        raise ShareLinkNotFoundError(
            "The shared dashboard link is unavailable."
        )

    share_link.last_accessed_at = now

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return share_link.dashboard
