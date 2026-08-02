import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
from finder_citations.context_builder import mark_blocks
from finder_citations.extractors import ID_LOC_PATTERNS, ID_PATTERNS, re_table
from finder_citations.pdf_parser import concat_text_blocks, read_by_blocks


def process_pdf(pdf_path: str, out_dir: str):
    print(f"Processing: {pdf_path}")
    try:
        blocks, authors = read_by_blocks(pdf_path, ner_model=None)
        marked_blocks = mark_blocks(blocks, ID_PATTERNS, ID_LOC_PATTERNS, re_table)
        structured_text = concat_text_blocks(marked_blocks)
        filename = os.path.basename(pdf_path)
        base_name = os.path.splitext(filename)[0]
        out_path = os.path.join(out_dir, f"{base_name}.txt")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(structured_text)
        print(f"Saved to: {out_path}")
    except Exception as e:
        print(f"Error processing {pdf_path}: {e}")


def main():
    parser = argparse.ArgumentParser(description="Convert PDF(s) to text using the pipeline logic.")
    parser.add_argument(
        "--input", required=True, help="Relative or absolute path to a PDF file or a directory containing PDF files."
    )
    args = parser.parse_args()
    input_path = args.input
    if not os.path.exists(input_path):
        print(f"Error: {input_path} does not exist.")
        sys.exit(1)
    date_str = datetime.now().strftime("%Y-%m-%d")
    out_dir = os.path.join(os.getcwd(), "outputs", date_str)
    os.makedirs(out_dir, exist_ok=True)
    if os.path.isfile(input_path):
        if input_path.lower().endswith(".pdf"):
            process_pdf(input_path, out_dir)
        else:
            print(f"Error: {input_path} is not a PDF file.")
    elif os.path.isdir(input_path):
        pdf_files = [os.path.join(input_path, f) for f in os.listdir(input_path) if f.lower().endswith(".pdf")]
        if not pdf_files:
            print(f"No PDF files found in directory: {input_path}")
            sys.exit(0)
        for pdf in pdf_files:
            process_pdf(pdf, out_dir)


if __name__ == "__main__":
    main()
