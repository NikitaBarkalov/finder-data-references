"""
Unit tests for src/finder_citations/extractors.py

Покривають:
- pair_chars: перевірка балансу дужок
- doi_correct: нормалізація DOI-рядка
- doi_select: пошук DOI у рядку (str та bytes)
- extract_prefix: виділення DOI-префіксу
- make_local_regex: побудова гнучкого regex
- validate_authors: фільтрація та форматування авторів
- Regex-паттерни: ID_PATTERNS для різних баз даних
"""

import re

import pytest

from finder_citations.extractors import (
    ID_PATTERNS,
    load_article_prefixes,
    doi_correct,
    doi_select,
    extract_prefix,
    make_local_regex,
    pair_chars,
    re_alphafold,
    re_arrayexpress,
    re_biosample,
    re_chembl,
    re_dbgap,
    re_doi,
    re_emdb,
    re_empiar,
    re_geo,
    re_interpro,
    re_nct,
    re_pfam,
    re_pxd,
    re_refseq,
    re_sra,
    validate_authors,
)


# ---------------------------------------------------------------------------
# pair_chars
# ---------------------------------------------------------------------------

class TestPairChars:
    def test_balanced_parentheses(self):
        assert pair_chars("(data)") is True

    def test_unbalanced_closing_paren(self):
        """Зайва закриваюча дужка → False."""
        assert pair_chars("data)") is False

    def test_unbalanced_closing_bracket(self):
        assert pair_chars("data]") is False

    def test_unbalanced_closing_brace(self):
        assert pair_chars("data}") is False

    def test_no_brackets_returns_true(self):
        assert pair_chars("hello world") is True

    def test_opening_only_returns_true(self):
        """Лише відкриваюча дужка — перевіряється лише останній символ."""
        assert pair_chars("(data") is True

    def test_nested_balanced(self):
        assert pair_chars("((a)(b))") is True


# ---------------------------------------------------------------------------
# doi_correct
# ---------------------------------------------------------------------------

class TestDoiCorrect:
    def test_strips_trailing_dot(self):
        result = doi_correct("10.1234/test.")
        assert result == "https://doi.org/10.1234/test"

    def test_strips_trailing_comma(self):
        result = doi_correct("10.1234/test,")
        assert result == "https://doi.org/10.1234/test"

    def test_normalizes_unicode_dash(self):
        result = doi_correct("10.1234/test\u2010data")
        assert result == "https://doi.org/10.1234/test-data"

    def test_removes_internal_spaces(self):
        result = doi_correct("10.12 34/te st")
        assert " " not in result
        assert result.startswith("https://doi.org/")

    def test_lowercases_doi(self):
        result = doi_correct("10.1234/TEST")
        assert "TEST" not in result
        assert "test" in result

    def test_strips_multiple_trailing_punctuation(self):
        result = doi_correct("10.1234/test.,;")
        assert result.endswith("test")


# ---------------------------------------------------------------------------
# doi_select
# ---------------------------------------------------------------------------

class TestDoiSelect:
    def test_string_with_doi(self):
        result = doi_select("https://doi.org/10.1000/xyz123")
        assert result is not None
        assert "10.1000" in result

    def test_bytes_with_doi(self):
        result = doi_select(b"https://doi.org/10.1000/xyz123")
        assert result is not None

    def test_no_doi_returns_none(self):
        assert doi_select("https://example.com/no-doi") is None

    def test_plain_text_returns_none(self):
        assert doi_select("just some plain text") is None

    def test_invalid_bytes_returns_none(self):
        # об'єкт без decode та не str — повертає None
        assert doi_select(12345) is None

    def test_embedded_doi_in_url(self):
        result = doi_select("https://doi.org/10.9999/some-suffix")
        assert result is not None
        assert result.startswith("https://doi.org/")


# ---------------------------------------------------------------------------
# extract_prefix
# ---------------------------------------------------------------------------

class TestExtractPrefix:
    def test_valid_doi_url(self):
        assert extract_prefix("https://doi.org/10.1234/test") == "10.1234"

    def test_valid_doi_longer(self):
        assert extract_prefix("https://doi.org/10.99999/data") == "10.99999"

    def test_no_match_returns_empty(self):
        assert extract_prefix("https://example.com") == ""

    def test_plain_string(self):
        assert extract_prefix("no-doi-here") == ""


# ---------------------------------------------------------------------------
# make_local_regex
# ---------------------------------------------------------------------------

class TestMakeLocalRegex:
    def test_matches_exact(self):
        pattern = make_local_regex("GSE123")
        assert re.search(pattern, "GSE123") is not None

    def test_matches_with_spaces(self):
        """Паттерн ігнорує пробіли між символами."""
        pattern = make_local_regex("GSE123")
        assert re.search(pattern, "G S E 1 2 3") is not None

    def test_escapes_dot(self):
        pattern = make_local_regex("10.1000/test")
        # Крапка у паттерні має бути екранована
        assert re.search(pattern, "10.1000/test") is not None

    def test_escapes_slash(self):
        pattern = make_local_regex("10.1000/test")
        assert re.search(pattern, "10.1000/test") is not None

    def test_case_insensitive(self):
        pattern = make_local_regex("gse123")
        assert re.search(pattern, "GSE123") is not None


# ---------------------------------------------------------------------------
# validate_authors
# ---------------------------------------------------------------------------

