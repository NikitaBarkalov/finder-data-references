import os

import sys
import tempfile
import uuid
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, File, HTTPException, UploadFile
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

pipeline = None

@app.on_event("startup")
async def startup_event():
    global pipeline
    llm_mode = os.getenv("LLM_MODE", "API")
    print(f"Starting MDC API with LLM_MODE={llm_mode}")
    pipeline = MDCPipeline(llm_mode=llm_mode)

@app.post("/api/v1/extract", response_model=ExtractionResponse)
async def extract_citations(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    logger.info(f"Received request to extract citations from: {file.filename}")
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        results = pipeline.process_pdf(temp_path)
        
        return ExtractionResponse(**results)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
