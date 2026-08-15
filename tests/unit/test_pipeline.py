import re
from unittest.mock import MagicMock

import pytest

from finder_citations import pipeline as pipeline_mod
from finder_citations.extractors import re_gen_loc, re_geo, re_pdb_loc


@pytest.fixture
def mock_classifier() -> MagicMock:
    clf = MagicMock()
    clf.verify_ids.return_value = ["Yes"]
    clf.classify_ids.return_value = ["Secondary"]
    clf.classify_dois.return_value = ["Dataset"]
    clf.classify_primary_secondary_dois.return_value = ["Primary"]
    return clf


@pytest.fixture
def pipeline(monkeypatch, mock_classifier):
    monkeypatch.setattr(pipeline_mod, "get_classifier", lambda: mock_classifier)
    monkeypatch.setattr(pipeline_mod, "load_article_prefixes", lambda: {"10.1234"})
    monkeypatch.setattr(pipeline_mod.os.path, "exists", lambda path: False)
    monkeypatch.setattr(pipeline_mod.spacy, "load", lambda model: object())
    return pipeline_mod.FinderPipeline()


def test_find_all_collects_regex_matches(monkeypatch):
    res_list = []
    monkeypatch.setattr(pipeline_mod, "search_context", lambda *args, **kwargs: (["...context..."], [7], "modified"))
    pattern = re.compile("(GSE\\d+)")
    pipeline_mod.find_all("paper.pdf", "GSE12345 appears here", pattern, [], [], res_list)
    assert res_list == [
        {
            "article_id": "paper",
            "dataset_id": "GSE12345",
            "pattern": pattern,
            "context": ["...context..."],
            "start": [7],
        }
    ]


def test_find_all_calls_cancel_check(monkeypatch):
    calls = []

    def my_cancel():
        calls.append(1)

    res_list = []
    monkeypatch.setattr(pipeline_mod, "search_context", lambda *args, **kwargs: (["..."], [1], "mod"))
    pipeline_mod.find_all(
        "paper.pdf", "irrelevant", pipeline_mod.re_doi, [], ["10.1234/test"], res_list, cancel_check=my_cancel
    )
    assert len(calls) > 0


def test_find_all_collects_doi_matches(monkeypatch):
    res_list = []
    monkeypatch.setattr(
        pipeline_mod, "search_context", lambda *args, **kwargs: (["...doi context..."], [3], "modified")
    )
    pipeline_mod.find_all(
        "paper.pdf", "irrelevant", pipeline_mod.re_doi, [], ["https://doi.org/10.9999/data"], res_list
    )
    assert len(res_list) == 1
    assert res_list[0]["dataset_id"] == "https://doi.org/10.9999/data"
    assert res_list[0]["pattern"] == pipeline_mod.re_doi


def test_find_by_loc_collects_pdb_and_gen_matches(monkeypatch):
    monkeypatch.setattr(
        pipeline_mod, "search_context", lambda *args, **kwargs: (["...local context..."], [11], "modified")
    )
    pdb_results = []
    pipeline_mod.find_by_loc(
        "paper.pdf", "pdb 1ABC inside the text", "initial text", (re_pdb_loc, pipeline_mod.re_pdb, 200), pdb_results
    )
    assert pdb_results[0]["dataset_id"] == "1ABC"
    assert pdb_results[0]["pattern"] == pipeline_mod.re_pdb
    gen_results = []
    pipeline_mod.find_by_loc(
        "paper.pdf",
        "genbank AB123456 inside the text",
        "initial text",
        (re_gen_loc, pipeline_mod.re_gen, 200),
        gen_results,
    )
    assert gen_results[0]["dataset_id"] == "AB123456"
    assert gen_results[0]["pattern"] == pipeline_mod.re_gen


def test_find_by_loc_calls_cancel_check(monkeypatch):
    calls = []

    def my_cancel():
        calls.append(1)

    monkeypatch.setattr(pipeline_mod, "search_context", lambda *args, **kwargs: (["..."], [1], "mod"))
    pdb_results = []
    pipeline_mod.find_by_loc(
        "paper.pdf",
        "pdb 1ABC inside the text",
        "initial text",
        (re_pdb_loc, pipeline_mod.re_pdb, 200),
        pdb_results,
        cancel_check=my_cancel,
    )
    assert len(calls) > 0


def test_process_pdf_returns_early_when_no_citations(pipeline, monkeypatch):
    monkeypatch.setattr(pipeline_mod, "read_by_blocks", lambda path, ner_model, cancel_check=None: ([], []))
    monkeypatch.setattr(pipeline_mod, "mark_blocks", lambda blocks, *args: [])
    monkeypatch.setattr(pipeline_mod, "concat_text_blocks", lambda blocks: "")
    monkeypatch.setattr(pipeline_mod, "extract_doi_by_text", lambda text: [])
    monkeypatch.setattr(pipeline_mod, "extract_doi_from_pdf", lambda path: [])
    monkeypatch.setattr(pipeline_mod, "find_all", lambda *args, **kwargs: None)
    monkeypatch.setattr(pipeline_mod, "find_by_loc", lambda *args, **kwargs: None)
    result = pipeline.process_pdf("paper.pdf")
    assert result == {"authors": "Not found", "citations": []}


def test_process_pdf_happy_path_formats_results(pipeline, monkeypatch):
    monkeypatch.setattr(
        pipeline_mod,
        "read_by_blocks",
        lambda path, ner_model, cancel_check=None: ([{"text": "dummy block"}], ["Jane Smith"]),
    )
    monkeypatch.setattr(pipeline_mod, "mark_blocks", lambda blocks, *args: blocks)
    monkeypatch.setattr(pipeline_mod, "concat_text_blocks", lambda blocks: "structured text")
    monkeypatch.setattr(pipeline_mod, "extract_doi_by_text", lambda text: [])
    monkeypatch.setattr(pipeline_mod, "extract_doi_from_pdf", lambda path: [])
    monkeypatch.setattr(pipeline_mod, "ID_PATTERNS", [re_geo])
    monkeypatch.setattr(pipeline_mod, "ID_LOC_PATTERNS", [])

    def fake_find_all(filename, initial_text, pattern, pdf_dois, text_dois, res_list, cancel_check=None):
        if pattern == pipeline_mod.re_doi:
            res_list.extend(
                [
                    {
                        "article_id": "paper",
                        "dataset_id": "https://doi.org/10.1234/article",
                        "pattern": pipeline_mod.re_doi,
                        "context": ["article context"],
                        "start": [1],
                    },
                    {
                        "article_id": "paper",
                        "dataset_id": "https://doi.org/10.9999/data",
                        "pattern": pipeline_mod.re_doi,
                        "context": ["dataset context"],
                        "start": [2],
                    },
                ]
            )
        elif pattern == re_geo:
            res_list.append(
                {
                    "article_id": "paper",
                    "dataset_id": "GSE12345",
                    "pattern": re_geo,
                    "context": ["geo context"],
                    "start": [3],
                }
            )

    monkeypatch.setattr(pipeline_mod, "find_all", fake_find_all)
    monkeypatch.setattr(pipeline_mod, "find_by_loc", lambda *args, **kwargs: None)
    result = pipeline.process_pdf("paper.pdf")
    assert result["authors"] == "Jane Smith"
    citations = {item["citation"]: item for item in result["citations"]}
    assert citations["https://doi.org/10.1234/article"]["category"] == "Article"
    assert citations["https://doi.org/10.9999/data"]["category"] == "Primary"
    assert citations["GSE12345"]["category"] == "Secondary"
    assert citations["GSE12345"]["url"] == "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE12345"
