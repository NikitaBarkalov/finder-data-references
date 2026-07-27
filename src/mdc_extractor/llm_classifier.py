import os
import re
from typing import Literal

import requests
import torch


class ClassifierStrategy:
    def verify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        raise NotImplementedError
        
    def classify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        raise NotImplementedError
        
    def classify_dois(self, texts: list[str], citations: list[str]) -> list[str]:
        raise NotImplementedError
        
    def classify_primary_secondary_dois(self, texts: list[str], citations: list[str], authors: list[str]) -> list[str]:
        raise NotImplementedError


import openai

class APIClassifier(ClassifierStrategy):
    def __init__(self, api_key: str, invoke_url: str = None, model: str = None):
        self.api_key = api_key
        # For OpenAI client, base_url is usually the domain up to /v1
        # If user passes the full /chat/completions endpoint, strip it for the client.
        raw_url = invoke_url or os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
        if raw_url.endswith("/chat/completions"):
            raw_url = raw_url.replace("/chat/completions", "")
        
        self.client = openai.OpenAI(
            api_key=self.api_key,
            base_url=raw_url,
        )
        self.model = model or os.getenv("LLM_MODEL_NAME", "llama-3.1-8b-instant")
        
        # Rate Limiting configuration
        self.rpm = int(os.getenv("RATE_LIMIT_RPM", 30))
        self.tpm = int(os.getenv("RATE_LIMIT_TPM", 6000))
        self.request_timestamps = []
        self.token_timestamps = []
        
    def _wait_for_rate_limit(self, estimated_tokens: int):
        import time
        now = time.time()
        
        # Clean up old timestamps (older than 60 seconds)
        self.request_timestamps = [ts for ts in self.request_timestamps if now - ts < 60]
        self.token_timestamps = [(ts, tokens) for ts, tokens in self.token_timestamps if now - ts < 60]
        
        current_rpm = len(self.request_timestamps)
        current_tpm = sum(tokens for ts, tokens in self.token_timestamps)
        
        wait_time = 0
        if current_rpm >= self.rpm and self.request_timestamps:
            wait_time = max(wait_time, 60 - (now - self.request_timestamps[0]))
            
        if current_tpm + estimated_tokens > self.tpm and self.token_timestamps:
            wait_time = max(wait_time, 60 - (now - self.token_timestamps[0][0]))
            
        if wait_time > 0:
            print(f"Rate limit reached ({current_rpm}/{self.rpm} RPM, {current_tpm}/{self.tpm} TPM). Waiting {wait_time:.1f}s...")
            time.sleep(wait_time)
            # Re-evaluate after waiting
            return self._wait_for_rate_limit(estimated_tokens)
            
        # Register new request
        new_now = time.time()
        self.request_timestamps.append(new_now)
        self.token_timestamps.append((new_now, estimated_tokens))

    def _call_api(self, prompt: str) -> str:
        import time
        
        # Estimate tokens: 1 token is roughly 3-4 chars, plus max_tokens=10 for output
        estimated_tokens = (len(prompt) // 3) + 10
        self._wait_for_rate_limit(estimated_tokens)
        
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=10,
                    temperature=0.0,
                    top_p=1
                )
                time.sleep(0.5) # Slight delay to prevent burst limits
                
                if not response or not hasattr(response, 'choices') or not response.choices:
                    raise ValueError(f"Invalid or empty response: {response}")
                    
                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("Message content is None")
                    
                return content.strip()
            except Exception as e:
                err_msg = str(e).lower()
                is_rate_limit = "429" in err_msg or "too many requests" in err_msg or "rate_limit" in err_msg
                
                if attempt == max_attempts - 1:
                    print(f"API Error (Final Attempt Failed): {e}")
                    return ""
                    
                sleep_time = (2 ** attempt + 3) if is_rate_limit else 2
                print(f"API Error ({e}). Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)

    def verify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_id_verifying_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Yes" if "yes" in res.lower() else "No")
        return results

    def classify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_id_classification_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Primary" if "primary" in res.lower() else "Secondary")
        return results
        
    def classify_dois(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_data_classification_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Dataset" if "dataset" in res.lower() else "Article")
        return results

    def classify_primary_secondary_dois(self, texts: list[str], citations: list[str], authors: list[str]) -> list[str]:
        results = []
        for t, c, a in zip(texts, citations, authors):
            prompt = self._make_doi_classification_prompt(t, c, a)
            res = self._call_api(prompt)
            results.append("Primary" if "primary" in res.lower() else "Secondary")
        return results

    @staticmethod
    def _make_id_verifying_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
You are a verification engine that checks whether a citation belongs to a specific databases.
Text: {cleaned_text}
Citation: {citation}
Output only [Yes] or [No]."""

    @staticmethod
    def _make_id_classification_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
Classify a citation into [Primary] or [Secondary] dataset.
Text: {cleaned_text}
Citation: {citation}
Output only [Primary] or [Secondary]."""

    @staticmethod
    def _make_data_classification_prompt(text: str, citation: str) -> str:
        cleaned_text = re.sub(r'\s*\-\s+', '', text)
        return f"""
Classify a citation into [Dataset] or [Article].
Text: {cleaned_text}
Citation: {citation}
Output only [Dataset] or [Article]."""

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
  Category: [Primary] — OR — Category: [Secondary]
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
