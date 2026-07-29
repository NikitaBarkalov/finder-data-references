import re
import fitz
from typing import List, Tuple
import pandas as pd
import os

re_table = re.compile(r'(?<![A-Za-z])(t\s*a\s*b\s*l\s*e\s*\d+)(?![A-Za-z0-9])', re.IGNORECASE)
re_table_mark = re.compile(r'<(\d+)>')
re_mark = re.compile(r'<.+>')

re_doi = re.compile(r'(?<![A-Za-z0-9])(1\s*[01]\s*\.(\s*\d\s*){1,9}\s*/\s*\S{1,70})')
re_doi_prefix = re.compile(r'/(1[01]\.\d+)/')

re_alphafold = re.compile(r'(?<![A-Za-z0-9])(AF\s*\-\s*[A-Z0-9]+\s*\-\s*F\d+(\s*\-\s*model\s*\-\s*v\d+)?)(?![A-Za-z0-9])')
re_arrayexpress = re.compile(r'(?<![A-Za-z0-9])(E\s*\-\s*[A-Z]{4}\s*\-\s*\d+)(?![A-Za-z0-9])')
re_biomodels = re.compile(r'(?<![A-Za-z0-9])((((BIOMD)|(MODEL))\d{10})|(BMID\d{12}))')
re_bioproject = re.compile(r'(?<![A-Za-z0-9])(PRJ((NA)|(EB)|(DB)|(EA)|(DA)|(NZ)|(DG)|(NS)|(NE))\d+)(?![A-Za-z0-9])') 
re_biosample = re.compile(r'(?<![A-Za-z0-9])(SAM[NED][A-Z]?\d+)(?![A-Za-z0-9])')
re_biostudies = re.compile(r'(?<![A-Za-z0-9])(S\s*\-\s*[A-Z]{4}[\-\_A-Z]*\d+)(?![A-Za-z0-9])')
re_cellosaurus = re.compile(r'(?<![A-Za-z0-9])(CVCL\s*_\s*[A-Z0-9]{4})(?![A-Za-z0-9])')
re_chembl = re.compile(r'(?<![A-Za-z0-9])(CHEMBL\d+)(?![A-Za-z0-9])')
re_dbgap = re.compile(r'(?<![A-Za-z0-9])(phs[0-9]{6}(\s*\.\s*v\d+\s*\.\s*p\d+)?)(?![A-Za-z0-9])')
re_ebisc = re.compile(r'(?<![A-Za-z0-9])([A-Z]{2,6}\s*i\d{3}\-\s*[A-Z]{1,2})(?![A-Za-z0-9])')
re_efo = re.compile(r'(?<![A-Za-z0-9])(EFO\s*_\s*\d{7})(?![A-Za-z0-9])')
re_ega = re.compile(r'(?<![A-Za-z0-9])(EGA[DSC]\d{11})(?![A-Za-z0-9])')
re_emdb = re.compile(r'(?<![A-Za-z0-9])(EMD\s*\-\s*\d{4,5})(?![A-Za-z0-9])')
re_empiar = re.compile(r'(?<![A-Za-z0-9])(EMPIAR\s*\-\s*\d{5,})(?![A-Za-z0-9])')
re_geo = re.compile(r'(?<![A-Za-z0-9])(GSE\d+)(?![A-Za-z0-9])')
re_gisaid = re.compile(r'(?<![A-Za-z0-9])(EPI\s*(\s*_\s*ISL\s*_\s*)?\d+)(?![A-Za-z0-9])')
re_hipsci = re.compile(r'(?<![A-Za-z0-9])(HPSI\d{4}\s*i\s*\-\s*[a-z]+\s*_\s*\d+)(?![A-Za-z0-9])')
re_hpa = re.compile(r'(?<![A-Za-z0-9])(((HPA)|(CAB))\d{6})(?![A-Za-z0-9])')
re_igsr = re.compile(r'(?<![A-Za-z0-9])(((GM)|(NA)|(HG))\d{5})(?![A-Za-z0-9])')
re_intact = re.compile(r'(?<![A-Za-z0-9])(EBI\s*\-\s*[0-9]+)(?![A-Za-z0-9])')
re_interpro = re.compile(r'(?<![A-Za-z0-9])(IPR\d{6})(?![A-Za-z0-9])')
re_metabolights = re.compile(r'(?<![A-Za-z0-9])((MTBLS\d+))(?![A-Za-z0-9])')
re_mint = re.compile(r'(?<![A-Za-z0-9])(((MINT)|(IM))\s*\-\s*\d{1,7})(?![A-Za-z0-9])')
re_nct = re.compile(r'(?<![A-Za-z0-9])(NCT\d{8})(?![A-Za-z0-9])')
re_pfam = re.compile(r'(?<![A-Za-z0-9])(PF\d{5})(?![A-Za-z0-9])')
re_pxd = re.compile(r'(?<![A-Za-z0-9])(PXD\d{6})(?![A-Za-z0-9])')
re_reactome = re.compile(r'(?<![A-Za-z0-9])((R\s*\-\s*[A-Z]{3}\s*\-\s*\d+(\s*\-\s*\d+)?(\s*\.\s*\d+)?)|(REACT\s*_\s*\d+(\s*\.\s*\d+)?))(?![A-Za-z0-9])')
re_refseq = re.compile(r'(?<![A-Za-z0-9])(((NC)|(NM))\s*_\s*\d+(\s*\.\s*\d+)?)(?![A-Za-z0-9])')
re_rfam = re.compile(r'(?<![A-Za-z0-9])(RF\d{5})(?![A-Za-z0-9])')
re_rnacentral = re.compile(r'(?<![A-Za-z0-9])(URS[0-9A-F]{10}(\s*\_\s*\d+)?)(?![A-Za-z0-9])')
re_sra = re.compile(r'(?<![A-Za-z0-9])(([SE]R[PRX]\d{6,}))(?![A-Za-z0-9])') 
re_treefam = re.compile(r'(?<![A-Za-z0-9])(TF\d{6})(?![A-Za-z0-9])')
re_uniparc = re.compile(r'(?<![A-Za-z0-9])(UPI[A-F0-9]{10})(?![A-Za-z0-9])')

