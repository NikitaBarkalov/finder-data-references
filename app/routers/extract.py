import json
import logging
import os
import tempfile
import threading
import time
import uuid

import fitz
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
import asyncio

from app.models import TaskResponse
from app.services.pdf_annotator import remove_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

_PREFIXES_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'input_data', 'prefixes.csv')


@router.post("/extract", response_model=TaskResponse)
async def extract_citations(request: Request, file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if not os.path.exists(_PREFIXES_PATH):
        raise HTTPException(
            status_code=500,
            detail="Required file 'prefixes.csv' is missing. Please generate it first by running 'uv run python scripts/build_prefixes.py' in the terminal."
        )

    logger.info(f"Received request to extract citations from: {file.filename}")

    content = await file.read()

    try:
        doc = fitz.open(stream=content, filetype="pdf")
        meta = doc.metadata or {}
        subject = meta.get("subject", "")
        doc.close()
        if subject and '"citations":' in subject:
            try:
                cached_data = json.loads(subject)
                if "citations" in cached_data:
                    return {"task_id": "cached", "cached_result": cached_data}
            except json.JSONDecodeError:
                pass
    except Exception as exc:
        logger.error(f"Error checking PDF metadata: {exc}")

    task_manager = request.app.state.task_manager
    pipeline = request.app.state.pipeline

    task_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"{task_id}_{file.filename}")

    with open(temp_path, "wb") as buffer:
        buffer.write(content)

    q = task_manager.create_extraction_task(task_id)

    def worker():
        try:
            def cb(msg=None, delay=None, progress=None):
                while task_manager.is_paused(task_id):
                    if task_manager.is_cancelled(task_id):
                        break
                    time.sleep(0.5)
                if task_manager.is_cancelled(task_id):
                    raise RuntimeError("Cancelled by user")
                if delay is not None:
                    q.put({"type": "rate_limit", "delay": delay})
                elif progress is not None:
                    q.put({"type": "progress_counter", "current": progress[0], "total": progress[1]})
                elif msg:
                    q.put({"type": "progress", "message": msg})

            results = pipeline.process_pdf(temp_path, progress_callback=cb)
            q.put({"type": "complete", "result": results})
        except Exception as exc:
            if str(exc) == "Cancelled by user":
                logger.info(f"Task {task_id} was cancelled by the user.")
            else:
                logger.error(f"Error processing task {task_id}: {exc}")
            q.put({"type": "error", "message": str(exc)})
        finally:
            remove_file(temp_path)

    threading.Thread(target=worker, daemon=True).start()
    return {"task_id": task_id}


@router.get("/task/{task_id}/stream")
async def stream_task(task_id: str, request: Request):
    task_manager = request.app.state.task_manager
    if not task_manager.contains(task_id):
        raise HTTPException(status_code=404, detail="Task not found")

    task = task_manager.get(task_id)
    q = task['queue']

    async def event_generator():
        while True:
            msg = await asyncio.to_thread(q.get)
            yield f"data: {json.dumps(msg)}\n\n"
            if msg["type"] in ["complete", "error"]:
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str, request: Request):
    task_manager = request.app.state.task_manager
    if task_manager.cancel(task_id):
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/task/{task_id}/pause")
async def pause_task(task_id: str, request: Request):
    task_manager = request.app.state.task_manager
    if task_manager.pause(task_id):
        return {"status": "paused"}
    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/task/{task_id}/resume")
async def resume_task(task_id: str, request: Request):
    task_manager = request.app.state.task_manager
    if task_manager.resume(task_id):
        return {"status": "resumed"}
    raise HTTPException(status_code=404, detail="Task not found")
