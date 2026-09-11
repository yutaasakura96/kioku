"""ADR 0018's boundary — `worker/provider.py` (`03` §7, §11, §13.1).

⚠️ **No test here reaches the network**, and the two that exercise
:class:`AnthropicProvider` hand it a stand-in for the SDK's stream rather than a
key. `11` §7: *generation tests use recorded fixtures and never call a provider.*

Needs neither Docker nor a database.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

import provider as provider_module
from db import MisconfiguredWorker
from pipeline.generate import GenerationRequest


# ---------------------------------------------------------------------------
# Startup — `03` §13.1
# ---------------------------------------------------------------------------


def test_a_worker_with_no_key_refuses_at_startup() -> None:
    """⚠️ **A refusal, not a worker that drains the queue and produces nothing.**

    Until #9 a run with no generator was the true state of the project
    (ADR 0010's ordering made literal). Now it would settle every run `complete`
    having made no *notes*, which `03` §11 reads to the reader as a **success** —
    PRD §5's zero-new-notes case, arriving as a lie.
    """
    with pytest.raises(MisconfiguredWorker, match=provider_module.API_KEY_ENV):
        provider_module.require_provider({})


def test_a_blank_key_is_no_key() -> None:
    with pytest.raises(MisconfiguredWorker):
        provider_module.require_provider({provider_module.API_KEY_ENV: "   "})


def test_the_model_id_is_an_environment_variable_and_the_walk_is_the_point() -> None:
    """ADR 0018 walks the model from `claude-opus-5` downward toward
    `gpt-5.6-luna`. **Which model wins is a measurement, not a document**, so
    moving between them cannot be a code change.
    """
    default = provider_module.require_provider({provider_module.API_KEY_ENV: "k"})
    named = provider_module.require_provider(
        {provider_module.API_KEY_ENV: "k", provider_module.MODEL_ID_ENV: "claude-opus-5"}
    )

    assert default.model_id == provider_module.DEFAULT_MODEL_ID == "claude-sonnet-5"
    assert named.model_id == "claude-opus-5"


# ---------------------------------------------------------------------------
# What comes back — `03` §7
# ---------------------------------------------------------------------------


@dataclass
class _Block:
    text: str
    type: str = "text"


@dataclass
class _Usage:
    input_tokens: int
    output_tokens: int


@dataclass
class _Message:
    content: list[_Block]
    usage: _Usage
    stop_reason: str = "end_turn"


class _Stream:
    def __init__(self, message: _Message, recorded: dict[str, Any]) -> None:
        self._message = message
        self._recorded = recorded

    def __call__(self, **kwargs: Any) -> "_Stream":
        self._recorded.update(kwargs)
        return self

    def __enter__(self) -> "_Stream":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def get_final_message(self) -> _Message:
        return self._message


def build(message: _Message) -> tuple[provider_module.AnthropicProvider, dict[str, Any]]:
    """A real provider with the SDK's stream replaced, and what it was asked."""
    instance = provider_module.AnthropicProvider(api_key="not-a-key")
    recorded: dict[str, Any] = {}
    instance._client.messages.stream = _Stream(message, recorded)  # type: ignore[assignment]
    return instance, recorded


REQUEST = GenerationRequest(prompt="…", schema={"type": "object"}, max_tokens=99)


def test_the_answer_and_its_token_counts_come_back() -> None:
    """⚠️ **Token counts come from the response, never estimated** (`03` §7,
    `04` §6.1). The 0.85 tokens-per-Japanese-character planning ratio carries
    ±30% uncertainty and was measured on OpenAI's `o200k_base`; neither Anthropic
    nor Google publishes a tokeniser (verification §3.4).
    """
    instance, _ = build(
        _Message(content=[_Block('{"notes": []}')], usage=_Usage(1840, 620))
    )

    generation = instance.generate(REQUEST)

    assert generation.payload == {"notes": []}
    assert (generation.input_tokens, generation.output_tokens) == (1840, 620)
    assert generation.model_id == "claude-sonnet-5"


def test_it_streams_and_the_declaration_is_the_output_contract() -> None:
    """⚠️ **Streaming, never batch** (`03` §7, ADR 0018). All three providers
    make the batch API mutually exclusive with streaming, and `S2` requires
    *notes* to appear as they are produced; `04` §6.3's response column is the
    structured output *as returned*, which means there has to be a schema.
    """
    instance, asked = build(
        _Message(content=[_Block('{"notes": []}')], usage=_Usage(1, 1))
    )

    instance.generate(REQUEST)

    assert asked["output_config"] == {
        "format": {"type": "json_schema", "schema": REQUEST.schema}
    }
    assert asked["max_tokens"] == 99
    # ⚠️ Absent on purpose: ADR 0018 walks two vendors and seven ids, and every
    # one accepts `thinking` being unset while several reject one setting of it.
    assert "thinking" not in asked


def test_a_refusal_is_not_parsed_as_an_answer() -> None:
    """A declined request is a 200 with content in it. `json.loads` on that
    raises something that reads like a bug in this file, which is the wrong
    thing for `10` §6.2 to put on the run row.
    """
    instance, _ = build(
        _Message(content=[_Block("I can't help with that")], usage=_Usage(1, 1), stop_reason="refusal")
    )

    with pytest.raises(provider_module.ProviderRefused, match="declined"):
        instance.generate(REQUEST)


def test_a_truncated_answer_says_it_was_truncated() -> None:
    """⚠️ `max_tokens` also returns a 200, with **half an object** in it."""
    instance, _ = build(
        _Message(content=[_Block('{"notes": [{"term": "図')], usage=_Usage(1, 99), stop_reason="max_tokens")
    )

    with pytest.raises(provider_module.ProviderRefused, match="cut off"):
        instance.generate(REQUEST)


def test_an_answer_that_is_not_json_never_carries_itself_into_the_error() -> None:
    """⚠️ `03` §13.4 and §11: this message reaches `ingestion_chunk.last_error`,
    which `10` §6.2 renders. It may not carry *source* text, a note field, or
    the provider's name.
    """
    instance, _ = build(_Message(content=[_Block("図書館 is a library")], usage=_Usage(1, 1)))

    with pytest.raises(provider_module.ProviderRefused) as raised:
        instance.generate(REQUEST)

    assert "図書館" not in str(raised.value)
    assert "anthropic" not in str(raised.value).lower()


class _Raising:
    """A stream that fails the way the SDK fails."""

    def __init__(self, error: BaseException) -> None:
        self._error = error

    def __call__(self, **_: Any) -> "_Raising":
        return self

    def __enter__(self) -> "_Raising":
        raise self._error

    def __exit__(self, *_: object) -> None:  # pragma: no cover - never entered
        return None


def raising(error: BaseException) -> provider_module.AnthropicProvider:
    instance = provider_module.AnthropicProvider(api_key="not-a-key")
    instance._client.messages.stream = _Raising(error)  # type: ignore[assignment]
    return instance


def test_a_rate_limit_reaches_the_run_row_without_naming_the_provider() -> None:
    """⚠️ `03` §11: *the provider is not named at the reader.*

    `runs.py` writes `str(error)` straight into `ingestion_chunk.last_error` and
    `10` §6.2 renders it, so an SDK exception allowed through would put the
    vendor's name, its URL and a request id on a screen. **A comment in
    `runs.py` cannot keep that promise; the boundary has to.**
    """
    import anthropic
    # ⚠️ `httpx2`, not `httpx` — the SDK moved to it, and a test that imported the
    # older name would fail with `ModuleNotFoundError` rather than telling anyone
    # anything. Measured against `anthropic` 1.5.0.
    import httpx2

    response = httpx2.Response(
        429, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    )
    error = anthropic.RateLimitError("rate limit exceeded", response=response, body=None)

    with pytest.raises(provider_module.ProviderUnavailable) as landed:
        raising(error).generate(REQUEST)

    message = str(landed.value)
    assert "429" in message
    assert "provider" in message
    assert "anthropic" not in message.lower()
    assert "api.anthropic.com" not in message
    # The SDK's own message is the cause, where `03` §13.4 is happy for it to be.
    assert isinstance(landed.value.__cause__, anthropic.RateLimitError)


def test_an_unreachable_provider_says_so_and_says_how_many_tries() -> None:
    """`03` §14: the model provider being down stalls *ingestion* and nothing
    already generated is discarded. The reader is owed the fact, not the host.
    """
    import anthropic
    import httpx2

    error = anthropic.APIConnectionError(
        request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    )

    with pytest.raises(provider_module.ProviderUnavailable) as landed:
        raising(error).generate(REQUEST)

    message = str(landed.value)
    assert "could not be reached" in message
    assert str(provider_module.MAX_RETRIES + 1) in message
    assert "anthropic" not in message.lower()


def test_the_retries_are_bounded() -> None:
    """`03` §11: *bounded retries with backoff, then the chunk is marked failed
    and the job stays resumable.* The bound is the client's, and an unbounded
    one would be a claimed job that never gives the heartbeat back (`04` §6.4).
    """
    instance = provider_module.AnthropicProvider(api_key="not-a-key")

    assert instance._client.max_retries == provider_module.MAX_RETRIES
    assert instance._client.timeout == provider_module.TIMEOUT_SECONDS
