import io

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
