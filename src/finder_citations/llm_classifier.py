import os
import re
from typing import Literal

import requests
import torch

class ClassifierStrategy:
    def verify_ids(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        raise NotImplementedError

    def classify_ids(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        raise NotImplementedError

    def classify_dois(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        raise NotImplementedError

    def classify_primary_secondary_dois(self, texts: list[str], citations: list[str], authors: list[str], cancel_check=None) -> list[str]:
        raise NotImplementedError

import openai
import logging

logger = logging.getLogger(__name__)

class APIClassifier(ClassifierStrategy):
    def __init__(self, api_key: str, invoke_url: str = None, model: str = None):
        self.api_key = api_key

        raw_url = invoke_url or os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
        if raw_url.endswith("/chat/completions"):
            raw_url = raw_url.replace("/chat/completions", "")

        self.client = openai.OpenAI(
            api_key=self.api_key,
            base_url=raw_url,
            max_retries=0
        )
        self.model = model or os.getenv("LLM_MODEL_NAME", "llama-3.1-8b-instant")

        self.rpm = int(os.getenv("RATE_LIMIT_RPM", 30))
        self.tpm = int(os.getenv("RATE_LIMIT_TPM", 6000))
        self.request_timestamps = []
        self.token_timestamps = []

    def _interruptible_sleep(self, wait_time: float, cancel_check=None, display_delay=None):
        import time
        if wait_time <= 0: return
        start = time.time()
        while True:
            remaining = wait_time - (time.time() - start)
            if cancel_check:
                try:
                    if display_delay is not None:
                        reported_delay = max(0, display_delay - (time.time() - start))
                        cancel_check(reported_delay)
                    else:
                        cancel_check()
                except TypeError:
                    cancel_check()
            if remaining <= 0: break
            time.sleep(min(0.5, remaining))

    def _wait_for_rate_limit(self, estimated_tokens: int, cancel_check=None, remaining_items: int = 1):
        import time
        now = time.time()

        if self.rpm == 0 and self.tpm == 0:
            return

        self.request_timestamps = [ts for ts in self.request_timestamps if now - ts < 60]
        self.token_timestamps = [(ts, tokens) for ts, tokens in self.token_timestamps if now - ts < 60]

        current_rpm = len(self.request_timestamps)
        current_tpm = sum(tokens for ts, tokens in self.token_timestamps)

        rpm_ok = self.rpm == 0 or current_rpm < self.rpm
        tpm_ok = self.tpm == 0 or current_tpm + estimated_tokens <= self.tpm

        if rpm_ok and tpm_ok:

            new_now = time.time()
            if self.rpm > 0: self.request_timestamps.append(new_now)
            if self.tpm > 0: self.token_timestamps.append((new_now, estimated_tokens))
            return

        requests_needed = min(remaining_items, self.rpm) if self.rpm > 0 else 0
        tokens_needed = min(estimated_tokens * remaining_items, self.tpm) if self.tpm > 0 else 0

        requests_to_free = current_rpm + requests_needed - self.rpm if self.rpm > 0 else 0
        wait_time_requests = 0
        if requests_to_free > 0 and len(self.request_timestamps) >= requests_to_free:
            ts = self.request_timestamps[requests_to_free - 1]
            wait_time_requests = 60 - (now - ts)

        tokens_to_free = current_tpm + tokens_needed - self.tpm if self.tpm > 0 else 0
        wait_time_tokens = 0
        if tokens_to_free > 0:
            freed = 0
            for ts, t in self.token_timestamps:
                freed += t
                if freed >= tokens_to_free:
                    wait_time_tokens = 60 - (now - ts)
                    break

        wait_time = max(wait_time_requests, wait_time_tokens)

        if wait_time > 0:
            rpm_str = "Unlimited" if self.rpm == 0 else f"{current_rpm}/{self.rpm}"
            tpm_str = "Unlimited" if self.tpm == 0 else f"{current_tpm}/{self.tpm}"
            logger.info(f"Rate limit reached ({rpm_str} RPM, {tpm_str} TPM). Waiting {wait_time:.1f}s...")
            self._interruptible_sleep(wait_time, cancel_check, display_delay=wait_time)

            return self._wait_for_rate_limit(estimated_tokens, cancel_check, remaining_items)

    def _call_api(self, prompt: str, cancel_check=None, remaining_items: int = 1) -> str:
        import time

        estimated_tokens = (len(prompt) // 3) + 10
        self._wait_for_rate_limit(estimated_tokens, cancel_check, remaining_items)

        max_attempts = 5
        attempt = 0
        while attempt < max_attempts:
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=10,
                    temperature=0.0,
                    top_p=1
                )
                self._interruptible_sleep(0.5, cancel_check) 

                if not response or not hasattr(response, 'choices') or not response.choices:
                    raise ValueError(f"Invalid or empty response: {response}")

                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("Message content is None")

                return content.strip()
            except Exception as e:
                err_msg = str(e).lower()
                is_rate_limit = "429" in err_msg or "too many requests" in err_msg or "rate_limit" in err_msg

                if attempt == max_attempts - 1 and not is_rate_limit:
                    logger.warning(f"API Error (Final Attempt Failed): {e}")
                    return ""

                sleep_time = 2
                if is_rate_limit:
                    import re
                    match_time = re.search(r'try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?', err_msg)
                    match_tokens = re.search(r'limit\s+(\d+),\s*used\s+(\d+),\s*requested\s+(\d+)', err_msg)

                    if match_time:
                        h = float(match_time.group(1)) if match_time.group(1) else 0.0
                        m = float(match_time.group(2)) if match_time.group(2) else 0.0
                        s = float(match_time.group(3)) if match_time.group(3) else 0.0
                        base_sleep_time = h * 3600 + m * 60 + s

                        if match_tokens and remaining_items > 1:
                            limit = float(match_tokens.group(1))
                            used = float(match_tokens.group(2))
                            requested = float(match_tokens.group(3))

                            refill_rate = limit / 86400.0 
                            if 'per minute' in err_msg or '(tpm)' in err_msg or '(rpm)' in err_msg:
                                refill_rate = limit / 60.0
                            elif 'per second' in err_msg:
                                refill_rate = limit

                            total_requested = min(requested * remaining_items, limit)
                            available = max(0, limit - used)

                            if total_requested > available:
                                shortfall = total_requested - available
                                sleep_time = (shortfall / refill_rate) + 1
                            else:
                                sleep_time = base_sleep_time + 1
                        else:
                            sleep_time = base_sleep_time + 1
                    else:
                        sleep_time = (2 ** attempt + 3)
                        attempt += 1 
                else:
                    sleep_time = (2 ** attempt + 3)
                    attempt += 1

                logger.info(f"API Error ({e}). Retrying in {sleep_time} seconds...")
                self._interruptible_sleep(sleep_time, cancel_check, display_delay=sleep_time)

    def verify_ids(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        results = []
        total = len(texts)
        for i, (t, c) in enumerate(zip(texts, citations)):
            if cancel_check:
                try: cancel_check(progress=(i + 1, total))
                except TypeError: cancel_check()
            prompt = self._make_id_verifying_prompt(t, c)
            res = self._call_api(prompt, cancel_check, remaining_items=(total - i))

            results.append("No" if "no" in res.lower() and "yes" not in res.lower() else "Yes")
        return results

    def classify_ids(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        results = []
        total = len(texts)
        for i, (t, c) in enumerate(zip(texts, citations)):
            if cancel_check:
                try: cancel_check(progress=(i + 1, total))
                except TypeError: cancel_check()
            prompt = self._make_id_classification_prompt(t, c)
            res = self._call_api(prompt, cancel_check, remaining_items=(total - i))
            results.append("Primary" if "primary" in res.lower() else "Secondary")
        return results

    def classify_dois(self, texts: list[str], citations: list[str], cancel_check=None) -> list[str]:
        results = []
        total = len(texts)
        for i, (t, c) in enumerate(zip(texts, citations)):
            if cancel_check:
                try: cancel_check(progress=(i + 1, total))
                except TypeError: cancel_check()
            prompt = self._make_data_classification_prompt(t, c)
            res = self._call_api(prompt, cancel_check, remaining_items=(total - i))
            results.append("Dataset" if "dataset" in res.lower() else "Article")
        return results

    def classify_primary_secondary_dois(self, texts: list[str], citations: list[str], authors: list[str], cancel_check=None) -> list[str]:
        results = []
        total = len(texts)
        for i, (t, c, a) in enumerate(zip(texts, citations, authors)):
            if cancel_check:
                try: cancel_check(progress=(i + 1, total))
                except TypeError: cancel_check()
            prompt = self._make_doi_classification_prompt(t, c, a)
            res = self._call_api(prompt, cancel_check, remaining_items=(total - i))
            results.append("Primary" if "primary" in res.lower() else "Secondary")
        return results

    @staticmethod
    def _make_id_verifying_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
You are a verification engine that checks whether a citation belongs to a specific databases.

### Databases Description:
1) GenBank - an international database of nucleotide sequences with annotations. It includes genes, genomes, RNAs, and other nucleotide objects, linking them to protein sequences and scientific publications.
2) PDB (Protein Data Bank) - the global archive of three-dimensional structural data of biological macromolecules such as proteins, nucleic acids, and complexes. Maintained by the Worldwide Protein Data Bank consortium, it provides freely accessible experimentally determined structures to support research in biology, medicine, and biotechnology.

### Rules:
- Output **only one** line in this strict format:
  Answer: **[Yes]** - OR - Answer: **[No]**
- Output **[Yes]** only in cases when explicitly mentioned that the citation is from one of databases above.

### Task: determine if the citation cites on a dataset from one of mentioned above or similar databases.
Text: {cleaned_text}
Citation: {citation}
Answer: ["""

    @staticmethod
    def _make_id_classification_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
You are a classification engine of dataset citations. 

Your only task is to classify a citation from a scientific paper into one of the categories:
- **[Primary]** - raw or processed data generated as part of the paper, specifically for the study.
- **[Secondary]** - raw or processed data derived or reused from existing records or published data.

### Rules:
- Classify the citation as **[Primary]** only in cases when authors of the study created the dataset or when authors submitted or deposited the dataset to any database.
- Output **only one** line in this strict format:
  Category: [Primary] - OR - Category: [Secondary]

### Task: classify citation from the following text
Text: {cleaned_text}
Citation: {citation}
Category: ["""

    @staticmethod
    def _make_data_classification_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
You are a classification engine of dataset citations, that makes classification using only text and rules. 

Your only task is to classify a citation from a scientific paper into one of the categories:
- **[Dataset]** - direct link on dataset that was used in a scientific research.
- **[Article]** - link on article or another scientific paper.

### Rules:
- If citation cites on software package or library, classify the citation as **[Article]**.
- Classify a citation as **[Article]** if it refers to documents such as manuals, reports, guidelines, other procedures, or scientific papers that discuss, analyze, or describe datasets but do not directly link to the dataset itself.
- Classify a citation as **[Dataset]** only if it directly links to or explicitly mentions a specific dataset (e.g., raw data files, databases, or repositories containing data).
- Even if a citation references datasets indirectly or provides links to other resources, classify it as **[Article]** unless the primary focus is on the dataset itself.
- Ignore the word "Data" as an indicator of a dataset. A link should only be classified as a dataset if it is clearly dedicated to a dataset.
- Output **only one** line in this strict format:
  Category: [Dataset] - OR - Category: [Article]

### Task: classify citation from the following text
Text: {cleaned_text}
Citation: {citation}
Category: ["""

    @staticmethod
    def _make_doi_classification_prompt(text: str, citation: str, authors: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
You are a classification engine of dataset citations. 

Your only task is to classify a citation from a scientific paper into one of the categories:
- **[Primary]** - raw or processed data generated as part of the paper, specifically for the study.
- **[Secondary]** - raw or processed data derived or reused from existing records or published data.

### Rules:
- Output **only one** line in this strict format:
  Category: [Primary] - OR - Category: [Secondary]
- If citation is related at least one of the authors of the text, classify this citation as **[Primary]**
- If citations related with some authors but none of these authors is not the author of the text, classify the citation as **[Secondary]**
- If authors of the text were not found, use only text for classification
- If the citation is refers to the whole database or refers to the dataset that was created by data collecting organization, ignore the rule about authors and classify the citation as **[Secondary]**.

### Task: classify citation from the following text
Authors of the text: {authors}
Text: {cleaned_text}
Citation: {citation}
Category: ["""

def get_classifier() -> ClassifierStrategy:
    return APIClassifier(
        api_key=os.getenv("LLM_API_KEY", "mock-key"),
        invoke_url=os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
        model=os.getenv("LLM_MODEL_NAME", "llama-3.1-8b-instant")
    )
