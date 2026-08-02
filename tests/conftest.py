import io
import pytest
import fitz


@pytest.fixture
def minimal_pdf_bytes() -> bytes:
    """Генерує мінімальний валідний PDF у пам'яті з акцесійними ID."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GenBank accession AB123456. GSE12345. See also SRP123456.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.fixture
def minimal_pdf_path(tmp_path, minimal_pdf_bytes) -> str:
    """Зберігає мінімальний PDF у тимчасову директорію та повертає шлях."""
    p = tmp_path / "test.pdf"
    p.write_bytes(minimal_pdf_bytes)
    return str(p)
