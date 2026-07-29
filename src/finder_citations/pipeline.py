import os
import re
import logging
from typing import Any, Callable, Optional

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
    ARTICLE_PREFIXES,
    extract_prefix,
    DB_URL_TEMPLATES
)
from .llm_classifier import get_classifier
from .pdf_parser import concat_text_blocks, read_by_blocks

def find_all(filename: str, initial_text: str, pattern: re.Pattern, pdf_dois: list[str], text_dois: list[str], df_res: pd.DataFrame) -> None:
    if pattern == re_doi:
        links = list(filter(lambda link: re.sub('/', '_', link.replace('https://doi.org/', '')) != filename[:-4].lower(), pdf_dois))
        text_links = list(filter(lambda link: re.sub('/', '_', link.replace('https://doi.org/', '')) != filename[:-4].lower(), text_dois))
        filtered_text_links = doi_compare(links, text_links)
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

class FinderPipeline:
    def __init__(self):
        self.classifier = get_classifier()
        spacy_model = os.getenv("SPACY_MODEL", "en_core_web_sm")
        try:
            model_path = f"models/spacy/{spacy_model}"
            if os.path.exists(model_path):
                self.ner_model = spacy.load(model_path)
                logger.info(f"Successfully loaded spacy NER model from local path ({model_path}).")
            else:
                self.ner_model = spacy.load(spacy_model)
                logger.info(f"Successfully loaded spacy NER model ({spacy_model}).")
        except Exception as e:
            logger.warning(f"Failed to load spacy NER model. Attempting to download... ({e})")
            try:
                import spacy.cli
                spacy.cli.download(spacy_model)
                self.ner_model = spacy.load(spacy_model)
                logger.info(f"Successfully downloaded and loaded spacy NER model ({spacy_model}).")
            except Exception as download_error:
                logger.warning(f"Failed to download and load spacy NER model: {download_error}. Authors extraction will be disabled.")
                self.ner_model = None

    def process_pdf(self, pdf_path: str, progress_callback: Optional[Callable[[str], None]] = None) -> dict[str, Any]:
        filename = os.path.basename(pdf_path)

        def report(msg: str):
            logger.info(f"[{filename}] {msg}")
            if progress_callback:
                progress_callback(msg)

        report("Starting PDF processing...")

        report("Reading PDF blocks and extracting authors...")
        blocks, authors = read_by_blocks(pdf_path, self.ner_model)

        marked_blocks = mark_blocks(blocks, ID_PATTERNS, ID_LOC_PATTERNS, re_table)

        structured_text = concat_text_blocks(marked_blocks)
        initial_text = structured_text

        report("Extracting DOIs...")

        df_citations = pd.DataFrame(columns=['article_id', 'dataset_id', 'pattern', 'context', 'start'])
        text_dois = extract_doi_by_text(structured_text)
        pdf_dois = extract_doi_from_pdf(pdf_path)

        report("Extracting DOIs and IDs...")
        all_link_patterns = [re_doi] + ID_PATTERNS
        for pattern in all_link_patterns:
            find_all(filename, initial_text, pattern, pdf_dois, text_dois, df_citations)

        ordered_text = '\n'.join(block['text'] for block in marked_blocks)
        for loc_pat in ID_LOC_PATTERNS:
            find_by_loc(filename, ordered_text, initial_text, loc_pat, df_citations)

        if df_citations.empty:
            report("No citations found. Returning early.")
            return {"authors": validate_authors(authors), "citations": []}

        report(f"Found {len(df_citations)} raw citations before deduplication. Processing contexts...")
        df_citations = df_citations.drop_duplicates(subset=['article_id', 'dataset_id']).reset_index(drop=True)
        df_dois = df_citations[df_citations['dataset_id'].str.startswith('http')].drop(columns=['start']).reset_index(drop=True)
        df_ids = df_citations[~df_citations['dataset_id'].str.startswith('http')].reset_index(drop=True)

        report(f"After deduplication: {len(df_dois)} unique DOIs and {len(df_ids)} unique IDs.")

        if not df_dois.empty:
            df_dois['context'] = df_dois['context'].apply(lambda contexts: ';\n'.join(contexts))
            df_dois['context'] = df_dois['context'].apply(lambda cont: re.sub(r'<.+?>', '', cont))

        if not df_ids.empty:
            report("Clustering IDs and identifying tables...")
            df_ids = df_ids.explode(['context', 'start'], ignore_index=True).sort_values(by=['article_id', 'start']).reset_index(drop=True)
            df_ids['near_links_count'] = df_ids.apply(lambda row: nearest_links_count(row, df_ids), axis=1)
            df_ids = cluster_type_identify(df_ids, filename[:-4])
            df_ids['table'] = df_ids.apply(lambda row: identify_table(row, re_table_mark), axis=1)
            df_ids = table_expand(df_ids)
            df_ids['context'] = df_ids.apply(lambda row: find_table_context(row, structured_text) if isinstance(row['table'], str) else row['context'], axis=1)
            df_ids = df_ids.drop_duplicates(subset=['article_id', 'dataset_id', 'context'])
            df_ids['context'] = df_ids.apply(lambda row: row['context'] if not isinstance(row['table'], str) else row['context'] + f'{row["dataset_id"]} inside the Table {row["table"]}', axis=1)

            dang_patterns = [pat[1] for pat in ID_LOC_PATTERNS]
            dang_ids = df_ids[df_ids['pattern'].isin(dang_patterns)]['dataset_id'].unique()

            df_ids = df_ids.drop(columns=['start', 'near_links_count', 'cluster_type', 'table']).groupby(by=['article_id', 'dataset_id']).agg(list).reset_index()
            df_ids['context'] = df_ids['context'].apply(lambda cont: ';\n'.join(cont))
            df_ids['context'] = df_ids['context'].apply(lambda cont: re.sub(r'<.+?>', '', cont))

        if not df_ids.empty:
            df_dang_ids_mask = df_ids['dataset_id'].isin(dang_ids)
            df_dang_ids = df_ids[df_dang_ids_mask].copy()
            df_safe_ids = df_ids[~df_dang_ids_mask].copy()

            if not df_dang_ids.empty:
                report(f"Verifying {len(df_dang_ids)} potentially ambiguous IDs using LLM...")
                texts = df_dang_ids['context'].tolist()
                cits = df_dang_ids['dataset_id'].tolist()
                verifications = self.classifier.verify_ids(
                    texts, 
                    cits,
                    cancel_check=lambda delay=None, progress=None: progress_callback(None, delay, progress) if progress_callback else None
                )
                df_dang_ids['is_valid'] = verifications
                df_dang_ids = df_dang_ids[df_dang_ids['is_valid'] == 'Yes'].drop(columns=['is_valid'])
                report(f"Successfully verified {len(df_dang_ids)} IDs using LLM.")

            df_ids = pd.concat([df_safe_ids, df_dang_ids], ignore_index=True)

        cumulative_processed = 0
        total_classification_tasks = len(df_ids) if not df_ids.empty else 0

        if not df_dois.empty:
            known_articles_mask = df_dois['dataset_id'].apply(lambda link: extract_prefix(link) in ARTICLE_PREFIXES)
            df_known_articles = df_dois[known_articles_mask].copy()
            df_dois_to_classify = df_dois[~known_articles_mask].copy()
            total_classification_tasks += len(df_dois_to_classify)
        else:
            df_known_articles = pd.DataFrame()
            df_dois_to_classify = pd.DataFrame()

        def classification_cancel_check(delay=None, progress=None):
            nonlocal cumulative_processed, total_classification_tasks
            if progress:
                current_in_batch, _ = progress
                absolute_current = cumulative_processed + current_in_batch
                if progress_callback:
                    progress_callback(None, delay, (absolute_current, total_classification_tasks))
            else:
                if progress_callback:
                    progress_callback(None, delay, None)

        report("Classifying verified citations...")
        if not df_ids.empty:
            report(f"Sending {len(df_ids)} IDs to LLM for Primary/Secondary classification...")
            df_ids['type'] = self.classifier.classify_ids(
                df_ids['context'].tolist(), 
                df_ids['dataset_id'].tolist(),
                cancel_check=classification_cancel_check
            )
            cumulative_processed += len(df_ids)

        if not df_dois.empty:
            if not df_known_articles.empty:
                df_known_articles['type'] = 'Article'
                report(f"Identified {len(df_known_articles)} DOIs as Articles by prefix filter.")

            if not df_dois_to_classify.empty:
                report(f"Sending {len(df_dois_to_classify)} DOIs to LLM for Dataset/Article classification...")
                df_dois_to_classify['type'] = self.classifier.classify_dois(
                    df_dois_to_classify['context'].tolist(), 
                    df_dois_to_classify['dataset_id'].tolist(),
                    cancel_check=classification_cancel_check
                )
                cumulative_processed += len(df_dois_to_classify)

                df_datasets = df_dois_to_classify[df_dois_to_classify['type'] == 'Dataset'].copy()
                df_articles = df_dois_to_classify[df_dois_to_classify['type'] != 'Dataset'].copy()

                datasets_count = len(df_datasets)
                report(f"{datasets_count} out of {len(df_dois_to_classify)} DOIs were classified as 'Dataset'.")

                if not df_datasets.empty:
                    authors_str = validate_authors(authors)
                    df_datasets['author'] = authors_str
                    
                    total_classification_tasks += len(df_datasets)

                    report(f"Sending {len(df_datasets)} 'Dataset' DOIs to LLM for Primary/Secondary classification...")
                    df_datasets['type'] = self.classifier.classify_primary_secondary_dois(
                        df_datasets['context'].tolist(), 
                        df_datasets['dataset_id'].tolist(), 
                        df_datasets['author'].tolist(),
                        cancel_check=classification_cancel_check
                    )
                    cumulative_processed += len(df_datasets)

                df_dois = pd.concat([df_known_articles, df_datasets, df_articles], ignore_index=True)
            else:
                df_dois = df_known_articles

        report("Processing complete. Formatting results...")
        results = []
        if not df_ids.empty:
            for _, row in df_ids.iterrows():
                pattern_obj = row['pattern'][0] if isinstance(row['pattern'], list) and len(row['pattern']) > 0 else row['pattern']
                url_template = DB_URL_TEMPLATES.get(pattern_obj)
                cid = str(row['dataset_id']).replace(' ', '')
                url = None
                if url_template:
                    url = url_template.format(cid) if '{}' in url_template else url_template

                res_dict = {
                    "citation": row['dataset_id'],
                    "context": row['context'],
                    "category": row['type']
                }
                if url:
                    res_dict["url"] = url
                results.append(res_dict)

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
