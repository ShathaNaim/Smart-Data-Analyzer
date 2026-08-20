import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas.dashboard import (
    DashboardCreate,
    DashboardResponse,
    DashboardSave,
)
from backend.services.dashboard_service import (
    DashboardItemNotFoundError,
    DashboardNotFoundError,
    DatasetNotFoundError,
    create_dashboard,
    get_dashboard,
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
) -> DashboardResponse:
    try:
        dashboard = create_dashboard(db, data)
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
) -> DashboardResponse:
    try:
        dashboard = get_dashboard(db, dashboard_id)
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
) -> DashboardResponse:
    try:
        dashboard = save_dashboard(db, dashboard_id, data)
    except (DashboardNotFoundError, DashboardItemNotFoundError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error

    return DashboardResponse.model_validate(dashboard)
