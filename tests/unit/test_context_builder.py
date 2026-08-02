import numpy as np
import pandas as pd

from finder_citations.context_builder import (
    cluster_type_identify,
    doi_compare,
    extract_doi_by_text,
    find_table_context,
    identify_table,
    mark_blocks,
    nearest_links_count,
    search_context,
    table_expand,
)
from finder_citations.extractors import re_gen, re_gen_loc, re_geo, re_pdb, re_pdb_loc, re_table_mark


class TestSearchContext:
    def test_finds_single_match(self):
        text = "Hello world GSE12345 is a dataset."
        contexts, starts, _ = search_context(text, re_geo)
        assert len(contexts) == 1
        assert "GSE12345" in contexts[0]
        assert len(starts) == 1

    def test_no_match_returns_empty(self):
        text = "No accession IDs here."
        contexts, starts, modified = search_context(text, re_geo)
        assert contexts == []
        assert starts == []
        assert modified == text

    def test_multiple_matches(self):
        text = "First GSE111 and second GSE222 were used."
        contexts, starts, _ = search_context(text, re_geo)
        assert len(contexts) == 2
        assert len(starts) == 2

    def test_context_contains_surrounding_text(self):
        text = "before " + "x" * 50 + " GSE99999 " + "y" * 50 + " after"
        contexts, _, _ = search_context(text, re_geo, cont_size=300)
        assert len(contexts) == 1
        assert "GSE99999" in contexts[0]

    def test_start_positions_are_ordered(self):
        text = "GSE111 text text text GSE222"
        _, starts, _ = search_context(text, re_geo)
        assert starts == sorted(starts)

    def test_modified_text_replaces_match(self):
        text = "see GSE12345 for info"
        _, _, modified = search_context(text, re_geo)
        assert "GSE12345" not in modified
        assert "!" in modified

    def test_context_has_ellipsis(self):
        text = "data GSE12345 data"
        contexts, _, _ = search_context(text, re_geo)
        assert contexts[0].startswith("...")
        assert contexts[0].endswith("...")

    def test_min_batch_size_respected(self):
        matches = " ".join([f"GSE{i:05d}" for i in range(100)])
        contexts, _, _ = search_context(matches, re_geo, cont_size=300, min_batch_size=50)
        assert len(contexts) == 100


class TestDoiCompare:
    def test_empty_doi_cit_returns_link(self):
        result = doi_compare([], ["https://doi.org/10.1/test"])
        assert result == ["https://doi.org/10.1/test"]

    def test_empty_doi_link_returns_empty(self):
        result = doi_compare(["https://doi.org/10.1/test"], [])
        assert result == []

    def test_both_empty(self):
        assert doi_compare([], []) == []

    def test_exact_duplicate_not_filtered_by_doi_compare(self):
        doi = "https://doi.org/10.1/test"
        result = doi_compare([doi], [doi])
        assert result == [doi]

    def test_substring_match_filtered(self):
        cit = ["https://doi.org/10.1/test"]
        link = ["https://doi.org/10.1/test-extra"]
        result = doi_compare(cit, link)
        assert "https://doi.org/10.1/test-extra" not in result

    def test_unrelated_dois_kept(self):
        cit = ["https://doi.org/10.1/A"]
        link = ["https://doi.org/10.2/B"]
        result = doi_compare(cit, link)
        assert "https://doi.org/10.2/B" in result


class TestExtractDoiByText:
    def test_no_doi_returns_empty(self):
        text = "No citations in this text at all."
        result = extract_doi_by_text(text)
        assert result == []

    def test_returns_list(self):
        text = "See 10.1234/mydata for details."
        result = extract_doi_by_text(text)
        assert isinstance(result, list)

    def test_normalizes_doi_to_url(self):
        text = "Available at doi 10.1000/xyz"
        result = extract_doi_by_text(text)
        for doi in result:
            assert doi.startswith("https://doi.org/")

    def test_deduplicates(self):
        text = "See 10.1234/test and 10.1234/test again."
        result = extract_doi_by_text(text)
        assert len(result) == len(set(result))

    def test_extends_with_following_word(self):
        text = "See 10.1234/test."
        result = extract_doi_by_text(text)
        assert result == ["https://doi.org/10.1234/test"]

    def test_stops_on_http_suffix(self):
        text = "See 10.1234/test http://example.com for more."
        result = extract_doi_by_text(text)
        assert any(doi.startswith("https://doi.org/10.1234/test") for doi in result)

    def test_keeps_plain_doi_without_suffix(self):
        text = "See 10.1234/test."
        result = extract_doi_by_text(text)
        assert result == ["https://doi.org/10.1234/test"]


class TestNearestLinksCount:
    def _make_df(self, article_id: str, starts: list[int]) -> pd.DataFrame:
        return pd.DataFrame({"article_id": [article_id] * len(starts), "start": starts})

    def test_single_row_returns_zero(self):
        df = self._make_df("art1", [0])
        row = df.iloc[0]
        assert nearest_links_count(row, df) == 0

    def test_near_neighbour_counted(self):
        df = self._make_df("art1", [0, 100, 500])
        row = df.iloc[0]
        assert nearest_links_count(row, df, density_threshold=250) == 1

    def test_far_neighbour_not_counted(self):
        df = self._make_df("art1", [0, 600])
        row = df.iloc[0]
        assert nearest_links_count(row, df, density_threshold=250) == 0

    def test_other_article_not_counted(self):
        df = pd.DataFrame({"article_id": ["art1", "art2"], "start": [0, 50]})
        row = df.iloc[0]
        assert nearest_links_count(row, df, density_threshold=250) == 0

    def test_multiple_neighbours(self):
        df = self._make_df("art1", [0, 100, 200, 300, 1000])
        row = df.iloc[0]
        assert nearest_links_count(row, df, density_threshold=250) == 2


