"""
Integration tests for app/routers/annotate.py

Покривають endpoints:
- POST /api/v1/annotate-pdf
- GET  /api/v1/download-annotated/{file_id}
"""

import io
import json
import time

import fitz
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def prefixes_csv(tmp_path) -> str:
    p = tmp_path / "prefixes.csv"
    p.write_text("prefix,type\n10.1234,10.SERV/CROSSREF\n")
    return str(p)


@pytest.fixture
def client(prefixes_csv, monkeypatch):
    monkeypatch.setenv("PREFIXES_CSV", prefixes_csv)

    from unittest.mock import MagicMock
    import finder_citations.pipeline as pipeline_mod
    mock_pipeline = MagicMock()
    monkeypatch.setattr(pipeline_mod, "FinderPipeline", lambda: mock_pipeline)

    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GSE12345 is a dataset.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# POST /api/v1/annotate-pdf
# ---------------------------------------------------------------------------

class TestAnnotatePdfEndpoint:
    def test_rejects_non_pdf_extension(self, client, pdf_bytes):
        response = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("report.txt", b"text content", "text/plain")},
            data={"citations": json.dumps([])},
        )
        assert response.status_code == 400
        assert "PDF" in response.json()["detail"]

    def test_rejects_missing_filename(self, client, pdf_bytes):
        """
        FastAPI/Starlette може повернути 422, якщо порожнє ім'я файлу не проходить
        внутрішню валідацію до того, як досягнеться перевірка в роутері.
        """
        response = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("", pdf_bytes, "application/pdf")},
            data={"citations": json.dumps([])},
        )
        assert response.status_code in (400, 422)

    def test_rejects_invalid_json_citations(self, client, pdf_bytes):
        response = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
            data={"citations": "not-valid-json"},
        )
        assert response.status_code == 400
        assert "JSON" in response.json()["detail"]

    def test_accepts_empty_citations_list(self, client, pdf_bytes):
        response = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
            data={"citations": json.dumps([])},
        )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert isinstance(data["task_id"], str)

    def test_accepts_valid_citations(self, client, pdf_bytes):
        citations = [
            {"citation": "GSE123", "context": "...GSE123...", "category": "Primary"},
        ]
        response = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
            data={"citations": json.dumps(citations)},
        )
        assert response.status_code == 200
        assert "task_id" in response.json()


# ---------------------------------------------------------------------------
# GET /api/v1/download-annotated/{file_id}
# ---------------------------------------------------------------------------

class TestDownloadAnnotatedEndpoint:
    def test_download_nonexistent_file(self, client):
        response = client.get("/api/v1/download-annotated/nonexistent-id")
        assert response.status_code == 404

    def test_download_annotated_pdf_after_annotation(self, client, pdf_bytes):
        """
        Запускаємо анотацію та чекаємо завершення task через stream,
        потім завантажуємо annotated PDF.
        """
        citations = [
            {
                "citation": "GSE12345",
                "context": "...GSE12345...",
                "category": "Primary",
                "color": [1.0, 0.9, 0.2],
                "title": "GEO Dataset",
            }
        ]
        post_resp = client.post(
            "/api/v1/annotate-pdf",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
            data={"citations": json.dumps(citations)},
        )
        assert post_resp.status_code == 200
        task_id = post_resp.json()["task_id"]

        # Чекаємо на завершення через stream
        file_id = None
        with client.stream("GET", f"/api/v1/task/{task_id}/stream") as stream_resp:
            for line in stream_resp.iter_lines():
                if line.startswith("data:"):
                    event = json.loads(line[len("data:"):].strip())
                    if event["type"] == "complete":
                        file_id = event["result"].get("file_id")
                        break

        assert file_id is not None, "Annotation task did not complete successfully"

        # Завантажуємо файл
        dl_resp = client.get(f"/api/v1/download-annotated/{file_id}")
        assert dl_resp.status_code == 200
        assert dl_resp.headers["content-type"] == "application/pdf"
        # PDF повинен мати непустий вміст
        assert len(dl_resp.content) > 0
