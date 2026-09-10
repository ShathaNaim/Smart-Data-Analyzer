"""Reuse validated AI results for immutable uploaded files and their transformations."""

import hashlib
import json
import uuid
from contextlib import contextmanager
from typing import Literal

from fastapi import Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.models.dataset_ai_cache import DatasetAICache
from backend.schemas.analysis_suggestion import AnalysisSuggestions
from backend.schemas.semantic_profile import SemanticDatasetProfile
from backend.services import analysis_suggester, semantic_profiler
from backend.services.ai_rate_limiter import enforce_ai_usage_limit
from backend.services.dataset_transformer import get_owned_dataset, load_working_dataset
from backend.services.performance import measure_stage, timed_stage

# Bump when model settings, metadata generation, or validation behavior changes.
GENERATOR_VERSION = "1:gpt-4o-mini:temperature-0"
ai_generation_usage = contextmanager(enforce_ai_usage_limit)


def input_fingerprint(dataset) -> str:
    payload = {
        "file": dataset.stored_filename,
        "size": dataset.file_size,
        "description": dataset.description,
        "transformations": [
            {"id": str(item.id), "type": item.transformation_type, "config": item.config}
            for item in dataset.transformations
        ],
        "generator": GENERATOR_VERSION,
        "profile_prompt": semantic_profiler.SYSTEM_PROMPT,
        "suggestions_prompt": analysis_suggester.SYSTEM_PROMPT,
        "profile_schema": SemanticDatasetProfile.model_json_schema(),
        "suggestions_schema": AnalysisSuggestions.model_json_schema(),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


@timed_stage("ai_cache_lookup")
def _read(db, dataset_id, fingerprint, kind):
    record = db.scalar(select(DatasetAICache).where(
        DatasetAICache.dataset_id == dataset_id,
        DatasetAICache.fingerprint == fingerprint,
        DatasetAICache.result_type == kind,
    ))
    if record is None:
        return None
    schema = SemanticDatasetProfile if kind == "profile" else AnalysisSuggestions
    return schema.model_validate(record.result)


def _save(db, dataset_id, fingerprint, kind, result):
    db.add(DatasetAICache(
        dataset_id=dataset_id, fingerprint=fingerprint,
        result_type=kind, result=result.model_dump(mode="json"),
    ))
    db.flush()


def get_cached_ai_result(
    db: Session,
    dataset_id: uuid.UUID,
    owner_id: uuid.UUID,
    response: Response,
    kind: Literal["profile", "suggestions"],
) -> SemanticDatasetProfile | AnalysisSuggestions:
    # Authorization always precedes cache reads, including requests waiting on a lock.
    dataset = get_owned_dataset(db, dataset_id, owner_id)
    fingerprint = input_fingerprint(dataset)
    cached = _read(db, dataset_id, fingerprint, kind)
    if cached is not None:
        return cached

    # Transaction-scoped PostgreSQL lock works across server processes and is
    # released on commit/rollback. Profiles and suggestions share a dataset lock.
    lock_id = int.from_bytes(hashlib.sha256(dataset_id.bytes).digest()[:8], "big", signed=True)
    try:
        with measure_stage("ai_cache_lock_wait"):
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})
        db.expire_all()
        dataset = get_owned_dataset(db, dataset_id, owner_id)
        fingerprint = input_fingerprint(dataset)
        cached = _read(db, dataset_id, fingerprint, kind)
        if cached is not None:
            db.commit()
            return cached

        with ai_generation_usage(response=response, owner_id=owner_id):
            df = load_working_dataset(dataset)
            profile = _read(db, dataset_id, fingerprint, "profile")
            if profile is None:
                profile = semantic_profiler.create_semantic_profile(df, dataset.description)
                _save(db, dataset_id, fingerprint, "profile", profile)
            result = profile
            if kind == "suggestions":
                result = analysis_suggester.generate_analysis_suggestions(
                    df, dataset.description, semantic_profile=profile,
                )
                _save(db, dataset_id, fingerprint, "suggestions", result)
            db.commit()
            return result
    except Exception:
        db.rollback()
        raise
