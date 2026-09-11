"""ADR 0018's boundary — the only module in this repository that calls a model.

**Generation sits behind a provider boundary with a declared output schema**
(ADR 0018, `03` §7). The working default is `claude-sonnet-5`, with
`claude-opus-5` run once as a ceiling probe and the walk going *downward* toward
`gpt-5.6-luna` until measured *acceptance rate* degrades — **which model wins is
a measurement, not a document**, which is why the model id is an environment
variable here and a column on three tables rather than a constant anywhere.

⚠️ **Streaming, never batch** (`03` §7). All three providers make the batch API
mutually exclusive with streaming, and `S2` requires *notes* to appear as they
are produced; halving an already trivial cost is not worth failing a tracked
metric. `messages.stream` is also what keeps a long answer off the SDK's
ten-minute non-streaming ceiling.

⚠️ **Bounded retries with backoff, then the chunk fails and the run stays
resumable** (`03` §11, §14). The bound is the SDK's own `max_retries`, which
retries 408/409/429/5xx and connection errors with backoff; past it the failure
reaches `runs.py`, which marks the *chunk* `failed` and settles the run
`incomplete`.

⚠️ **And it reaches `runs.py` as one of this module's own exceptions, never as the
SDK's.** `03` §11 says **the provider is not named at the reader**, and
`runs.py` writes `str(error)` straight into `ingestion_chunk.last_error`, which
`10` §6.2 renders on the run row — so an SDK exception allowed through would put
the vendor's name, its URL and possibly a request id on a screen. Every
`anthropic.APIError` is translated here into :class:`ProviderUnavailable` with a
message written for that column. **That is the boundary earning its name**: a
`runs.py` comment promising it could not keep the promise on its own.

⚠️ **The key lives only on the laptop** (`03` §13.1). The app tier never holds
it: the process with an internet-facing surface has no ability to spend money,
and the process that can spend money has no internet-facing surface.
`test/unit/no-provider-key-in-the-app.test.ts` is that sentence as a test.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol

from db import MisconfiguredWorker
from pipeline.generate import GenerationRequest

#: `03` §13.1's row, and the SDK's own variable so nothing has to re-plumb it.
API_KEY_ENV = "ANTHROPIC_API_KEY"

#: ⚠️ **The walk is the point** (ADR 0018). Changing the model is an environment
#: variable and a `prices.py` entry, not a code change, because the comparison
#: between two models is meant to be a query over `note_field_provenance`
#: (`04` §12's eighth query) rather than a separate experiment.
MODEL_ID_ENV = "KIOKU_MODEL_ID"

#: ADR 0018's working default. Not the cheapest, and deliberately: if the first
#: *ingestion* runs on the cheapest model and *acceptance rate* comes back at
#: 60%, that number cannot tell the thesis being wrong from the model being too
#: small — and producing that number is the whole of v1 (ADR 0001).
DEFAULT_MODEL_ID = "claude-sonnet-5"

#: `03` §11's *bounded retries with backoff*. Two is the SDK's own default,
#: named here so the bound is visible at the boundary that has it.
MAX_RETRIES = 2

#: One chunk of 1200 characters (ADR 0041) against a provider that is not
#: answering is a claimed job going nowhere; the loop's stale sweep (`04` §6.4)
#: runs on a five-minute heartbeat, so the request has to give up inside it.
TIMEOUT_SECONDS = 120.0


@dataclass(frozen=True)
class Generation:
    """What one provider call returned, and what it cost.

    ⚠️ **Token counts come from the response, never estimated** (`03` §7,
    `04` §6.1). The 0.85 tokens-per-Japanese-character planning ratio carries
    ±30% uncertainty and was measured on OpenAI's `o200k_base`; neither Anthropic
    nor Google publishes a tokeniser (verification §3.4).
    """

    payload: dict[str, Any]
    model_id: str
    input_tokens: int
    output_tokens: int


class ProviderUnavailable(RuntimeError):
    """The call did not return — a rate limit, a 5xx, a timeout, a dropped socket.

    ⚠️ **Its message is written for `ingestion_chunk.last_error`**, which `10`
    §6.2 puts in front of the reader: a status code, and the word *provider*
    rather than a vendor (`03` §11). The SDK's own message is the cause and stays
    in the traceback, where `03` §13.4 is happy for it to be.
    """


class ProviderRefused(RuntimeError):
    """The call returned, and what it returned is not an answer.

    Separate from the SDK's own exceptions on purpose: those are transport and
    are retried by the client, this is the model declining or being cut off, and
    retrying it inside the request would only spend the money twice.

    ⚠️ **It carries what the failed call cost**, because the call *did* return:
    the input was read and, for a truncation, the output was produced and billed.
    `04` §6.1's ledger is what `S10` reports from and it has to be true rather
    than flattering — `ingest.make_generator` records `spent` before re-raising.
    A refusal that dropped its token counts would make a *source* that failed
    half its chunks look cheaper than one that succeeded.
    """

    def __init__(self, message: str, *, spent: "Generation | None" = None) -> None:
        super().__init__(message)
        #: ``None`` only where no response existed to count.
        self.spent = spent


class Provider(Protocol):
    """ADR 0018's boundary, as two members.

    ⚠️ **This is what `11` §7 means by *generation tests use recorded fixtures
    and never call a provider*.** Every test in this repository passes a stand-in
    that satisfies these two, so no test has ever needed a key and none can spend
    a cent.
    """

    model_id: str

    def generate(self, request: GenerationRequest) -> Generation: ...


class AnthropicProvider:
    """The Anthropic Messages API, with the declaration as its output schema.

    ⚠️ **`thinking` is not set, and the omission is deliberate.** ADR 0018 walks
    the model across two vendors and seven ids, and every one of them accepts the
    parameter being absent while several reject one setting or another of it — a
    model-specific thinking configuration here would be a walk that stops at the
    first 400. What the ledger records is measured from the response either way
    (`04` §6.1), so nothing about `S10`'s figures depends on the choice.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model_id: str = DEFAULT_MODEL_ID,
        max_retries: int = MAX_RETRIES,
        timeout: float = TIMEOUT_SECONDS,
    ) -> None:
        # Imported here rather than at module scope so that the pure tiers — and
        # `worker/tests/`, which has no key — import this module without pulling
        # an HTTP client in behind them.
        import anthropic

        self.model_id = model_id
        #: What the failure message may honestly claim: the first try plus the
        #: retries the client is allowed.
        self._attempts = max_retries + 1
        self._client = anthropic.Anthropic(
            api_key=api_key, max_retries=max_retries, timeout=timeout
        )

    def generate(self, request: GenerationRequest) -> Generation:
        import anthropic

        try:
            with self._client.messages.stream(
                model=self.model_id,
                max_tokens=request.max_tokens,
                output_config={"format": {"type": "json_schema", "schema": request.schema}},
                messages=[{"role": "user", "content": request.prompt}],
            ) as stream:
                message = stream.get_final_message()
        except anthropic.APIStatusError as error:
            # ⚠️ The status, and not `str(error)`. `APIError.__str__` carries the
            # vendor's message, its URL and a request id, and this string is
            # bound for a screen (`03` §11, §13.4).
            raise ProviderUnavailable(
                f"the model provider answered {error.status_code} after "
                f"{self._attempts} attempts"
            ) from error
        except anthropic.APIError as error:
            # Connection refused, TLS, a timeout — `APIConnectionError` and its
            # kin, which are siblings of the status errors rather than parents.
            raise ProviderUnavailable(
                f"the model provider could not be reached after {self._attempts} attempts"
            ) from error

        # ⚠️ Both branches before the parse. A refusal and a truncation each
        # return a 200 with content in it, and `json.loads` on half an object
        # raises something that reads like a bug in this file.
        if message.stop_reason == "refusal":
            raise ProviderRefused("the model declined this chunk")
        if message.stop_reason == "max_tokens":
            raise ProviderRefused(
                f"the answer was cut off at {request.max_tokens} output tokens"
            )

        text = "".join(block.text for block in message.content if block.type == "text")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as error:
            # ⚠️ `03` §13.4: the message never carries what was returned, because
            # it is written from the *source* and this string reaches
            # `ingestion_chunk.last_error`, which `10` §6.2 puts on screen.
            raise ProviderRefused(f"the answer is not JSON: {error.msg}") from error

        return Generation(
            payload=payload,
            model_id=self.model_id,
            input_tokens=message.usage.input_tokens,
            output_tokens=message.usage.output_tokens,
        )


