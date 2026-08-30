from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Path,
    status,
)
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.app.anonymous_identity import get_anonymous_owner_id
from backend.schemas.dashboard_share import (
    DashboardShareCreate,
    DashboardShareCreatedResponse,
    DashboardShareRevokedResponse,
    SharedDashboardResponse,
)
from backend.services.dashboard_service import DashboardNotFoundError
from backend.services.dashboard_share_service import (
    ShareLinkNotFoundError,
    create_dashboard_share_link,
    get_dashboard_by_share_token,
    revoke_dashboard_share_links,
)


router = APIRouter(
    tags=["dashboard sharing"],
)


@router.post(
    "/dashboards/{dashboard_id}/share",
    response_model=DashboardShareCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dashboard_share_endpoint(
    dashboard_id: uuid.UUID,
    data: DashboardShareCreate,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DashboardShareCreatedResponse:
    try:
        share_link, raw_token = create_dashboard_share_link(
            db=db,
            dashboard_id=dashboard_id,
            expires_in_days=data.expires_in_days,
            owner_id=owner_id,
        )
    except DashboardNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardShareCreatedResponse(
        token=raw_token,
        expires_at=share_link.expires_at,
        created_at=share_link.created_at,
    )


@router.delete(
    "/dashboards/{dashboard_id}/share",
    response_model=DashboardShareRevokedResponse,
)
def revoke_dashboard_share_endpoint(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DashboardShareRevokedResponse:
    try:
        revoke_dashboard_share_links(
            db=db,
            dashboard_id=dashboard_id,
            owner_id=owner_id,
        )
    except DashboardNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardShareRevokedResponse()


@router.get(
    "/shared-dashboards/{token}",
    response_model=SharedDashboardResponse,
)
def get_shared_dashboard_endpoint(
    token: Annotated[
        str,
        Path(
            min_length=32,
            max_length=200,
        ),
    ],
    db: Session = Depends(get_db),
) -> SharedDashboardResponse:
    try:
        dashboard = get_dashboard_by_share_token(
            db=db,
            token=token,
        )
    except ShareLinkNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return SharedDashboardResponse.model_validate(
        dashboard
    )
