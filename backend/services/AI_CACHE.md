AI profiles and suggestions are stored in PostgreSQL's `dataset_ai_cache` table.

Before running the updated backend, apply the migration to the intended database:

```powershell
venv/Scripts/python.exe -m alembic upgrade head
```

Both existing POST endpoints retain their response formats. They verify dataset
ownership before reading the cache. A hit avoids file loading and AI usage charges.
A miss generates validated results; suggestions reuse a matching semantic profile.
Generation remains one usage unit per request, as before, even when it needs both
AI calls. The question-answering endpoint is unchanged.

The fingerprint includes the uploaded object's unique key and size, ordered
transformation IDs/types/configs, description, prompts, schemas, and generator
version. Uploaded objects must remain immutable at their keys (as in the upload
endpoint). File replacements must use a new key. Bump `GENERATOR_VERSION` in
`ai_cache.py` when changing model settings, metadata construction, or validation
behavior. Prompt and schema changes invalidate matching results automatically.

A PostgreSQL transaction advisory lock serializes generation per dataset across
workers. Waiting requests recheck the cache before consuming AI usage. Generation
holds a database connection until completion; this should be considered when
sizing the connection pool. Failures roll back new cache records and release the
lock. Previously committed results remain available. Old versions are retained
for reuse after undo; deleting a dataset cascades to all its cached versions.

Manual regeneration is not exposed in the UI in this initial implementation.
The unit tests use mocked generation/storage orchestration and compile the
migration for PostgreSQL; they do not call AI APIs or a live database.
