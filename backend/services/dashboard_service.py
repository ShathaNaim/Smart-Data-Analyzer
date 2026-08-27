import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.dashboard import Dashboard
from backend.models.dashboard_item import DashboardItem
from backend.models.dataset import Dataset
from backend.schemas.dashboard import DashboardCreate, DashboardSave


class DatasetNotFoundError(Exception):
    """Raised when a dashboard refers to a dataset that does not exist."""


class DashboardNotFoundError(Exception):
    """Raised when the requested dashboard does not exist."""


class DashboardItemNotFoundError(Exception):
    """Raised when an item ID does not belong to the dashboard being saved."""


def create_dashboard(db: Session, data: DashboardCreate) -> Dashboard:
    """Create and commit an empty dashboard for an existing dataset."""
    dataset = db.get(Dataset, data.dataset_id)

    if dataset is None:
        raise DatasetNotFoundError(
            f"Dataset '{data.dataset_id}' was not found."
        )

    dashboard = Dashboard(
        dataset_id=data.dataset_id,
        name=data.name,
    )

    try:
        db.add(dashboard)
        db.commit()
        db.refresh(dashboard)
    except Exception:
        db.rollback()
        raise

    return dashboard


def get_dashboard(db: Session, dashboard_id: uuid.UUID) -> Dashboard:
    """Load a dashboard and its items in one service operation."""
    statement = (
        select(Dashboard)
        .options(selectinload(Dashboard.items))
        .where(Dashboard.id == dashboard_id)
    )
    dashboard = db.scalar(statement)

    if dashboard is None:
        raise DashboardNotFoundError(
            f"Dashboard '{dashboard_id}' was not found."
        )

    return dashboard


def save_dashboard(
    db: Session,
    dashboard_id: uuid.UUID,
    data: DashboardSave,
) -> Dashboard:
    """Update dashboard details and synchronize its complete item layout."""
    dashboard = get_dashboard(db, dashboard_id)
    existing_items = {item.id: item for item in dashboard.items}
    saved_items: list[DashboardItem] = []
    submitted_ids: set[uuid.UUID] = set()

    for item_data in data.items:
        if item_data.id is None:
            item = DashboardItem(dashboard_id=dashboard.id)
        else:
            if item_data.id in submitted_ids:
                raise DashboardItemNotFoundError(
                    f"Dashboard item '{item_data.id}' was submitted more than once."
                )

            item = existing_items.get(item_data.id)
            if item is None:
                raise DashboardItemNotFoundError(
                    f"Dashboard item '{item_data.id}' does not belong to this dashboard."
                )

            submitted_ids.add(item_data.id)

        item.title = item_data.title
        item.item_type = item_data.item_type
        item.chart_spec = (
            item_data.chart_spec.model_dump(mode="json")
            if item_data.chart_spec is not None
            else None
        )
        item.kpi_spec = (
            item_data.kpi_spec.model_dump(mode="json")
            if item_data.kpi_spec is not None
            else None
        )
        item.color_config = item_data.color_config
        item.position_x = item_data.position_x
        item.position_y = item_data.position_y
        item.width = item_data.width
        item.height = item_data.height
        saved_items.append(item)

    dashboard.name = data.name
    dashboard.items = saved_items

    try:
        db.commit()
        return get_dashboard(db, dashboard.id)
    except Exception:
        db.rollback()
        raise
