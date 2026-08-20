from fastapi import FastAPI
from backend.app.api.upload import router as upload_router
from backend.app.api.analysis import router as analysis_router
from backend.app.api.dashboard import router as dashboard_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload_router)
app.include_router(analysis_router)
app.include_router(dashboard_router)

@app.get("/")
def home():
    return {"message": "Smart Data Analyzer API"}
