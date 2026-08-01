import logging
import re
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

from .extractors import (
    ARTICLE_PREFIXES,
    doi_correct,
    extract_prefix,
    pair_chars,
    re_doi,
    re_table,
    re_pdb,
    re_gen,
    make_local_regex
)

def mark_blocks(blocks: list[dict[str, Any]], patterns: list[re.Pattern], loc_patterns: list[tuple[re.Pattern, re.Pattern, int]], mark_pattern: re.Pattern) -> list[dict[str, Any]]:
    ids = set()
    ordered_text = '<!>'.join(block['text'] for block in blocks)

    for pat in patterns:
        found = [link.group(1) for link in re.finditer(pat, ordered_text)]
        ids.update(found)

    for loc_pat in loc_patterns:
        keywords_info = [(link.start(), loc_pat[2]) for link in re.finditer(loc_pat[0], ordered_text)]
        short_contexts = [ordered_text[max(0, kw[0] - kw[1]): min(len(ordered_text), kw[0] + kw[1])] for kw in keywords_info]

        found = [link.group(1) for text in short_contexts for link in re.finditer(loc_pat[1], text) 
                if link.start() != 0 and link.end() != len(text)]

        if loc_pat[1] == re_pdb:
            found = [link for link in found if any([char.isalpha() for char in link])]

        if loc_pat[1] == re_gen:
            found = [link for link in found if len(link) >= 6]

        ids.update(found)

    links = []
    for ident in ids:
        local_regex = make_local_regex(ident)
        links.extend([link for link in re.finditer(local_regex, ordered_text)])

    marks = []
    for link in links:
        context = ordered_text[max(link.start() - 1000, 0): min(link.start() + 1000, len(ordered_text))]
        link_marks = [(mark.group(1), mark.start()) for mark in re.finditer(mark_pattern, context)]

        if len(link_marks) > 0:
            main_mark = min(link_marks, key=lambda item: abs(len(context) // 2 - item[1]))[0]
            marks.append((main_mark.lower().replace(' ', ''), link.start()))

    sorted_marks = sorted(marks, key=lambda item: item[1], reverse=True)

    for mark in sorted_marks:
        match = re.search(r'\d+', mark[0])
        if match:
            text_mark = match.group()
            ordered_text = ordered_text[:mark[1]] + f'<{text_mark}>' + ordered_text[mark[1]:]

    marked_blocks = ordered_text.split('<!>')

    for i in range(len(marked_blocks)):
        blocks[i]['text'] = marked_blocks[i]

    return blocks

def search_context(text: str, pattern: re.Pattern, cont_size: int = 300, min_batch_size: int = 50) -> tuple[list[str], list[int], str]:
    contexts, starts = [], []
    count = len(re.findall(pattern, text))

    if count == 0:
        return [], [], text

    batch_size = max(cont_size // count, min_batch_size)
    reiter = re.finditer(pattern, text)

    for link in reiter:
        cont = '...' + text[max(link.start() - batch_size, 0): min(link.start() + batch_size, len(text))] + '...'
        contexts.append(cont)
        starts.append(link.start())
        text = text[:link.start()] + '!' * (link.end() - link.start()) + text[link.end():]

    return contexts, starts, text

def doi_compare(doi_cit: list[str], doi_link: list[str]) -> list[str]:
    if not doi_cit:
        return doi_link
    if not doi_link:
        return []

    links_matrix = pd.DataFrame(np.zeros((len(doi_cit), len(doi_link))), columns=list(doi_link), index=list(doi_cit))

    for col in links_matrix.columns:
        comparings = [(col in link or link in col) if col != link else False for link in doi_cit]
        links_matrix[col] = comparings

    summary = links_matrix.sum()
    filtered_links = summary[summary == 0].index.tolist()
    return filtered_links

def extract_doi_by_text(text: str, pattern: re.Pattern = re_doi) -> list[str]:
    doi_positions = [(link.start(), link.end()) for link in re.finditer(pattern, text)]
    approved_links = []

    for pos in doi_positions:
        link = text[pos[0]:pos[1]]
        nearest_words = text[pos[1]: min(pos[1] + 200, len(text))].split(' ')

        for i in range(len(nearest_words)):
            word = nearest_words[i].strip()

            if len(word) <= 3 or len(word) >= 50:
                break
            if any([char in word for char in ['http', 'www']]):
                break
            if any([char == word[0] for char in ['[', '(']]):
                break

            signs = '.-‐–—'
            not_alpha = not any([char.isalpha() for char in word]) and any([char in signs for char in word])
            not_broken_line = (word.islower() or word.isupper()) and link[-1] != ')' and any([char.isalpha() for char in word]) and any([char in signs for char in word])
            diff_chars = any([char.isalpha() for char in word]) and any([char.isdigit() for char in word])
            truncated_end = link[-1] == '.' and not any([char.isalpha() for char in word])
            without_digits_suffix = all([not char.isdigit() for char in link.split('/')[-1]]) if len(link.split('/')[-1].strip()) > 0 else False

            if sum([word.count(char) for char in signs]) <= 1 and len(word) - 1 in [word.find(char) for char in signs]:
                not_broken_line = False
                not_alpha = False

            if any([not_alpha, not_broken_line, diff_chars, truncated_end, without_digits_suffix]):
                link += word
            else:
                break

        trunc_chars = '@&=+$,'
        end_trunc_chars = '-‐–—/'

        without_stranges = all([char not in link if len(link) > 0 and char != link.strip()[-1] else True for char in trunc_chars])
        not_truncated = len(link) > 0 and link.strip()[-1] not in end_trunc_chars
        normal_length = 0 < len(link) <= 70
        without_diff_size = not (any([char.islower() for char in link]) and any([char.isupper() for char in link]))
        without_end_pairs = len(link) > 0 and not (pair_chars(link) and link[-1] in '])}')

        if all([without_stranges, not_truncated, normal_length, without_diff_size, without_end_pairs]):
            approved_links.append(link)

    links = list(set(map(doi_correct, approved_links)))
    filtered_links = doi_compare(links, links)

    logger.info("Text DOI extraction finished.")

    return filtered_links

def nearest_links_count(row: pd.Series, df: pd.DataFrame, density_threshold: int = 250) -> int:
    links_pos = df[df['article_id'] == row['article_id']]['start'].to_list()
    return len([link for link in filter(lambda pos: abs(pos - row['start']) <= density_threshold, links_pos)]) - 1

def cluster_type_identify(df: pd.DataFrame, article: str, edge_threshold: int = 2, inner_threshold: int = 3) -> pd.DataFrame:
    df_art = df[df['article_id'] == article]
    def _count(idx):
        try:
            return int(pd.to_numeric(df.loc[idx, 'near_links_count'], errors='coerce'))
        except (KeyError, IndexError, TypeError, ValueError):
            return 0

    for i in df_art.index:
        if i == df_art.index[0]:
            try:
                df.loc[i, 'cluster_type'] = 'Start' if (_count(i) >= edge_threshold and _count(i + 1) >= inner_threshold) else 'Outer'
            except (KeyError, IndexError):
                df.loc[i, 'cluster_type'] = 'Outer'
        elif i == df_art.index[-1]:
            try:
                df.loc[i, 'cluster_type'] = 'End' if df.loc[i - 1, 'cluster_type'] in ['Start', 'Inner'] else 'Outer'
            except (KeyError, IndexError):
                df.loc[i, 'cluster_type'] = 'Outer'
        else:
            try:
                left_cluster = df.loc[i - 1, 'cluster_type']
            except (KeyError, IndexError):
                left_cluster = None

            df.loc[i, 'cluster_type'] = (
                'Start' if (_count(i) >= edge_threshold
                           and _count(i + 1) >= inner_threshold
                           and left_cluster not in ['Start', 'Inner'])
                else 'Inner' if (_count(i) >= inner_threshold
                             and _count(i + 1) >= edge_threshold
                             and left_cluster not in ['End', 'Outer'])
                else 'End' if (_count(i) >= edge_threshold
                           and left_cluster not in ['End', 'Outer'])
                else 'Outer'
            )
    return df

def identify_table(row: pd.Series, mark_pattern: re.Pattern, cent_size: int = 15) -> Any:
    if row['cluster_type'] == 'Outer':
        return np.nan
    length = len(row['context'])
    center = row['context'][length // 2 - cent_size: length // 2 + cent_size]
    matcher = re.search(mark_pattern, center)
    if matcher:
        return matcher.group(1)
    return np.nan

def table_expand(df: pd.DataFrame) -> pd.DataFrame:
    if 'cluster_type' not in df.columns:
        return df

    df_start_end = df[(df['cluster_type'] == 'Start') | (df['cluster_type'] == 'End')]

    for i in range(0, len(df_start_end) - 1, 2):
        start_val = df_start_end.iloc[i].name
        end_val = df_start_end.iloc[i + 1].name
        if not isinstance(start_val, (int, str, float)) or not isinstance(end_val, (int, str, float)):
            continue
        start = int(start_val)
        end = int(end_val) + 1

        table_number = [df.loc[j, 'table'] for j in range(start, end)]
        tables = [table.lower().replace(' ', '') for table in table_number if isinstance(table, str)]
        counter = pd.Series(tables).value_counts()

        if len(counter) > 0:
            main_table = counter.idxmax()
            indexes = [ind for ind in range(start, end)]
            df.loc[indexes, 'table'] = main_table
    return df

def find_table_context(row: pd.Series, structured_text: str, cont_size: int = 300, min_batch_size: int = 75) -> str:
    context = ''
    table = row['table']
    if not isinstance(table, str):
        return row['context']
    table_number_match = re.search(r'\d+', table)
    if not table_number_match:
        return row['context']

    table_number = table_number_match.group()
    local_pattern = make_local_regex('table' + table_number)

    text = re.sub(r'<\d+>', '', structured_text)
    matches = list(re.finditer(local_pattern, text))
    if not matches:
        return row['context']

    batch_size = max(cont_size // len(matches), min_batch_size)

    for found in matches:
        context += '...' + text[max(0, found.start() - batch_size): found.start() + batch_size] + '...;\n'

    return context
