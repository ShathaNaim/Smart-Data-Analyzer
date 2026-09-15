from fastapi import FastAPI
from backend.config import get_settings
from backend.services.performance import PerformanceMiddleware
from backend.app.api.upload import router as upload_router
from backend.app.api.analysis import router as analysis_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.dataset import router as dataset_router
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.dashboard_share import (
    router as dashboard_share_router,
)
from backend.app.api.auth import router as auth_router
app = FastAPI()
app.add_middleware(PerformanceMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload_router)
app.include_router(analysis_router)
app.include_router(dashboard_router)
app.include_router(dashboard_share_router)
app.include_router(dataset_router)
app.include_router(auth_router)

@app.get("/")
def home():
    return {"message": "Smart Data Analyzer API"}


@app.get("/healthz")
def health_check():
    # Liveness only: do not wake Neon or call paid AI services for health probes.
    return {"status": "ok"}