def _why(stop_reason: str | None, request: GenerationRequest) -> str:
    """What to put on the run row — `10` §6.2 renders it, so it is a sentence.

    ⚠️ The default arm names the raw `stop_reason`, which is an API constant and
    not a vendor: enough to act on, and nothing `03` §11 forbids.
    """
    if stop_reason == "refusal":
        return "the model declined this chunk"
    if stop_reason == "max_tokens":
        return f"the answer was cut off at {request.max_tokens} output tokens"
    return f"the answer stopped at {stop_reason!r} rather than finishing"


def require_provider(environ: dict[str, str] | None = None) -> AnthropicProvider:
    """The provider, or a refusal at startup that names the variable.

    ⚠️ **A refusal rather than a worker that runs without one.** Until #9 a run
    with no generator was the true state of the project (ADR 0010's ordering made
    literal); now it would be a run that reads its whole *source*, spends
    nothing, settles `complete` and tells the reader that a *source* which
    produced no *notes* was a success — which is PRD §5's zero-new-notes case
    wearing the wrong hat. `db.require_direct_url` is the shape this follows.
    """
    import os

    resolved = os.environ if environ is None else environ
    api_key = resolved.get(API_KEY_ENV, "").strip()
    if not api_key:
        raise MisconfiguredWorker(
            f"{API_KEY_ENV} is not set. Generation happens only in the worker "
            "(`03` §13.1), so without it a run would read its whole source and "
            "produce nothing. `.env.example` names it; the value never enters "
            "the repository."
        )
    model_id = resolved.get(MODEL_ID_ENV, "").strip() or DEFAULT_MODEL_ID
    return AnthropicProvider(api_key=api_key, model_id=model_id)
