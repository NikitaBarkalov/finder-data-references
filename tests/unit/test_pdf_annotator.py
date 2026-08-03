import queue
import re
from unittest.mock import MagicMock

import fitz

from app.services.pdf_annotator import (
    _build_citation_regex,
    _build_robust_regex,
    _draw_page_badges,
    _get_regex_match_groups,
    remove_file,
    start_annotate_task,
)


class FakeAnnot:
    def __init__(self):
        self.colors = None
        self.opacity = None
        self.updated = False

    def set_colors(self, stroke=None):
        self.colors = stroke

    def set_opacity(self, value):
        self.opacity = value

    def update(self):
        self.updated = True


class FakePage:
    def __init__(self, number=0, width=200, raise_on_draw=False):
        self.number = number
        self.rect = fitz.Rect(0, 0, width, 200)
        self.raise_on_draw = raise_on_draw
        self.draw_calls = []
        self.text_calls = []
        self.links = []
        self.highlight_rects = []

    def draw_rect(self, rect, **kwargs):
        if self.raise_on_draw and len(self.draw_calls) >= 1:
            raise RuntimeError("draw failed")
        self.draw_calls.append((rect, kwargs))

    def insert_text(self, point, text, **kwargs):
        self.text_calls.append((point, text, kwargs))

    def add_highlight_annot(self, rect):
        self.highlight_rects.append(rect)
        return FakeAnnot()

    def insert_link(self, link):
        self.links.append(link)


class FakeDoc:
    def __init__(self, pages):
        self.pages = pages
        self.metadata = {}
        self.saved_to = None
        self.closed = False
        self.set_metadata_calls = []

    def __iter__(self):
        return iter(self.pages)

    def set_metadata(self, meta):
        self.metadata = meta
        self.set_metadata_calls.append(meta)

    def save(self, path):
        self.saved_to = path

    def close(self):
        self.closed = True


class FakeThread:
    def __init__(self, target=None, daemon=None):
        self.target = target
        self.daemon = daemon

    def start(self):
        if self.target:
            self.target()


def test_build_robust_regex_supports_doi_prefix_and_spacing():
    pattern = _build_robust_regex("10.1234/abc-def", is_doi=True)
    assert re.search(pattern, "doi: 10.1234/abc-def", re.IGNORECASE) is not None


def test_build_citation_regex_handles_doi_url_and_plain_text():
    doi_pattern = _build_citation_regex("See 10.1234/test in the paper")
    http_pattern = _build_citation_regex("https://example.org/path?q=1")
    plain_pattern = _build_citation_regex("cite: AlphaBeta")
    assert re.search(doi_pattern, "10.1234/test", re.IGNORECASE) is not None
    assert re.search(http_pattern, "example.org/path", re.IGNORECASE) is not None
    assert re.search(plain_pattern, "AlphaBeta", re.IGNORECASE) is not None


def test_get_regex_match_groups_finds_text_on_real_pdf():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GSE12345")
    groups = _get_regex_match_groups(page, "GSE12345")
    doc.close()
    assert len(groups) == 1
    assert len(groups[0]) >= 1


def test_get_regex_match_groups_returns_empty_for_blank_page():
    doc = fitz.open()
    page = doc.new_page()
    groups = _get_regex_match_groups(page, "GSE12345")
    doc.close()
    assert groups == []


def test_remove_file_deletes_existing_file(tmp_path):
    p = tmp_path / "temp.txt"
    p.write_text("data")
    assert p.exists()
    remove_file(str(p))
    assert not p.exists()


def test_remove_file_ignores_delete_errors(monkeypatch):
    monkeypatch.setattr("app.services.pdf_annotator.os.path.exists", lambda path: True)

    def boom(path):
        raise OSError("cannot delete")

    monkeypatch.setattr("app.services.pdf_annotator.os.remove", boom)
    remove_file("broken.txt")


def test_draw_page_badges_handles_multiple_sides_and_errors():
    page = FakePage(raise_on_draw=True)
    badges = [
        {"y0": 10, "title": "Dataset", "count": 1, "color": (1, 0, 0), "is_right": False},
        {"y0": 10, "title": "Dataset", "count": 2, "color": (1, 0, 0), "is_right": False},
    ]
    _draw_page_badges(page, badges)
    assert len(page.draw_calls) == 1
    assert len(page.text_calls) == 1


def test_start_annotate_task_happy_path(monkeypatch):
    page = FakePage()
    doc = FakeDoc([page])
    q: queue.Queue = queue.Queue()
    task_manager = MagicMock()
    task_manager.is_paused.return_value = False
    task_manager.is_cancelled.return_value = False
    task_manager.submit_task = lambda func, *args, **kwargs: func(*args, **kwargs)
    annotated_file_store = MagicMock()
    monkeypatch.setattr("app.services.pdf_annotator.fitz.open", lambda path: doc)
    monkeypatch.setattr(
        "app.services.pdf_annotator._get_regex_match_groups", lambda page, regex: [[fitz.Rect(10, 10, 20, 20)]]
    )
    monkeypatch.setattr("app.services.pdf_annotator.tempfile.mkstemp", lambda suffix: (1, "out.pdf"))
    monkeypatch.setattr("app.services.pdf_annotator.os.close", lambda fd: None)
    monkeypatch.setattr("app.services.pdf_annotator.uuid.uuid4", lambda: "file-id")
    monkeypatch.setattr("app.services.pdf_annotator.remove_file", lambda path: None)
    start_annotate_task(
        "task-1",
        q,
        "input.pdf",
        [{"citation": "10.1234/test", "text": "10.1234/test", "title": "Dataset", "color": [1, 0, 0]}],
        "input.pdf",
        task_manager,
        annotated_file_store,
    )
    messages = []
    while not q.empty():
        messages.append(q.get())
    assert messages[0]["type"] == "progress"
    assert messages[-1]["type"] == "complete"
    annotated_file_store.put.assert_called_once()
    assert page.links and page.links[0]["uri"].startswith("https://doi.org/")


def test_start_annotate_task_reports_error_on_open_failure(monkeypatch):
    q: queue.Queue = queue.Queue()
    task_manager = MagicMock()
    task_manager.is_paused.return_value = False
    task_manager.is_cancelled.return_value = False
    task_manager.submit_task = lambda func, *args, **kwargs: func(*args, **kwargs)
    annotated_file_store = MagicMock()
    monkeypatch.setattr(
        "app.services.pdf_annotator.fitz.open", lambda path: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    monkeypatch.setattr("app.services.pdf_annotator.remove_file", lambda path: None)
    start_annotate_task(
        "task-err",
        q,
        "input.pdf",
        [{"citation": "10.1234/test", "text": "10.1234/test"}],
        "input.pdf",
        task_manager,
        annotated_file_store,
    )
    msg = q.get_nowait()
    assert msg["type"] == "error"
    assert "boom" in msg["message"]
