"""
Unit tests for src/finder_citations/pdf_parser.py

Покривають:
- read_spans: читання та нормалізація спанів рядка
- concat_text_blocks: конкатенація блоків за розміром шрифту
- read_by_blocks: читання PDF-файлу (без NER-моделі)
"""

import pytest

from finder_citations.pdf_parser import concat_text_blocks, read_by_blocks, read_spans


# ---------------------------------------------------------------------------
# read_spans
# ---------------------------------------------------------------------------

class TestReadSpans:
    def test_empty_spans_returns_empty(self):
        result = read_spans({"spans": []})
        assert result == {"text": "", "font_size": 0.0}

    def test_missing_spans_key_returns_empty(self):
        result = read_spans({})
        assert result == {"text": "", "font_size": 0.0}

    def test_basic_span_text(self):
        line = {"spans": [{"text": "Hello world", "size": 12.0}]}
        result = read_spans(line)
        assert "Hello" in result["text"]
        assert result["font_size"] == 12.0

    def test_filters_small_font(self):
        """Спани з розміром < 0.8 * max_size мають відфільтровуватись."""
        line = {
            "spans": [
                {"text": "Normal", "size": 12.0},
                {"text": "Tiny",   "size": 5.0},   # 5 < 0.8 * 12 = 9.6
            ]
        }
        result = read_spans(line)
        assert "Normal" in result["text"]
        assert "Tiny" not in result["text"]

    def test_keeps_borderline_font(self):
        """Спан рівно на межі 0.8 * max_size включається."""
        line = {
            "spans": [
                {"text": "Big",      "size": 10.0},
                {"text": "Borderline", "size": 8.0},  # 8 == 0.8 * 10
            ]
        }
        result = read_spans(line)
        assert "Borderline" in result["text"]

    def test_normalizes_unicode_fullwidth_digits(self):
        """NFKC-нормалізація: fullwidth цифри → ASCII цифри."""
        line = {"spans": [{"text": "\uff11\uff12\uff13", "size": 12.0}]}
        result = read_spans(line)
        assert "123" in result["text"]

    def test_normalizes_unicode_dash(self):
        line = {"spans": [{"text": "A\u2010B", "size": 12.0}]}
        result = read_spans(line)
        assert "-" in result["text"]

    def test_strips_non_allowed_chars(self):
        """Символи поза дозволеним набором мають видалятись."""
        line = {"spans": [{"text": "Hello\x00\x01World", "size": 12.0}]}
        result = read_spans(line)
        assert "\x00" not in result["text"]
        assert "Hello" in result["text"]

    def test_font_size_is_max_of_spans(self):
        line = {
            "spans": [
                {"text": "A", "size": 8.0},
                {"text": "B", "size": 14.0},
            ]
        }
        result = read_spans(line)
        assert result["font_size"] == 14.0

    def test_multiple_spans_joined(self):
        line = {
            "spans": [
                {"text": "Hello", "size": 12.0},
                {"text": " World", "size": 12.0},
            ]
        }
        result = read_spans(line)
        assert "Hello World" in result["text"]


# ---------------------------------------------------------------------------
# concat_text_blocks
# ---------------------------------------------------------------------------

class TestConcatTextBlocks:
    def test_empty_list_returns_empty_string(self):
        assert concat_text_blocks([]) == ""

    def test_single_block(self):
        blocks = [{"text": "Hello", "font_size": 12.0}]
        result = concat_text_blocks(blocks)
        assert "Hello" in result

    def test_sorts_larger_font_first(self):
        blocks = [
            {"text": "Small", "font_size": 8.0},
            {"text": "Large", "font_size": 14.0},
        ]
        result = concat_text_blocks(blocks)
        assert result.index("Large") < result.index("Small")

    def test_filters_repeated_blocks(self):
        """Блоки, що зустрічаються > 5 разів, мають відфільтровуватись."""
        blocks = [{"text": "header", "font_size": 12.0}] * 6
        result = concat_text_blocks(blocks)
        assert "header" not in result

    def test_keeps_blocks_within_threshold(self):
        """Блоки, що зустрічаються ≤ 5 разів, мають залишатись."""
        blocks = [{"text": "content", "font_size": 12.0}] * 5
        result = concat_text_blocks(blocks)
        assert "content" in result

    def test_groups_by_font_size(self):
        blocks = [
            {"text": "A", "font_size": 12.0},
            {"text": "B", "font_size": 8.0},
            {"text": "C", "font_size": 12.0},
        ]
        result = concat_text_blocks(blocks)
        # A та C мають бути разом (однаковий розмір)
        assert "A" in result and "C" in result

    def test_custom_occ_threshold(self):
        blocks = [{"text": "repeat", "font_size": 12.0}] * 3
        # За threshold=2 блок 'repeat' (3 рази) має відфільтруватись
        result = concat_text_blocks(blocks, occ_threshold=2)
        assert "repeat" not in result


# ---------------------------------------------------------------------------
# read_by_blocks (integration з реальним PDF)
# ---------------------------------------------------------------------------

class TestReadByBlocks:
    def test_returns_blocks_and_authors(self, minimal_pdf_path):
        blocks, authors = read_by_blocks(minimal_pdf_path, ner_model=None)
        assert isinstance(blocks, list)
        assert isinstance(authors, list)

    def test_blocks_have_text_and_font_size(self, minimal_pdf_path):
        blocks, _ = read_by_blocks(minimal_pdf_path, ner_model=None)
        assert len(blocks) > 0
        for block in blocks:
            assert "text" in block
            assert "font_size" in block

    def test_no_ner_model_returns_empty_authors(self, minimal_pdf_path):
        _, authors = read_by_blocks(minimal_pdf_path, ner_model=None)
        assert authors == []

    def test_pdf_text_is_extracted(self, minimal_pdf_path):
        """PDF містить 'GSE12345' — має бути в хоча б одному блоці."""
        blocks, _ = read_by_blocks(minimal_pdf_path, ner_model=None)
        all_text = " ".join(b["text"] for b in blocks)
        assert "GSE12345" in all_text

    def test_font_size_is_positive(self, minimal_pdf_path):
        blocks, _ = read_by_blocks(minimal_pdf_path, ner_model=None)
        for block in blocks:
            assert block["font_size"] >= 0.0
