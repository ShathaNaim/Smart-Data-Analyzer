import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.app.anonymous_identity import get_anonymous_owner_id
from backend.schemas.dashboard import (
    DashboardCreate,
    DashboardResponse,
    DashboardSave,
    DashboardSummaryResponse,
)
from backend.services.dashboard_service import (
    DashboardItemNotFoundError,
    DashboardNotFoundError,
    DatasetNotFoundError,
    create_dashboard,
    get_dashboard,
    list_dashboards,
    save_dashboard,
)


router = APIRouter(
    prefix="/dashboards",
    tags=["dashboards"],
)


@router.post(
    "",
    response_model=DashboardResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dashboard_endpoint(
    data: DashboardCreate,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DashboardResponse:
    try:
        dashboard = create_dashboard(db, data, owner_id)
    except DatasetNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardResponse.model_validate(dashboard)


@router.get(
    "/{dashboard_id}",
    response_model=DashboardResponse,
)
def get_dashboard_endpoint(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DashboardResponse:
    try:
        dashboard = get_dashboard(db, dashboard_id, owner_id)
    except DashboardNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardResponse.model_validate(dashboard)


@router.put(
    "/{dashboard_id}",
    response_model=DashboardResponse,
)
def save_dashboard_endpoint(
    dashboard_id: uuid.UUID,
    data: DashboardSave,
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> DashboardResponse:
    try:
        dashboard = save_dashboard(db, dashboard_id, data, owner_id)
    except (DashboardNotFoundError, DashboardItemNotFoundError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardResponse.model_validate(dashboard)


@router.get("", response_model=list[DashboardSummaryResponse])
def list_dashboards_endpoint(
    db: Session = Depends(get_db),
    limit: int = 5,
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> list[DashboardSummaryResponse]:
    return list_dashboards(db, owner_id, limit)
