import os

import sys
import tempfile
import uuid
import logging
import queue
import threading
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from mdc_extractor.pipeline import MDCPipeline

app = FastAPI(
    title="Make Data Count API",
    description="API for extracting and classifying data citations from scientific papers.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CitationResult(BaseModel):
    citation: str
    context: str
    category: str

class ExtractionResponse(BaseModel):
    authors: str
    citations: List[CitationResult]

class TaskResponse(BaseModel):
    task_id: str

tasks = {}

pipeline = None

@app.on_event("startup")
async def startup_event():
    global pipeline
    llm_mode = os.getenv("LLM_MODE", "API")
    print(f"Starting MDC API with LLM_MODE={llm_mode}")
    pipeline = MDCPipeline(llm_mode=llm_mode)

@app.post("/api/v1/extract", response_model=TaskResponse)
async def extract_citations(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    prefixes_path = os.path.join(os.path.dirname(__file__), '..', 'input_data', 'prefixes.csv')
    if not os.path.exists(prefixes_path):
        raise HTTPException(
            status_code=500, 
            detail="Required file 'prefixes.csv' is missing. Please generate it first by running 'uv run python scripts/build_prefixes.py' in the terminal."
        )
    
    logger.info(f"Received request to extract citations from: {file.filename}")
    task_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"{task_id}_{file.filename}")
    
    with open(temp_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    q = queue.Queue()
    tasks[task_id] = {'queue': q, 'status': 'running'}

    def worker():
        try:
            def cb(msg):
                q.put({"type": "progress", "message": msg})
                
            results = pipeline.process_pdf(temp_path, progress_callback=cb)
            q.put({"type": "complete", "result": results})
        except Exception as e:
            logger.error(f"Error processing task {task_id}: {e}")
            q.put({"type": "error", "message": str(e)})
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    threading.Thread(target=worker, daemon=True).start()
    return {"task_id": task_id}

@app.get("/api/v1/task/{task_id}/stream")
async def stream_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    q = tasks[task_id]['queue']
    
    async def event_generator():
        while True:
            msg = await asyncio.to_thread(q.get)
            yield f"data: {json.dumps(msg)}\n\n"
            if msg["type"] in ["complete", "error"]:
                break
                
    return StreamingResponse(event_generator(), media_type="text/event-stream")
