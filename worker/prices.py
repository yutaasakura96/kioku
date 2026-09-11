"""What a generation cost — `03` §7, `04` §6.1, ADR 0018.

⚠️ **The price table is configuration with an effective date, not a constant.**
`S10` reports cost per *ingestion*; published prices change, and a hard-coded
table starts lying silently on the day they do. `04` §6.1 puts
`price_table_effective_date` on the row beside the number precisely so that a
figure read a year from now can be checked against the table it was computed
with.

⚠️ **So a price change is a new entry in :data:`PRICE_TABLES`, never an edit to
an existing one.** Editing one rewrites history: every `ingestion` row already
stamped with that effective date would now cite a table that says something
else. :func:`current_prices` picks the newest entry effective on or before the
run, which is what makes the append the whole of the change.

⚠️ **Nothing here estimates anything.** Token counts come from the provider's
response (`03` §7) and this module only multiplies. The 0.85 tokens-per-Japanese
-character planning ratio carries ±30% uncertainty and was measured on OpenAI's
`o200k_base`; neither Anthropic nor Google publishes a tokeniser (verification
§3.4), so an estimate here would be a number nobody could defend.

This is one of the pure modules `11` §8 asks for — everything that decides a
number, in a module with no database, no clock and no network.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Mapping

#: Micro-USD in one USD. `04` §1 stores money as `bigint` micro-USD and never as
#: a float, so every arithmetic here is integer arithmetic.
MICRO_USD = 1_000_000

#: Tokens in the unit published prices are quoted in.
TOKENS_PER_MTOK = 1_000_000


@dataclass(frozen=True)
class ModelPrice:
    """Micro-USD per million tokens, in and out.

    Quoted in the unit the providers publish — dollars per MTok — multiplied by
    :data:`MICRO_USD` so that **nothing stored or accumulated is a float**.
    `$2 / MTok` is `2_000_000`. ⚠️ The *literals* below are floats, because a
    published price is written `$1.20` and transcribing it as `1_200_000` is how
    a transcription error hides; :func:`_usd_per_mtok` rounds once, at the edge,
    and everything past it is integer arithmetic — which is what `04` §1 asks
    for when it says `bigint` micro-USD and never `money` and never a float.
    """

    input_micro_usd_per_mtok: int
    output_micro_usd_per_mtok: int


@dataclass(frozen=True)
class PriceTable:
    """One dated set of prices. Append a new one; never edit an old one."""

    effective_date: date
    prices: Mapping[str, ModelPrice]


def _usd_per_mtok(dollars: float) -> int:
    return round(dollars * MICRO_USD)


#: ⚠️ **ADR 0018's own table, and it is where these seven models' prices come
#: from.**
#: The ADR argues the model walk on them, so the ledger and the argument have to
#: be quoting the same figures or the walk is being judged against prices it was
#: not planned with.
#:
#: ⚠️ **Four of the seven are not reachable today**, and they are here anyway.
#: `worker/provider.py` speaks to one vendor, so a `KIOKU_MODEL_ID` naming a
#: `gpt-…` id fails at the boundary rather than here. They stay because this is
#: ADR 0018's table rather than a capability list: the ADR's destination is
#: `gpt-5.6-luna`, and the day a second provider exists these numbers must not
#: have to be re-derived from an ADR by someone reading a price file.
#:
#: The effective date is the date the figures were read rather than a date any
#: provider publishes — none of the three publishes an "effective from" for a
#: price — so it answers the only question the column is asked: *which table was
#: this row computed with?*
_2026_09_12 = PriceTable(
    effective_date=date(2026, 9, 12),
    prices={
        "gpt-5.6-luna": ModelPrice(_usd_per_mtok(0.20), _usd_per_mtok(1.20)),
        "claude-haiku-4-5": ModelPrice(_usd_per_mtok(1.00), _usd_per_mtok(5.00)),
        "claude-sonnet-5": ModelPrice(_usd_per_mtok(2.00), _usd_per_mtok(10.00)),
        "gpt-5.6-terra": ModelPrice(_usd_per_mtok(2.00), _usd_per_mtok(12.00)),
        "gpt-5.6-sol": ModelPrice(_usd_per_mtok(4.00), _usd_per_mtok(20.00)),
        "claude-opus-5": ModelPrice(_usd_per_mtok(5.00), _usd_per_mtok(25.00)),
        "gpt-6-astra": ModelPrice(_usd_per_mtok(10.00), _usd_per_mtok(50.00)),
    },
)

#: Oldest first. :func:`current_prices` reads the newest that is effective.
PRICE_TABLES: tuple[PriceTable, ...] = (_2026_09_12,)


class UnpricedModel(LookupError):
    """A model the table does not carry.

    ⚠️ **Raised rather than defaulted to zero.** ADR 0018 walks the model, so a
    model id the table has never heard of is the expected shape of a mistake —
    and a run that silently recorded `cost_micro_usd = 0` would put a free
    *ingestion* in the ledger `S10` reports from.
    """


def current_prices(on: date | None = None) -> PriceTable:
    """The newest table effective on or before ``on`` (default: the newest).

    ``on`` exists so a test can ask for the state of the world at a date, and so
    that a future table dated forward does not take effect the moment it is
    committed.
    """
    tables = sorted(PRICE_TABLES, key=lambda table: table.effective_date)
    if on is not None:
        tables = [table for table in tables if table.effective_date <= on]
    if not tables:
        raise LookupError(f"no price table is effective on {on}")
    return tables[-1]


def cost_micro_usd(
    model_id: str, *, input_tokens: int, output_tokens: int, table: PriceTable | None = None
) -> int:
    """What those tokens cost, in micro-USD, under ``table``.

    ⚠️ **Floor division, and the residue is smaller than the unit.** A chunk's
    cost is a fraction of one micro-dollar away from exact, and `04` §6.1
    accumulates per chunk — eighty-four chunks is at most eighty-four
    millionths of a dollar of truncation in a figure whose purpose is to tell
    `S10` whether an *ingestion* cost one dollar or five. Rounding half-up would
    be no more true and would need its own explanation.
    """
    resolved = current_prices() if table is None else table
    try:
        price = resolved.prices[model_id]
    except KeyError as error:
        raise UnpricedModel(
            f"{model_id!r} is not in the price table effective "
            f"{resolved.effective_date.isoformat()}. ADR 0018 walks the model, so "
            "a new model id is an entry in `PRICE_TABLES` rather than a number "
            "invented at the call site."
        ) from error
    return (
        input_tokens * price.input_micro_usd_per_mtok
        + output_tokens * price.output_micro_usd_per_mtok
    ) // TOKENS_PER_MTOK