ID_PATTERNS = [
    re_refseq, re_gisaid, re_arrayexpress, re_cellosaurus, re_empiar, re_bioproject, re_sra, re_chembl, re_interpro, re_biosample, re_pfam, re_geo, re_dbgap,
    re_emdb, re_igsr, re_intact, re_reactome, re_rfam, re_uniparc, re_biomodels, re_alphafold, re_biostudies, re_hpa, re_pxd, re_ebisc, re_efo,
    re_hipsci, re_metabolights, re_mint, re_nct, re_rnacentral, re_treefam
]

re_pdb_loc = re.compile(r'(?<![A-Za-z0-9])(pdb)(?![A-Za-z0-9])', re.IGNORECASE)
re_pdb = re.compile(r'(?<![A-Za-z0-9])([0-9]((([A-Z0-9]{3})|([a-z0-9]{3}))))(?![A-Za-z0-9])')

re_gen_loc = re.compile(r'(?<![A-Za-z0-9])((g\s*e\s*n\s*b\s*a\s*n\s*k)|(a\s*c\s*c\s*e\s*s\s*s\s*i\s*o\s*n)|(acc\s*(\.)?))(?![A-Za-z0-9])', re.IGNORECASE)
re_gen = re.compile(r'(?<![A-Za-z0-9])([A-Z]{1,2}[0-9]{5,})(?![A-Za-z0-9])')

ID_LOC_PATTERNS = [(re_pdb_loc, re_pdb, 200), (re_gen_loc, re_gen, 200)]

ARTICLE_MARKS = {
    '10.SERV/CROSSREF', '10.SERV/CNKI', '10.SERV/MEDRA', '10.SERV/KISTI', '10.SERV/JALC',
    '10.SERV/AIRITI', '10.SERV/ISTIC', '10.SERV/MEDRA-TEST', '10.SERV/HAND', '10.SERV/JALCTEST'
}

ARTICLE_PREFIXES = set()
try:
    _prefixes_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'input_data', 'prefixes.csv')
    if os.path.exists(_prefixes_path):
        _df = pd.read_csv(_prefixes_path, dtype={'prefix': str})
        ARTICLE_PREFIXES = set(_df[_df['type'].isin(ARTICLE_MARKS)]['prefix'].astype(str).values)
        print(f"[DEBUG] Successfully loaded {len(ARTICLE_PREFIXES)} prefixes from {_prefixes_path}")
    else:
        print(f"[DEBUG] prefixes.csv not found at {_prefixes_path}")
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Failed to load prefixes.csv: {e}")

def extract_prefix(dataset: str, pattern: re.Pattern = re_doi_prefix) -> str:
    matcher = re.search(pattern, dataset)
    return matcher.group(1) if matcher else ""

def make_local_regex(link: str, special_chars: str = '^$.|?*+()[]{}') -> re.Pattern:
    regex = r'\s*'.join(char if char not in special_chars else '\\' + char for char in link)
    return re.compile(regex, re.IGNORECASE)

def pair_chars(phrase: str, chars: list[Tuple[str, str]] = [('(', ')'), ('[', ']'), ('{', '}')]) -> bool:
    for char in chars:
        if phrase[-1] == char[1] and phrase.count(char[0]) != phrase.count(char[1]):
            return False
    return True