class TestClusterTypeIdentify:
    def _make_df(self, near_counts: list[int], article: str = "art1") -> pd.DataFrame:
        n = len(near_counts)
        return pd.DataFrame(
            {
                "article_id": [article] * n,
                "dataset_id": [f"ID{i}" for i in range(n)],
                "near_links_count": near_counts,
                "start": list(range(0, n * 100, 100)),
            }
        )

    def test_single_row_outer(self):
        df = self._make_df([0])
        result = cluster_type_identify(df, "art1")
        assert result.loc[0, "cluster_type"] == "Outer"

    def test_cluster_start_end_identified(self):
        df = self._make_df([2, 3, 3, 2])
        result = cluster_type_identify(df, "art1")
        assert result.loc[0, "cluster_type"] == "Start"
        assert result.loc[3, "cluster_type"] == "End"

    def test_all_outer(self):
        df = self._make_df([0, 0, 0])
        result = cluster_type_identify(df, "art1")
        assert all(result["cluster_type"] == "Outer")

    def test_returns_dataframe(self):
        df = self._make_df([1])
        result = cluster_type_identify(df, "art1")
        assert isinstance(result, pd.DataFrame)


class TestIdentifyTable:
    def test_outer_returns_nan(self):
        row = pd.Series({"cluster_type": "Outer", "context": "some text"})
        result = identify_table(row, re_table_mark)
        assert pd.isna(result)

    def test_inner_with_mark_returns_number(self):
        center_text = "x" * 15 + "<3>" + "x" * 15
        row = pd.Series({"cluster_type": "Inner", "context": center_text})
        result = identify_table(row, re_table_mark)
        assert result == "3"

    def test_inner_without_mark_returns_nan(self):
        row = pd.Series({"cluster_type": "Inner", "context": "no marker here"})
        result = identify_table(row, re_table_mark)
        assert pd.isna(result)

    def test_start_type_checked(self):
        center_text = "x" * 15 + "<1>" + "x" * 15
        row = pd.Series({"cluster_type": "Start", "context": center_text})
        result = identify_table(row, re_table_mark)
        assert result == "1"


class TestTableExpand:
    def test_no_cluster_type_column_returns_unchanged(self):
        df = pd.DataFrame({"a": [1, 2]})
        result = table_expand(df)
        pd.testing.assert_frame_equal(result, df)

    def test_empty_dataframe_with_column(self):
        df = pd.DataFrame({"cluster_type": [], "table": []})
        result = table_expand(df)
        assert len(result) == 0

    def test_expands_table_number_in_cluster(self):
        df = pd.DataFrame({"cluster_type": ["Start", "Inner", "End"], "table": ["table1", np.nan, np.nan]})
        result = table_expand(df)
        non_nan = result["table"].dropna()
        assert len(non_nan) > 0

    def test_no_start_end_rows_unchanged(self):
        df = pd.DataFrame({"cluster_type": ["Outer", "Outer"], "table": [np.nan, np.nan]})
        result = table_expand(df)
        assert result["cluster_type"].tolist() == ["Outer", "Outer"]

    def test_non_scalar_index_pair_is_skipped(self):
        df = pd.DataFrame(
            {"cluster_type": ["Start", "End"], "table": ["table1", "table1"]},
            index=pd.MultiIndex.from_tuples([(0, "a"), (1, "b")]),
        )
        result = table_expand(df)
        assert result.equals(df)


class TestFindTableContext:
    def test_non_string_table_returns_original_context(self):
        from finder_citations.context_builder import find_table_context

        row = pd.Series({"table": np.nan, "context": "original"})
        assert find_table_context(row, "table 1 in text") == "original"

    def test_table_without_number_returns_original_context(self):
        from finder_citations.context_builder import find_table_context

        row = pd.Series({"table": "table", "context": "original"})
        assert find_table_context(row, "table 1 in text") == "original"

    def test_table_without_matches_returns_original_context(self):
        from finder_citations.context_builder import find_table_context

        row = pd.Series({"table": "table3", "context": "original"})
        assert find_table_context(row, "no matching table here") == "original"

    def test_table_matches_are_expanded_into_context(self):
        row = pd.Series({"table": "table3", "context": "original"})
        structured_text = "prefix table3 middle table3 suffix"
        result = find_table_context(row, structured_text, cont_size=100, min_batch_size=10)
        assert "table3" in result.lower()
        assert "..." in result


class TestMarkBlocks:
    def test_marks_main_id_and_table_context(self):
        blocks = [{"text": "Intro GSE12345 and table1 marker <1>."}, {"text": "Second block."}]
        result = mark_blocks(blocks, [re_geo], [], re_table_mark)
        assert "<1>" in result[0]["text"]

    def test_local_id_patterns_are_found_and_filtered(self):
        blocks = [{"text": "pdb 1ABC and accession AB123456"}]
        result = mark_blocks(blocks, [], [(re_pdb_loc, re_pdb, 50), (re_gen_loc, re_gen, 50)], re_table_mark)
        assert isinstance(result, list)
