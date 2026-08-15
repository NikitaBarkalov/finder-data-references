import time
from unittest.mock import MagicMock, patch

import pytest

from finder_citations.llm_classifier import APIClassifier, ClassifierStrategy, get_classifier


def _make_mock_response(content: str, finish_reason: str = "stop") -> MagicMock:
    resp = MagicMock()
    resp.choices[0].message.content = content
    resp.choices[0].message.reasoning = ""
    resp.choices[0].finish_reason = finish_reason
    return resp


def _make_classifier() -> tuple[APIClassifier, MagicMock]:
    with patch("finder_citations.llm_classifier.openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        clf = APIClassifier(api_key="test-key", invoke_url="http://mock", model="mock-model")
        return (clf, mock_client)


class TestClassifierStrategy:
    def test_verify_ids_raises(self):
        with pytest.raises(NotImplementedError):
            ClassifierStrategy().verify_ids([], [])

    def test_classify_ids_raises(self):
        with pytest.raises(NotImplementedError):
            ClassifierStrategy().classify_ids([], [])

    def test_classify_dois_raises(self):
        with pytest.raises(NotImplementedError):
            ClassifierStrategy().classify_dois([], [])

    def test_classify_primary_secondary_dois_raises(self):
        with pytest.raises(NotImplementedError):
            ClassifierStrategy().classify_primary_secondary_dois([], [], [])


class TestPromptBuilders:
    def test_make_id_verifying_prompt_contains_citation(self):
        prompt = APIClassifier._make_id_verifying_prompt("some text", "AB123456")
        assert "AB123456" in prompt

    def test_make_id_verifying_prompt_contains_genbank(self):
        prompt = APIClassifier._make_id_verifying_prompt("some text", "AB123456")
        assert "GenBank" in prompt

    def test_make_id_verifying_prompt_contains_pdb(self):
        prompt = APIClassifier._make_id_verifying_prompt("text", "1ABC")
        assert "PDB" in prompt

    def test_make_id_classification_prompt_contains_citation(self):
        prompt = APIClassifier._make_id_classification_prompt("data text", "GSE999")
        assert "GSE999" in prompt

    def test_make_id_classification_prompt_has_categories(self):
        prompt = APIClassifier._make_id_classification_prompt("data text", "GSE999")
        assert "Primary" in prompt
        assert "Secondary" in prompt

    def test_make_data_classification_prompt_has_categories(self):
        prompt = APIClassifier._make_data_classification_prompt("text", "10.1/doi")
        assert "Dataset" in prompt
        assert "Article" in prompt

    def test_make_doi_classification_prompt_contains_authors(self):
        prompt = APIClassifier._make_doi_classification_prompt("text", "10.1/doi", "Smith J")
        assert "Smith J" in prompt

    def test_make_doi_classification_prompt_has_categories(self):
        prompt = APIClassifier._make_doi_classification_prompt("text", "10.1/doi", "Smith J")
        assert "Primary" in prompt
        assert "Secondary" in prompt

    def test_prompts_clean_hyphenated_line_breaks(self):
        text_with_breaks = "hyphen- ated word"
        prompt = APIClassifier._make_id_classification_prompt(text_with_breaks, "ID1")
        assert "hyphen- ated" not in prompt


class TestCallApi:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_returns_content(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Primary]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf._call_api("test prompt")
        assert "Primary" in result

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_returns_empty_on_repeated_failure(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("network error")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        clf._interruptible_sleep = MagicMock()
        result = clf._call_api("test prompt")
        assert result == ""

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_strips_content(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("  Answer: [Yes]  ")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf._call_api("prompt")
        assert result == "Answer: [Yes]"


class TestVerifyIds:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_yes_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Answer: [Yes]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.verify_ids(["text"], ["AB123"])
        assert result == ["Yes"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_no_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Answer: [No]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.verify_ids(["text"], ["AB123"])
        assert result == ["No"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_ambiguous_defaults_to_yes(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("I think yes, this is valid.")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.verify_ids(["ctx"], ["ID1"])
        assert result == ["Yes"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_multiple_items(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_mock_response("Answer: [Yes]"),
            _make_mock_response("Answer: [No]"),
        ]
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.verify_ids(["t1", "t2"], ["ID1", "ID2"])
        assert result == ["Yes", "No"]


class TestClassifyIds:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_primary_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Primary]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_ids(["context"], ["GSE123"])
        assert result == ["Primary"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_secondary_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Secondary]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_ids(["context"], ["GSE123"])
        assert result == ["Secondary"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_defaults_to_secondary_when_no_primary(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Unclear answer")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_ids(["ctx"], ["ID"])
        assert result == ["Secondary"]


class TestClassifyDois:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_dataset_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Dataset]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_dois(["ctx"], ["https://doi.org/10.1/data"])
        assert result == ["Dataset"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_article_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Article]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_dois(["ctx"], ["https://doi.org/10.1/paper"])
        assert result == ["Article"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_defaults_to_article(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Not sure what this is.")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_dois(["ctx"], ["https://doi.org/10.1/x"])
        assert result == ["Article"]


class TestClassifyPrimarySecondaryDois:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_primary_doi(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Primary]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_primary_secondary_dois(["context"], ["https://doi.org/10.1/data"], ["Smith J"])
        assert result == ["Primary"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_secondary_doi(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_mock_response("Category: [Secondary]")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        result = clf.classify_primary_secondary_dois(["context"], ["https://doi.org/10.1/data"], ["Other Author"])
        assert result == ["Secondary"]


class TestGetClassifier:
    def test_returns_api_classifier(self):
        clf = get_classifier()
        assert isinstance(clf, APIClassifier)

    def test_uses_env_variables(self, monkeypatch):
        monkeypatch.setenv("LLM_API_KEY", "my-key")
        monkeypatch.setenv("LLM_BASE_URL", "https://api.test.com/v1")
        monkeypatch.setenv("LLM_MODEL_NAME", "my-model")
        clf = get_classifier()
        from finder_citations.llm_classifier import APIClassifier

        assert isinstance(clf, APIClassifier)
        assert clf.api_key == "my-key"
        assert clf.model == "my-model"


class TestAPIClassifierConstructor:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_strips_chat_completions_suffix(self, mock_openai_cls):
        mock_openai_cls.return_value = MagicMock()
        APIClassifier(api_key="k", invoke_url="https://api.example.com/openai/v1/chat/completions", model="m")
        call_kwargs = mock_openai_cls.call_args[1]
        assert not call_kwargs["base_url"].endswith("/chat/completions")

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_rate_limits_from_env(self, mock_openai_cls, monkeypatch):
        mock_openai_cls.return_value = MagicMock()
        monkeypatch.setenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
        monkeypatch.setenv("RATE_LIMIT_RPM", "60")
        monkeypatch.setenv("RATE_LIMIT_TPM", "100000")
        clf = APIClassifier(api_key="k")
        assert clf.rpm == 60
        assert clf.tpm == 100000


class TestClassifierInternals:
    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_interruptible_sleep_uses_display_delay_and_typeerror_fallback(self, mock_openai_cls, monkeypatch):
        mock_openai_cls.return_value = MagicMock()
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        current = [0.0]

        def fake_time():
            return current[0]

        def fake_sleep(seconds):
            current[0] += seconds

        monkeypatch.setattr(time, "time", fake_time)
        monkeypatch.setattr(time, "sleep", fake_sleep)
        calls = []

        def cancel_check():
            calls.append("called")

        clf._interruptible_sleep(0.2, cancel_check=cancel_check, display_delay=0.4)
        assert calls == ["called", "called"]

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_wait_for_rate_limit_disabled_when_both_limits_zero(self, mock_openai_cls, monkeypatch):
        mock_openai_cls.return_value = MagicMock()
        monkeypatch.setenv("RATE_LIMIT_RPM", "0")
        monkeypatch.setenv("RATE_LIMIT_TPM", "0")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        clf._wait_for_rate_limit(estimated_tokens=123)
        assert clf.request_timestamps == []
        assert clf.token_timestamps == []

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_wait_for_rate_limit_records_usage_when_within_limits(self, mock_openai_cls, monkeypatch):
        mock_openai_cls.return_value = MagicMock()
        monkeypatch.setenv("RATE_LIMIT_RPM", "10")
        monkeypatch.setenv("RATE_LIMIT_TPM", "1000")
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        clf._wait_for_rate_limit(estimated_tokens=25)
        assert len(clf.request_timestamps) == 1
        assert len(clf.token_timestamps) == 1

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_call_api_handles_rate_limit_then_succeeds(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            Exception("429 try again in 0h0m1s limit 10, used 9, requested 5 per minute"),
            _make_mock_response("Category: [Primary]"),
        ]
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        clf._interruptible_sleep = MagicMock()
        result = clf._call_api("prompt", remaining_items=2)
        assert result == "Category: [Primary]"
        assert mock_client.chat.completions.create.call_count == 2

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_call_api_returns_empty_on_invalid_response(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(choices=[])
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")
        clf._interruptible_sleep = MagicMock()
        result = clf._call_api("prompt")
        assert result == ""

    @patch("finder_citations.llm_classifier.openai.OpenAI")
    def test_public_methods_fall_back_when_cancel_check_has_simple_signature(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [
            _make_mock_response("Answer: [Yes]"),
            _make_mock_response("Category: [Primary]"),
            _make_mock_response("Category: [Dataset]"),
            _make_mock_response("Category: [Primary]"),
        ]
        clf = APIClassifier(api_key="k", invoke_url="http://x", model="m")

        def cancel_check():
            return None

        assert clf.verify_ids(["ctx"], ["AB123"], cancel_check=cancel_check) == ["Yes"]
        assert clf.classify_ids(["ctx"], ["GSE123"], cancel_check=cancel_check) == ["Primary"]
        assert clf.classify_dois(["ctx"], ["https://doi.org/10.1/data"], cancel_check=cancel_check) == ["Dataset"]
        assert clf.classify_primary_secondary_dois(
            ["ctx"], ["https://doi.org/10.1/data"], ["Smith J"], cancel_check=cancel_check
        ) == ["Primary"]