def doi_correct(doi_cit: str) -> str:
    while doi_cit and (doi_cit[-1] in '.,;:!?"\'/' or not pair_chars(doi_cit)):
        doi_cit = doi_cit[:-1]

    doi_cit = re.sub(r'[\-\‐\-\‒\–\—\―]', '-', doi_cit)
    return 'https://doi.org/' + re.sub(r'\s+', '', doi_cit).lower()

def doi_select(link: str, pattern: re.Pattern = re_doi) -> str:
    if not isinstance(link, str):
        try:
            link = link.decode('utf-8', errors='ignore')
        except:
            pass
    matcher = re.search(pattern, link)
    if matcher:
        return doi_correct(matcher.group(1))
    return None

def extract_doi_from_pdf(path: str) -> List[str]:
    pdf = fitz.open(path)
    links = []
    for page in pdf:
        for link in page.get_links():
            if 'uri' in link:
                uri = link['uri']
                doi = doi_select(uri)
                if doi:
                    links.append(doi)
    pdf.close()

    links = list(set(filter(lambda cit: cit, links)))
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"PDF Extraction: Found {len(links)} unique DOIs.")
    return links

def validate_authors(authors: list[str]) -> str:
    if len(authors) == 0:
        return 'Not found'

    corrected_authors = list(map(lambda author: re.sub(r'[^A-Za-z\.\s\-\|;]', '', author).strip(), authors))
    filtered_by_start_size = list(map(lambda author: ' '.join([name_part for name_part in author.split(' ') if len(name_part) > 0 and name_part[0].isupper()]), corrected_authors))
    filtered_authors_by_length = list(filter(lambda name: 3 <= sum([char.isalpha() for char in name]) and len(name.split()) >= 1, filtered_by_start_size))

    return ', '.join(filtered_authors_by_length)

DB_URL_TEMPLATES = {
    re_alphafold: 'https://alphafold.ebi.ac.uk/entry/{}',
    re_arrayexpress: 'https://www.ebi.ac.uk/biostudies/arrayexpress/studies/{}',
    re_biomodels: 'https://www.ebi.ac.uk/biomodels/{}',
    re_bioproject: 'https://www.ncbi.nlm.nih.gov/bioproject/{}',
    re_biosample: 'https://www.ncbi.nlm.nih.gov/biosample/{}',
    re_biostudies: 'https://www.ebi.ac.uk/biostudies/studies/{}',
    re_cellosaurus: 'https://www.cellosaurus.org/{}',
    re_chembl: 'https://www.ebi.ac.uk/chembl/compound_report_card/{}',
    re_dbgap: 'https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id={}',
    re_ebisc: 'https://cells.ebisc.org/{}',
    re_efo: 'https://www.ebi.ac.uk/ols/ontologies/efo/terms?short_form={}',
    re_ega: 'https://ega-archive.org/datasets/{}',
    re_emdb: 'https://www.ebi.ac.uk/emdb/{}',
    re_empiar: 'https://www.ebi.ac.uk/empiar/{}',
    re_geo: 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={}',
    re_gisaid: 'https://gisaid.org/',
    re_hipsci: 'http://www.hipsci.org/lines/#/lines/{}',
    re_hpa: 'https://www.proteinatlas.org/{}',
    re_igsr: 'https://www.internationalgenome.org/data-portal/sample/{}',
    re_intact: 'https://www.ebi.ac.uk/intact/search?query={}',
    re_interpro: 'https://www.ebi.ac.uk/interpro/entry/InterPro/{}',
    re_metabolights: 'https://www.ebi.ac.uk/metabolights/{}',
    re_mint: 'https://mint.bio.uniroma2.it/index.php/results-interactors/?id={}',
    re_nct: 'https://clinicaltrials.gov/study/{}',
    re_pfam: 'https://www.ebi.ac.uk/interpro/entry/pfam/{}',
    re_pxd: 'https://www.ebi.ac.uk/pride/archive/projects/{}',
    re_reactome: 'https://reactome.org/content/detail/{}',
    re_refseq: 'https://www.ncbi.nlm.nih.gov/nuccore/{}',
    re_rfam: 'https://rfam.org/family/{}',
    re_rnacentral: 'https://rnacentral.org/rna/{}',
    re_sra: 'https://www.ncbi.nlm.nih.gov/sra/{}',
    re_treefam: 'http://www.treefam.org/family/{}',
    re_uniparc: 'https://www.uniprot.org/uniparc/{}',
    re_pdb: 'https://www.rcsb.org/structure/{}',
    re_gen: 'https://www.ncbi.nlm.nih.gov/nuccore/{}'
}
