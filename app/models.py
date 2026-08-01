from pydantic import BaseModel
from typing import List, Optional


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
