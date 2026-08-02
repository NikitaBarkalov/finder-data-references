"""
Integration tests for app/routers/extract.py

Покривають endpoints:
- POST /api/v1/extract
- GET  /api/v1/task/{task_id}/stream
- POST /api/v1/task/{task_id}/cancel
- POST /api/v1/task/{task_id}/pause
- POST /api/v1/task/{task_id}/resume

Стратегія:
- FinderPipeline підміняється через MagicMock
- Файл prefixes.csv генерується у tmp_path
- Використовується httpx.Client через TestClient
"""

import io
import json
import os
from unittest.mock import MagicMock

import fitz
import pytest
from fastapi.testclient import TestClient

from app.task_manager import AnnotatedFileStore, TaskManager
from finder_citations.pipeline import FinderPipeline


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def prefixes_csv(tmp_path) -> str:
    """Створює тимчасовий prefixes.csv щоб endpoint не повертав 500."""
    p = tmp_path / "prefixes.csv"
    p.write_text("prefix,type\n10.1234,10.SERV/CROSSREF\n")
    return str(p)


@pytest.fixture
def mock_pipeline() -> MagicMock:
    pipeline = MagicMock(spec=FinderPipeline)
    pipeline.process_pdf.return_value = {
        "authors": "Smith J",
        "citations": [
            {"citation": "GSE123", "context": "...GSE123...", "category": "Primary"}
        ],
    }
    return pipeline


@pytest.fixture
def client(mock_pipeline, prefixes_csv, monkeypatch):
    """
    TestClient з підміненим pipeline та prefixes path.
    lifespan викликається автоматично через TestClient як context manager.
    """
    monkeypatch.setenv("PREFIXES_CSV", prefixes_csv)

    # Патчимо FinderPipeline щоб lifespan не ініціалізував справжній
    import finder_citations.pipeline as pipeline_mod
    monkeypatch.setattr(pipeline_mod, "FinderPipeline", lambda: mock_pipeline)

    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def pdf_bytes() -> bytes:
    """Мінімальний PDF у пам'яті."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GSE12345 is a dataset accession.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# POST /api/v1/extract
# ---------------------------------------------------------------------------

class TestExtractEndpoint:
    def test_rejects_non_pdf_extension(self, client):
        response = client.post(
            "/api/v1/extract",
            files={"file": ("report.txt", b"text content", "text/plain")},
        )
        assert response.status_code == 400
        assert "PDF" in response.json()["detail"]

    def test_rejects_missing_filename(self, client, pdf_bytes):
        """
        FastAPI/Starlette валідує поле `file` (не порожні метадані) до того, як до роутеру досягнеться filename.
        Порожні запити зі значеннями поля, що не відповідають типу, повертають 422.
        """
        response = client.post(
            "/api/v1/extract",
            files={"file": ("", b"data", "application/pdf")},
        )
        # Starlette повертає 422 Unprocessable Entity, не 400
        assert response.status_code in (400, 422)

    def test_accepts_pdf_returns_task_id(self, client, pdf_bytes):
        response = client.post(
            "/api/v1/extract",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert isinstance(data["task_id"], str)

    def test_returns_cached_result_for_annotated_pdf(self, client, pdf_bytes):
        """PDF із кешованим результатом у metadata.subject повертає cached_result."""
        cached = {"citations": [{"citation": "GSE1", "context": "...", "category": "Primary"}]}
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        meta = doc.metadata or {}
        meta["subject"] = json.dumps(cached)
        out = io.BytesIO()
        doc.set_metadata(meta)
        doc.save(out)
        doc.close()
        cached_pdf_bytes = out.getvalue()

        response = client.post(
            "/api/v1/extract",
            files={"file": ("cached.pdf", cached_pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("task_id") == "cached"
        assert "cached_result" in data
        assert data["cached_result"]["citations"][0]["citation"] == "GSE1"


# ---------------------------------------------------------------------------
# GET /api/v1/task/{task_id}/stream
# ---------------------------------------------------------------------------

class TestStreamEndpoint:
    def test_stream_nonexistent_task(self, client):
        response = client.get("/api/v1/task/nonexistent/stream")
        assert response.status_code == 404

    def test_stream_existing_task_returns_events(self, client):
        """
        Перевіряємо SSE-потік: реєструємо задачу напряму через TaskManager,
        кладемо серіалізовані події в чергу — без фонового воркера.
        """
        task_manager = client.app.state.task_manager
        task_id = "test-stream-task"
        q = task_manager.create_extraction_task(task_id)

        # Кладемо events з серіалізованими даними (без MagicMock)
        q.put({"type": "progress", "message": "Processing..."})
        q.put({"type": "complete", "result": {"authors": "Smith J", "citations": []}})

        with client.stream("GET", f"/api/v1/task/{task_id}/stream") as resp:
            assert resp.status_code == 200
            events = []
            for line in resp.iter_lines():
                if line.startswith("data:"):
                    events.append(line)
            assert len(events) == 2  # progress + complete




# ---------------------------------------------------------------------------
# POST /api/v1/task/{task_id}/cancel
# ---------------------------------------------------------------------------

class TestCancelEndpoint:
    def test_cancel_nonexistent_task(self, client):
        response = client.post("/api/v1/task/nonexistent/cancel")
        assert response.status_code == 404

    def test_cancel_existing_task(self, client, pdf_bytes):
        post_resp = client.post(
            "/api/v1/extract",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
        )
        task_id = post_resp.json()["task_id"]

        cancel_resp = client.post(f"/api/v1/task/{task_id}/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json() == {"status": "cancelled"}


# ---------------------------------------------------------------------------
# POST /api/v1/task/{task_id}/pause
# ---------------------------------------------------------------------------

class TestPauseEndpoint:
    def test_pause_nonexistent_task(self, client):
        response = client.post("/api/v1/task/nonexistent/pause")
        assert response.status_code == 404

    def test_pause_existing_task(self, client, pdf_bytes):
        post_resp = client.post(
            "/api/v1/extract",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
        )
        task_id = post_resp.json()["task_id"]

        pause_resp = client.post(f"/api/v1/task/{task_id}/pause")
        assert pause_resp.status_code == 200
        assert pause_resp.json() == {"status": "paused"}


# ---------------------------------------------------------------------------
# POST /api/v1/task/{task_id}/resume
# ---------------------------------------------------------------------------

class TestResumeEndpoint:
    def test_resume_nonexistent_task(self, client):
        response = client.post("/api/v1/task/nonexistent/resume")
        assert response.status_code == 404

    def test_resume_paused_task(self, client, pdf_bytes):
        post_resp = client.post(
            "/api/v1/extract",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
        )
        task_id = post_resp.json()["task_id"]

        client.post(f"/api/v1/task/{task_id}/pause")
        resume_resp = client.post(f"/api/v1/task/{task_id}/resume")
        assert resume_resp.status_code == 200
        assert resume_resp.json() == {"status": "resumed"}
