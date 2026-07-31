import os
import time

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

from fastapi import FastAPI, File, HTTPException, UploadFile, Form
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
import fitz
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from finder_citations.pipeline import FinderPipeline

app = FastAPI(
    title="Finder Citations API",
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
    cached_result: Optional[dict] = None

tasks = {}

pipeline = None

@app.on_event("startup")
async def startup_event():
    global pipeline
    print("Starting Finder Citations API...")
    pipeline = FinderPipeline()

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

    try:
        doc = fitz.open(stream=content, filetype="pdf")
        meta = doc.metadata
        subject = meta.get("subject", "")
        if subject and '"citations":' in subject:
            try:
                cached_data = json.loads(subject)
                if "citations" in cached_data:
                    return {"task_id": "cached", "cached_result": cached_data}
            except json.JSONDecodeError:
                pass
    except Exception as e:
        logger.error(f"Error checking PDF metadata: {e}")

    q = queue.Queue()
    tasks[task_id] = {'queue': q, 'status': 'running'}

    def worker():
        try:
            def cb(msg=None, delay=None, progress=None):
                while tasks.get(task_id, {}).get('paused'):
                    if tasks.get(task_id, {}).get('cancelled'):
                        break
                    time.sleep(0.5)
                if tasks.get(task_id, {}).get('cancelled'):
                    raise Exception("Cancelled by user")
                if delay is not None:
                    q.put({"type": "rate_limit", "delay": delay})
                elif progress is not None:
                    q.put({"type": "progress_counter", "current": progress[0], "total": progress[1]})
                elif msg:
                    q.put({"type": "progress", "message": msg})

            results = pipeline.process_pdf(temp_path, progress_callback=cb)
            q.put({"type": "complete", "result": results})
        except Exception as e:
            if str(e) == "Cancelled by user":
                logger.info(f"Task {task_id} was cancelled by the user.")
            else:
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

def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        logger.error(f"Error deleting temporary file {path}: {e}")

@app.post("/api/v1/task/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id in tasks:
        tasks[task_id]['cancelled'] = True
        tasks[task_id]['paused'] = False 
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Task not found")

@app.post("/api/v1/task/{task_id}/pause")
async def pause_task(task_id: str):
    if task_id in tasks:
        tasks[task_id]['paused'] = True
        return {"status": "paused"}
    raise HTTPException(status_code=404, detail="Task not found")

@app.post("/api/v1/task/{task_id}/resume")
async def resume_task(task_id: str):
    if task_id in tasks:
        tasks[task_id]['paused'] = False
        return {"status": "resumed"}
    raise HTTPException(status_code=404, detail="Task not found")

annotated_files = {}

def start_annotate_task(task_id: str, q: queue.Queue, pdf_path: str, citations_data: list, original_filename: str):
    def run_task():
        try:
            doc = fitz.open(pdf_path)
            DEFAULT_COLOR = (1.0, 0.9, 0.2) 
            total = len(citations_data)

            page_badges = {page.number: [] for page in doc}

            for idx, cit_obj in enumerate(citations_data):
                while tasks.get(task_id, {}).get('paused'):
                    if tasks.get(task_id, {}).get('cancelled'):
                        break
                    time.sleep(0.5)
                if tasks.get(task_id, {}).get('cancelled'):
                    q.put({"type": "error", "message": "Cancelled by user"})
                    return

                q.put({"type": "progress", "current": idx + 1, "total": total})

                text = cit_obj.get("text")
                url = cit_obj.get("url")
                color = cit_obj.get("color", DEFAULT_COLOR)
                title = cit_obj.get("title", "")

                if not text: continue

                import re

                def get_regex_match_groups(page, regex_pattern):
                    page_dict = page.get_text("rawdict")
                    chars = []
                    for block in page_dict.get("blocks", []):
                        if "lines" not in block: continue
                        for line in block["lines"]:
                            for span in line["spans"]:
                                for c in span.get("chars", []):
                                    chars.append(c)
                    
                    if not chars: return []

                    full_text = "".join(c["c"] for c in chars)
                    
                    match_groups = []
                    for match in re.finditer(regex_pattern, full_text, re.IGNORECASE):
                        m_start = match.start()
                        m_end = match.end()
                        
                        rects = []
                        for i in range(m_start, min(m_end, len(chars))):
                            rects.append(fitz.Rect(chars[i]["bbox"]))
                        
                        if rects:
                            match_groups.append(rects)
                    return match_groups

                def build_robust_regex(text: str, is_doi: bool = False) -> str:
                    escaped = [re.escape(c) for c in text]
                    core_regex_str = r'[\s\-]*'.join(escaped)
                    if is_doi:
                        prefixes = [
                            'https://doi.org/', 'http://doi.org/', 'https://dx.doi.org/',
                            'http://dx.doi.org/', 'doi.org/', 'doi:', 'doi'
                        ]
                        mapped = []
                        for p in prefixes:
                            mapped.append(r'[\s\-]*'.join([re.escape(c) for c in p]))
                        prefix_regex_str = r'(?:(?:' + r')|(?:'.join(mapped) + r'))?[\s\-]*'
                        return prefix_regex_str + core_regex_str
                    return core_regex_str

                doi_match = re.search(r'10\.[^\s?#]+', text)
                if doi_match:
                    core_doi = doi_match.group(0)
                    regex = build_robust_regex(core_doi, True)
                elif text.startswith('http'):
                    clean = re.sub(r'^https?://(www\.)?', '', text).split('?')[0].rstrip('/')
                    regex = build_robust_regex(clean, False)
                else:
                    clean = re.sub(r'^[a-zA-Z]+:\s*', '', text)
                    regex = build_robust_regex(clean, False)

                for page in doc:
                    match_groups = get_regex_match_groups(page, regex)

                    for match_rects in match_groups:
                        merged_rects = []
                        for rect in match_rects:
                            merged = False
                            for i, m_rect in enumerate(merged_rects):
                                if abs(rect.y0 - m_rect.y0) < 6:
                                    expanded_rect = fitz.Rect(m_rect.x0 - 4, m_rect.y0 - 2, m_rect.x1 + 4, m_rect.y1 + 2)
                                    if rect.intersects(expanded_rect):
                                        merged_rects[i] = m_rect | rect
                                        merged = True
                                        break
                            if not merged:
                                merged_rects.append(rect)

                        merged_rects.sort(key=lambda r: r.y0)

                        for idx_rect, rect in enumerate(merged_rects):
                            annot = page.add_highlight_annot(rect)
                            if isinstance(color, list) and len(color) == 3:
                                c_tuple = tuple(color)
                                annot.set_colors(stroke=c_tuple)
                            else:
                                c_tuple = DEFAULT_COLOR
                                annot.set_colors(stroke=DEFAULT_COLOR)

                            annot.set_opacity(0.4)

                            if title and idx_rect == 0:
                                title_short = title.replace(" Dataset", "")
                                width = len(title_short) * 3.2
                                height = 8

                                is_right = rect.x0 > page.rect.width / 2

                                badges_on_line = [b for b in page_badges.get(page.number, []) if abs(b['y0'] - rect.y0) < 8]
                                already_drawn = any(b['title'] == title_short for b in badges_on_line)

                                if not already_drawn:
                                    existing_on_preferred = [b for b in badges_on_line if b['is_right'] == is_right]

                                    if len(existing_on_preferred) > 0:
                                        is_right = not is_right

                                    existing_on_actual = [b for b in badges_on_line if b['is_right'] == is_right]

                                    if is_right:
                                        margin_x = page.rect.width - width - 10
                                        for eb in existing_on_actual:
                                            margin_x -= (eb['width'] + 4)
                                    else:
                                        margin_x = 10
                                        for eb in existing_on_actual:
                                            margin_x += (eb['width'] + 4)

                                    tag_rect = fitz.Rect(margin_x, rect.y0 + 1, margin_x + width + 4, rect.y0 + 1 + height)

                                    try:
                                        page.draw_rect(tag_rect, color=c_tuple, fill=c_tuple, fill_opacity=0.15, stroke_opacity=0.3)

                                        text_point = fitz.Point(tag_rect.x0 + 2, tag_rect.y0 + 6)
                                        page.insert_text(
                                            text_point, 
                                            title_short, 
                                            fontsize=5, 
                                            fontname="helv", 
                                            color=(0, 0, 0)
                                        )
                                        page_badges[page.number].append({
                                            'is_right': is_right,
                                            'y0': rect.y0, 
                                            'width': width + 4,
                                            'title': title_short
                                        })
                                    except Exception as e:
                                        logger.error(f"Failed to draw neat margin badge: {e}")

                            annot.update()

                            if url:
                                page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": url})

            fd_out, out_path = tempfile.mkstemp(suffix=".pdf")
            os.close(fd_out)

            meta = doc.metadata
            meta["subject"] = json.dumps({"citations": citations_data})
            doc.set_metadata(meta)

            doc.save(out_path)
            doc.close()

            file_id = str(uuid.uuid4())
            annotated_files[file_id] = {"path": out_path, "filename": f"annotated_{original_filename}"}
            q.put({"type": "complete", "result": {"file_id": file_id}})

        except Exception as e:
            logger.error(f"Error in annotate task: {e}")
            q.put({"type": "error", "message": str(e)})
        finally:
            try:
                if 'doc' in locals() and doc:
                    doc.close()
            except Exception as e:
                pass
            remove_file(pdf_path)

    thread = threading.Thread(target=run_task)
    thread.start()

@app.post("/api/v1/annotate-pdf")
async def annotate_pdf(file: UploadFile = File(...), citations: str = Form(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        citations_data = json.loads(citations)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in citations field.")

    fd, temp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)

    with open(temp_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        'status': 'processing',
        'queue': queue.Queue()
    }

    start_annotate_task(task_id, tasks[task_id]['queue'], temp_path, citations_data, file.filename)

    return {"task_id": task_id}

@app.get("/api/v1/download-annotated/{file_id}")
async def download_annotated(file_id: str):
    if file_id not in annotated_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_info = annotated_files.pop(file_id)
    return FileResponse(
        file_info["path"], 
        media_type="application/pdf", 
        filename=file_info["filename"],
        background=BackgroundTask(remove_file, file_info["path"])
    )

app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    dist_path = os.path.join("frontend/dist", full_path)
    if os.path.isfile(dist_path):
        return FileResponse(dist_path)
    return FileResponse("frontend/dist/index.html")
