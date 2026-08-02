import json
import logging
import os
import tempfile
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.services.pdf_annotator import start_annotate_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1")


@router.post("/annotate-pdf")
async def annotate_pdf(request: Request, file: UploadFile = File(...), citations: str = Form(...)):
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        citations_data = json.loads(citations)
    except json.JSONDecodeError as err:
        raise HTTPException(status_code=400, detail="Invalid JSON in citations field.") from err
    fd, temp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())
    task_manager = request.app.state.task_manager
    annotated_file_store = request.app.state.annotated_file_store
    task_id = str(uuid.uuid4())
    q = task_manager.create_annotate_task(task_id)
    start_annotate_task(task_id, q, temp_path, citations_data, file.filename, task_manager, annotated_file_store)
    return {"task_id": task_id}


@router.get("/download-annotated/{file_id}")
async def download_annotated(file_id: str, request: Request):
    annotated_file_store = request.app.state.annotated_file_store
    file_info = annotated_file_store.get(file_id)
    if not file_info or not os.path.exists(file_info["path"]):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_info["path"], media_type="application/pdf", filename=file_info["filename"])