class TestValidateAuthors:
    def test_empty_list(self):
        assert validate_authors([]) == "Not found"

    def test_valid_author(self):
        result = validate_authors(["John Smith"])
        assert "John Smith" in result

    def test_multiple_authors(self):
        result = validate_authors(["John Smith", "Jane Doe"])
        assert "John Smith" in result
        assert "Jane Doe" in result

    def test_filters_numbers(self):
        result = validate_authors(["123456"])
        assert result == ""

    def test_strips_special_chars(self):
        result = validate_authors(["John@Smith"])
        assert "@" not in result

    def test_filters_too_short(self):
        """Ім'я з менш ніж 3 літерами фільтрується."""
        result = validate_authors(["AB"])
        # AB: sum alpha=2 < 3 → відфільтровується
        assert "AB" not in result

    def test_lowercase_start_filtered(self):
        """Слова, що починаються з маленької, фільтруються (split by uppercase start)."""
        result = validate_authors(["john smith"])
        # Обидва слова не починаються з великої → порожній рядок після фільтра
        assert "john" not in result

    def test_separator_comma_in_result(self):
        result = validate_authors(["John Smith", "Jane Doe"])
        assert "," in result


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

class TestRegexPatterns:
    # GEO
    def test_re_geo_matches(self):
        assert re_geo.search("GSE12345") is not None

    def test_re_geo_no_prefix(self):
        """Lookbehind не допускає символ A перед GSE."""
        assert re_geo.search("AGSE12345") is None

    def test_re_geo_no_suffix(self):
        assert re_geo.search("GSE12345X") is None

    # AlphaFold
    def test_re_alphafold_matches(self):
        assert re_alphafold.search("AF-Q8W3K0-F1") is not None

    def test_re_alphafold_with_model_version(self):
        assert re_alphafold.search("AF-Q8W3K0-F1-model-v2") is not None

    def test_re_alphafold_no_match(self):
        assert re_alphafold.search("AF-12345") is None

    # SRA
    def test_re_sra_srp(self):
        assert re_sra.search("SRP123456") is not None

    def test_re_sra_erp(self):
        assert re_sra.search("ERP123456") is not None

    def test_re_sra_srx(self):
        assert re_sra.search("SRX999999") is not None

    def test_re_sra_no_match(self):
        assert re_sra.search("XRP123") is None

    # EMDB
    def test_re_emdb_matches(self):
        assert re_emdb.search("EMD-1234") is not None

    def test_re_emdb_five_digits(self):
        assert re_emdb.search("EMD-12345") is not None

    # EMPIAR
    def test_re_empiar_matches(self):
        assert re_empiar.search("EMPIAR-10001") is not None

    # BioSample
    def test_re_biosample_matches(self):
        assert re_biosample.search("SAMN12345678") is not None
        assert re_biosample.search("SAMD12345678") is not None

    # ChEMBL
    def test_re_chembl_matches(self):
        assert re_chembl.search("CHEMBL123456") is not None

    # NCT
    def test_re_nct_matches(self):
        assert re_nct.search("NCT12345678") is not None

    def test_re_nct_wrong_length(self):
        assert re_nct.search("NCT1234567") is None  # 7 цифр замість 8

    # dbGaP
    def test_re_dbgap_matches(self):
        assert re_dbgap.search("phs000123") is not None

    def test_re_dbgap_with_version(self):
        assert re_dbgap.search("phs000123.v1.p1") is not None

    # RefSeq
    def test_re_refseq_nc(self):
        assert re_refseq.search("NC_000001") is not None

    def test_re_refseq_nm(self):
        assert re_refseq.search("NM_123456") is not None

    # InterPro
    def test_re_interpro_matches(self):
        assert re_interpro.search("IPR000001") is not None

    # Pfam
    def test_re_pfam_matches(self):
        assert re_pfam.search("PF00001") is not None

    # ArrayExpress
    def test_re_arrayexpress_matches(self):
        assert re_arrayexpress.search("E-MTAB-1234") is not None

    # PXD
    def test_re_pxd_matches(self):
        assert re_pxd.search("PXD000001") is not None

    # DOI
    def test_re_doi_matches(self):
        assert re_doi.search("10.1234/test-data") is not None

    def test_re_doi_no_match(self):
        assert re_doi.search("not-a-doi") is None

    # ID_PATTERNS completeness
    def test_id_patterns_is_list(self):
        assert isinstance(ID_PATTERNS, list)
        assert len(ID_PATTERNS) > 0


# ---------------------------------------------------------------------------
# load_article_prefixes
# ---------------------------------------------------------------------------

class TestLoadArticlePrefixes:
    def test_loads_only_article_mark_prefixes(self, tmp_path, monkeypatch):
        prefixes_csv = tmp_path / "prefixes.csv"
        prefixes_csv.write_text(
            "prefix,type\n10.1234,10.SERV/CROSSREF\n10.9999,OTHER\n"
        )
        monkeypatch.setattr("finder_citations.paths.resolve_prefixes_path", lambda: str(prefixes_csv))

        result = load_article_prefixes()

        assert result == {"10.1234"}

    def test_missing_file_returns_empty_set(self, tmp_path, monkeypatch):
        monkeypatch.setattr("finder_citations.paths.resolve_prefixes_path", lambda: str(tmp_path / "missing.csv"))

        assert load_article_prefixes() == set()
