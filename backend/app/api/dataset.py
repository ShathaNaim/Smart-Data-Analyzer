import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.anonymous_identity import get_anonymous_owner_id
from backend.database import get_db
from backend.models.dataset import Dataset
from backend.schemas.dataset import DatasetSummaryResponse


router = APIRouter(
    prefix="/datasets",
    tags=["datasets"],
)


@router.get("", response_model=list[DatasetSummaryResponse])
def list_datasets_endpoint(
    limit: int = Query(default=5, ge=1, le=50),
    db: Session = Depends(get_db),
    owner_id: uuid.UUID = Depends(get_anonymous_owner_id),
) -> list[Dataset]:
    """Return the current browser's most recently uploaded datasets."""

    statement = (
        select(Dataset)
        .where(Dataset.owner_id == owner_id)
        .order_by(Dataset.created_at.desc())
        .limit(limit)
    )

    return list(db.scalars(statement).all())
