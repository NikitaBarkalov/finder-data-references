import os
import re
import logging
from typing import Any

import pandas as pd
import spacy

logger = logging.getLogger(__name__)

from .context_builder import (
    cluster_type_identify,
    extract_doi_by_text,
    identify_table,
    nearest_links_count,
    search_context,
    table_expand,
    mark_blocks,
    doi_compare,
    find_table_context
)
from .extractors import (
    ID_PATTERNS,
    ID_LOC_PATTERNS,
    extract_doi_from_pdf,
    make_local_regex,
    re_doi,
    re_table,
    re_pdb,
    re_gen,
    re_table_mark,
    validate_authors,
)
from .llm_classifier import get_classifier
from .pdf_parser import concat_text_blocks, read_by_blocks


def find_all(filename: str, initial_text: str, pattern: re.Pattern, pdf_dois: list[str], text_dois: list[str], df_res: pd.DataFrame) -> None:
    if pattern == re_doi:
        links = list(filter(lambda link: re.sub('/', '_', link.replace('https://doi.org/', '')) != filename[:-4].lower(), pdf_dois))
        filtered_text_links = doi_compare(links, text_dois)
        final_links = links + filtered_text_links
    else:
        reiter = pattern.finditer(initial_text)
        final_links = [re.sub(r'\s+', '', link.group(1)) for link in reiter]
        
    for found in final_links:
        local_pattern = make_local_regex(found.replace('https://doi.org/', ''))
        cont_size = 400
        min_batch_size = 75
            
        contexts, starts, _ = search_context(initial_text, local_pattern, cont_size, min_batch_size)

        if len(contexts) > 0:
            df_res.loc[len(df_res)] = [filename[:-4], found, pattern, contexts, starts]


def find_by_loc(filename: str, ordered_text: str, initial_text: str, loc_pattern: tuple, df_res: pd.DataFrame) -> None:
    keywords_info = [(link.start(), loc_pattern[2]) for link in re.finditer(loc_pattern[0], ordered_text)]
    short_contexts = [ordered_text[max(0, kw[0] - kw[1]): min(len(ordered_text), kw[0] + kw[1])] for kw in keywords_info]

    links = [re.sub(r'\s+', '', link.group(1)) for text in short_contexts for link in re.finditer(loc_pattern[1], text) 
            if link.start() != 0 and link.end() != len(text)]

    if loc_pattern[1] == re_pdb:
        links = [link for link in links if any([char.isalpha() for char in link])]

    if loc_pattern[1] == re_gen:
        links = [link for link in links if len(link) >= 6]

    for found in links:
        loc_regex = make_local_regex(found)
        contexts, starts, _ = search_context(initial_text, loc_regex)

        if len(contexts) > 0:
            df_res.loc[len(df_res)] = [filename[:-4], found, loc_pattern[1], contexts, starts]


