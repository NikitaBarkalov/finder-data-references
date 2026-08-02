from pydantic import BaseModel


class CitationResult(BaseModel):
    citation: str
    context: str
    category: str


class ExtractionResponse(BaseModel):
    authors: str
    citations: list[CitationResult]


class TaskResponse(BaseModel):
    task_id: str
    cached_result: dict | None = None
