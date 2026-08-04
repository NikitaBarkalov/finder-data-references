import io
import os

os.environ["LLM_BASE_URL"] = os.environ.get("LLM_BASE_URL", "http://localhost:8080/v1")
os.environ["LLM_API_KEY"] = os.environ.get("LLM_API_KEY", "mock-key")
os.environ["LLM_MODEL_NAME"] = os.environ.get("LLM_MODEL_NAME", "mock-model")
os.environ["RATE_LIMIT_RPM"] = os.environ.get("RATE_LIMIT_RPM", "30")
os.environ["RATE_LIMIT_TPM"] = os.environ.get("RATE_LIMIT_TPM", "12000")
os.environ["SPACY_MODEL"] = os.environ.get("SPACY_MODEL", "en_core_web_sm")
import fitz
import pytest


@pytest.fixture
def minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GenBank accession AB123456. GSE12345. See also SRP123456.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.fixture
def minimal_pdf_path(tmp_path, minimal_pdf_bytes) -> str:
    p = tmp_path / "test.pdf"
    p.write_bytes(minimal_pdf_bytes)
    return str(p)