class MDCPipeline:
    def __init__(self, llm_mode: str = 'API'):
        self.llm_mode = llm_mode
        self.classifier = get_classifier(llm_mode)
        try:
            self.ner_model = spacy.load("en_core_web_sm")
            logger.info("Successfully loaded spacy NER model (en_core_web_sm).")
        except Exception as e:
            logger.warning(f"Failed to load spacy NER model: {e}. Authors extraction will be disabled.")
            self.ner_model = None

    def process_pdf(self, pdf_path: str) -> dict[str, Any]:
        filename = os.path.basename(pdf_path)
        logger.info(f"[{filename}] Starting PDF processing...")
        
        logger.info(f"[{filename}] Reading PDF blocks and extracting authors...")
        blocks, authors = read_by_blocks(pdf_path, self.ner_model)
        
        marked_blocks = mark_blocks(blocks, ID_PATTERNS, ID_LOC_PATTERNS, re_table)
        
        structured_text = concat_text_blocks(marked_blocks)
        initial_text = structured_text
        
        logger.info(f"[{filename}] Extracting DOIs...")
        
        df_citations = pd.DataFrame(columns=['article_id', 'dataset_id', 'pattern', 'context', 'start'])
        text_dois = extract_doi_by_text(structured_text)
        pdf_dois = extract_doi_from_pdf(pdf_path)
        
        logger.info(f"[{filename}] Extracting DOIs and IDs...")
        all_link_patterns = [re_doi] + ID_PATTERNS
        for pattern in all_link_patterns:
            find_all(filename, initial_text, pattern, pdf_dois, text_dois, df_citations)

        ordered_text = '\n'.join(block['text'] for block in marked_blocks)
        for loc_pat in ID_LOC_PATTERNS:
            find_by_loc(filename, ordered_text, initial_text, loc_pat, df_citations)

        if df_citations.empty:
            logger.info(f"[{filename}] No citations found. Returning early.")
            return {"authors": validate_authors(authors), "citations": []}

        logger.info(f"[{filename}] Found raw citations. Processing contexts...")
        df_citations = df_citations.drop_duplicates(subset=['article_id', 'dataset_id']).reset_index(drop=True)
        df_dois = df_citations[df_citations['dataset_id'].str.startswith('http')].drop(columns=['start']).reset_index(drop=True)
        df_ids = df_citations[~df_citations['dataset_id'].str.startswith('http')].reset_index(drop=True)
        
        if not df_dois.empty:
            df_dois['context'] = df_dois['context'].apply(lambda contexts: ';\n'.join(contexts))
            df_dois['context'] = df_dois['context'].apply(lambda cont: re.sub(r'<.+?>', '', cont))
            
        if not df_ids.empty:
            logger.info(f"[{filename}] Clustering IDs and identifying tables...")
            df_ids = df_ids.explode(['context', 'start'], ignore_index=True).sort_values(by=['article_id', 'start']).reset_index(drop=True)
            df_ids['near_links_count'] = df_ids.apply(lambda row: nearest_links_count(row, df_ids), axis=1)
            df_ids = cluster_type_identify(df_ids, filename[:-4])
            df_ids['table'] = df_ids.apply(lambda row: identify_table(row, re_table_mark), axis=1)
            df_ids = table_expand(df_ids)
            df_ids['context'] = df_ids.apply(lambda row: find_table_context(row, structured_text) if isinstance(row['table'], str) else row['context'], axis=1)
            df_ids = df_ids.drop_duplicates(subset=['article_id', 'dataset_id', 'context'])
            df_ids['context'] = df_ids.apply(lambda row: row['context'] if not isinstance(row['table'], str) else row['context'] + f'{row["dataset_id"]} inside the Table {row["table"]}', axis=1)
            df_ids = df_ids.drop(columns=['start', 'near_links_count', 'cluster_type', 'table', 'pattern']).groupby(by=['article_id', 'dataset_id']).agg(list).reset_index()
            df_ids['context'] = df_ids['context'].apply(lambda cont: ';\n'.join(cont))
            df_ids['context'] = df_ids['context'].apply(lambda cont: re.sub(r'<.+?>', '', cont))

        if not df_ids.empty:
            logger.info(f"[{filename}] Verifying IDs using LLM...")
            texts = df_ids['context'].tolist()
            cits = df_ids['dataset_id'].tolist()
            verifications = self.classifier.verify_ids(texts, cits)
            df_ids['is_valid'] = verifications
            df_ids = df_ids[df_ids['is_valid'] == 'Yes']

        logger.info(f"[{filename}] Classifying verified citations...")
        if not df_ids.empty:
            df_ids['type'] = self.classifier.classify_ids(df_ids['context'].tolist(), df_ids['dataset_id'].tolist())
            
        if not df_dois.empty:
            df_dois['type'] = self.classifier.classify_dois(df_dois['context'].tolist(), df_dois['dataset_id'].tolist())
            df_dois = df_dois[df_dois['type'] == 'Dataset'].copy()
            if not df_dois.empty:
                authors_str = validate_authors(authors)
                df_dois['author'] = authors_str
                df_dois['type'] = self.classifier.classify_primary_secondary_dois(
                    df_dois['context'].tolist(), 
                    df_dois['dataset_id'].tolist(), 
                    df_dois['author'].tolist()
                )

        results = []
        if not df_ids.empty:
            for _, row in df_ids.iterrows():
                results.append({
                    "citation": row['dataset_id'],
                    "context": row['context'],
                    "category": row['type']
                })
        if not df_dois.empty:
            for _, row in df_dois.iterrows():
                results.append({
                    "citation": row['dataset_id'],
                    "context": row['context'],
                    "category": row['type']
                })

        logger.info(f"[{filename}] Processing complete. Extracted {len(results)} citations.")
        return {
            "authors": validate_authors(authors),
            "citations": results
        }
