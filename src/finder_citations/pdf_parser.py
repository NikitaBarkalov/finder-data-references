import re
import unicodedata
from collections import Counter
from statistics import multimode
from typing import Any, Tuple, List, Dict

import fitz

def read_spans(line: dict[str, Any], size_coef: float = 0.8) -> dict[str, Any]:
    spans = []

    for span in line.get('spans', []):
        spans.append(span)

    if not spans:
        return {'text': '', 'font_size': 0.0}

    normal_size = max([span['size'] for span in spans])
    spans = [span for span in spans if span['size'] >= size_coef * normal_size]

    text = unicodedata.normalize('NFKC', ''.join([span['text'] for span in spans]))
    cleaned_text = re.sub(r"[^A-Za-z0-9 \.,;\:\!\?\(\)\-\‐\-\‒\–\—\―/\&\@\#\$\%\№_\*\+\=\|\[\]]+", "", text)

    decoded_text = re.sub(r"[\-\‐\-\‒\–\—\―]+", "-", cleaned_text)
    unspaced_text = re.sub(r"[\u00A0\u2000-\u200B\u202F\u205F\u3000\t]", " ", decoded_text)
    pointed_text = re.sub(r"[\．\.\｡]", ".", unspaced_text)

    text_info = {
        'text': pointed_text,
        'font_size': normal_size
    }

    return text_info

def concat_text_blocks(blocks_info: list[dict[str, Any]], occ_threshold: int = 5) -> str:
    counter = Counter([block['text'].lower().strip() for block in blocks_info])
    filtered_blocks_info = [block for block in blocks_info if counter[block['text'].lower().strip()] <= occ_threshold]
    block_sizes = set(block['font_size'] for block in filtered_blocks_info)

    new_blocks = {size: [] for size in block_sizes}
    for block in filtered_blocks_info:
        new_blocks[block['font_size']].append(block['text'])

    sorted_blocks = dict(sorted(new_blocks.items(), reverse=True))
    filtered_sorted_blocks = {k: v for k, v in sorted_blocks.items() if len(v) > 0}

    full_text = ''
    for key in filtered_sorted_blocks:
        full_text += f"\n{' '.join(filtered_sorted_blocks[key])}"

    return full_text

def read_by_blocks(path: str, ner_model: Any = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    pdf = fitz.open(path)
    blocks_text = []
    authors = []

    for page_num, page in enumerate(pdf.pages()):
        structure = page.get_text('dict')

        for block in structure.get('blocks', []):
            if block['type'] == 0:
                block_texts = []
                for line in block.get('lines', []):
                    block_texts.append(read_spans(line))

                block_text = ' '.join([text_info['text'] for text_info in block_texts if text_info['text']])
                if not block_texts:
                    continue

                font_size = multimode([text_info['font_size'] for text_info in block_texts])[0]

                block_info = {
                    'text': re.sub(r' {2,}', ' ', block_text),
                    'font_size': round(font_size, 2)
                }

                blocks_text.append(block_info)

        if ner_model and (page_num == 0 or (page_num in [1, 2] and len(authors) <= 5)):
            structured_first_page = concat_text_blocks(blocks_text)
            page_blocks = re.split(r'\n', structured_first_page)
            block_num = 0
            while len(authors) <= 5 and block_num < len(page_blocks):
                block = page_blocks[block_num]
                ent_text = ner_model(block)
                authors += [ent.text for ent in ent_text.ents if ent.label_ == 'PERSON']
                block_num += 1

    pdf.close()
    return blocks_text, authors
