"""Explicit, atomic transfer of the current browser's guest workspace."""
import uuid
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from backend.models.dataset import Dataset
from backend.models.dashboard import Dashboard


def transfer_guest_workspace(db: Session, guest_id: uuid.UUID, account_id: uuid.UUID) -> dict:
    if guest_id == account_id:
        raise ValueError('Guest and account identities must differ.')
    try:
        # Lock the datasets first; a competing claim cannot take the same rows.
        ids = list(db.scalars(select(Dataset.id).where(
            Dataset.owner_id == guest_id).order_by(Dataset.id).with_for_update()).all())
        if not ids:
            db.commit()
            return {'datasets': 0, 'dashboards': 0}
        dashboards = db.execute(update(Dashboard).where(
            Dashboard.owner_id == guest_id, Dashboard.dataset_id.in_(ids)
        ).values(owner_id=account_id)).rowcount
        datasets = db.execute(update(Dataset).where(
            Dataset.owner_id == guest_id, Dataset.id.in_(ids)
        ).values(owner_id=account_id)).rowcount
        db.commit()
        return {'datasets': datasets, 'dashboards': dashboards}
    except Exception:
        db.rollback()
        raise
