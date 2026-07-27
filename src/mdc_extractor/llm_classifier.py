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


class APIClassifier(ClassifierStrategy):
    def __init__(self, api_key: str, invoke_url: str = None, model: str = None):
        self.api_key = api_key
        self.invoke_url = invoke_url or os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
        self.model = model or os.getenv("LLM_MODEL_NAME", "meta/llama-3.1-8b-instruct")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    def _call_api(self, prompt: str) -> str:
        payload = {
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "model": self.model,
            "max_tokens": 10,
            "temperature": 0.0,
            "top_p": 1
        }
        
        response = requests.post(self.invoke_url, headers=self.headers, json=payload, stream=False)
        if response.status_code == 200:
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        else:
            print(f"API Error: {response.text}")
            return ""

    def verify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_id_verifying_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Yes" if "Yes" in res else "No")
        return results

    def classify_ids(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_id_classification_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Primary" if "Primary" in res else "Secondary")
        return results
        
    def classify_dois(self, texts: list[str], citations: list[str]) -> list[str]:
        results = []
        for t, c in zip(texts, citations):
            prompt = self._make_data_classification_prompt(t, c)
            res = self._call_api(prompt)
            results.append("Dataset" if "Dataset" in res else "Article")
        return results

    def classify_primary_secondary_dois(self, texts: list[str], citations: list[str], authors: list[str]) -> list[str]:
        results = []
        for t, c, a in zip(texts, citations, authors):
            prompt = self._make_doi_classification_prompt(t, c, a)
            res = self._call_api(prompt)
            results.append("Primary" if "Primary" in res else "Secondary")
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
        api_key=os.getenv("LLM_API_KEY", os.getenv("NVIDIA_API_KEY", "mock-key")),
        invoke_url=os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1/chat/completions"),
        model=os.getenv("LLM_MODEL_NAME", "meta/llama-3.1-8b-instruct")
    )
