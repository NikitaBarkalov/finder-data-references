import os
import re
from typing import Any

import pandas as pd
import spacy

from .context_builder import (
    cluster_type_identify,
    extract_doi_by_text,
    identify_table,
    nearest_links_count,
    re_table_mark,
    search_context,
    table_expand,
)
from .extractors import (
    ID_PATTERNS,
    extract_doi_from_pdf,
    make_local_regex,
    re_doi,
    validate_authors,
)
from .llm_classifier import get_classifier
from .pdf_parser import concat_text_blocks, read_by_blocks


class MDCPipeline:
    def __init__(self, llm_mode: str = 'API'):
        self.llm_mode = llm_mode
        self.classifier = get_classifier(llm_mode)
        try:
            self.ner_model = spacy.load("en_core_web_sm")
        except:
            self.ner_model = None

    def process_pdf(self, pdf_path: str) -> dict[str, Any]:
        filename = os.path.basename(pdf_path)
        blocks, authors = read_by_blocks(pdf_path, self.ner_model)
        
        structured_text = concat_text_blocks(blocks)
        initial_text = structured_text
        
        df_citations = pd.DataFrame(columns=['article_id', 'dataset_id', 'pattern', 'context', 'start'])
        text_dois = extract_doi_by_text(structured_text)
        
        pdf_dois = extract_doi_from_pdf(pdf_path)
        all_link_patterns = [re_doi] + ID_PATTERNS
        
        extracted_dois = set(text_dois + pdf_dois)
        for doi in extracted_dois:
            local_pattern = make_local_regex(doi.replace('https://doi.org/', ''))
            contexts, starts, _ = search_context(initial_text, local_pattern, 400, 75)
            if contexts:
                df_citations.loc[len(df_citations)] = [filename[:-4], doi, re_doi, contexts, starts]
        
        for pattern in ID_PATTERNS:
            for link in pattern.finditer(initial_text):
                found = re.sub(r'\s+', '', link.group(1))
                local_pattern = make_local_regex(found)
                contexts, starts, _ = search_context(initial_text, local_pattern, 400, 75)
                if contexts:
                    df_citations.loc[len(df_citations)] = [filename[:-4], found, pattern, contexts, starts]

        if df_citations.empty:
            return {"authors": validate_authors(authors), "citations": []}

        df_citations = df_citations.drop_duplicates(subset=['article_id', 'dataset_id']).reset_index(drop=True)
        df_dois = df_citations[df_citations['dataset_id'].str.startswith('http')].drop(columns=['start']).reset_index(drop=True)
        df_ids = df_citations[~df_citations['dataset_id'].str.startswith('http')].reset_index(drop=True)
        
        if not df_dois.empty:
            df_dois['context'] = df_dois['context'].apply(lambda contexts: ';\n'.join(contexts))
        if not df_ids.empty:
            df_ids = df_ids.explode(['context', 'start'], ignore_index=True).sort_values(by=['article_id', 'start']).reset_index(drop=True)
            df_ids['near_links_count'] = df_ids.apply(lambda row: nearest_links_count(row, df_ids), axis=1)
            df_ids = cluster_type_identify(df_ids, filename[:-4])
            df_ids['table'] = df_ids.apply(lambda row: identify_table(row, re_table_mark), axis=1)
            df_ids = table_expand(df_ids)
            df_ids = df_ids.drop_duplicates(subset=['article_id', 'dataset_id', 'context'])
            df_ids = df_ids.drop(columns=['start', 'near_links_count', 'cluster_type', 'table', 'pattern']).groupby(by=['article_id', 'dataset_id']).agg(list).reset_index()
            df_ids['context'] = df_ids['context'].apply(lambda cont: ';\n'.join(cont))

        if not df_ids.empty:
            texts = df_ids['context'].tolist()
            cits = df_ids['dataset_id'].tolist()
            verifications = self.classifier.verify_ids(texts, cits)
            df_ids['is_valid'] = verifications
            df_ids = df_ids[df_ids['is_valid'] == 'Yes']

        if not df_ids.empty:
            df_ids['type'] = self.classifier.classify_ids(df_ids['context'].tolist(), df_ids['dataset_id'].tolist())
            
        if not df_dois.empty:
            df_dois['type'] = self.classifier.classify_dois(df_dois['context'].tolist(), df_dois['dataset_id'].tolist())

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

        return {
            "authors": validate_authors(authors),
            "citations": results
        }
