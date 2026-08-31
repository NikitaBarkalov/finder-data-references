import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from finder_citations.pipeline import FinderPipeline

from .routers import annotate, extract
from .task_manager import AnnotatedFileStore, TaskManager

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


class StartupLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []

    def emit(self, record):
        try:
            msg = self.format(record)
            text = record.getMessage()
            if "Starting LLM in" in text or "Article prefixes loaded" in text or "spaCy NER model loaded" in text:
                self.logs.append(msg)
        except Exception:
            pass


startup_handler = StartupLogHandler()
startup_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
logging.getLogger().addHandler(startup_handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pipeline = FinderPipeline()
    app.state.task_manager = TaskManager()
    app.state.annotated_file_store = AnnotatedFileStore()
    logging.info("Frontend UI is available at http://localhost:8000 (when running via Docker or direct Uvicorn)")
    yield
    app.state.annotated_file_store.shutdown()


app = FastAPI(
    title="Finder Citations API",
    description="API for extracting and classifying data citations from scientific papers.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)
app.include_router(extract.router)
app.include_router(annotate.router)


@app.get("/api/v1/startup-logs")
async def get_startup_logs():
    return {"logs": startup_handler.logs}


app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")


@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    dist_path = os.path.join("frontend/dist", full_path)
    if os.path.isfile(dist_path):
        return FileResponse(dist_path)
    return FileResponse("frontend/dist/index.html")
