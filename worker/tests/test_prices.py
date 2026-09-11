"""What a generation cost — `worker/prices.py` (`03` §7, ADR 0018).

One of `11` §8's pure modules: everything that decides a number, with no
database, no clock and no network, so the arithmetic `S10` reports can be
asserted exactly rather than observed.
"""

from __future__ import annotations

from datetime import date

import pytest

import prices


def test_the_price_table_carries_an_effective_date() -> None:
    """`03` §7: **configuration with an effective date, not a constant.**

    `04` §6.1 stamps `price_table_effective_date` beside the cost so that a
    figure read a year from now can be checked against the table it was computed
    with. A table with no date would make the column unfillable.
    """
    for table in prices.PRICE_TABLES:
        assert isinstance(table.effective_date, date)


def test_the_newest_effective_table_wins() -> None:
    """A price change is a **new entry**, never an edit to an existing one.

    Editing one rewrites history: every `ingestion` already stamped with that
    date would now cite a table saying something else.
    """
    older = prices.PriceTable(
        effective_date=date(2020, 1, 1),
        prices={"m": prices.ModelPrice(1_000_000, 1_000_000)},
    )
    newer = prices.PriceTable(
        effective_date=date(2030, 1, 1),
        prices={"m": prices.ModelPrice(2_000_000, 2_000_000)},
    )
    original = prices.PRICE_TABLES
    prices.PRICE_TABLES = (newer, older)
    try:
        assert prices.current_prices().effective_date == date(2030, 1, 1)
        # ⚠️ And a table dated forward does not take effect the moment it is
        # committed — the run's own date decides.
        assert prices.current_prices(on=date(2025, 1, 1)).effective_date == date(2020, 1, 1)
    finally:
        prices.PRICE_TABLES = original


def test_the_cost_is_adr_0018s_own_numbers() -> None:
    """The ledger and the ADR that argues the model walk quote the same figures.

    `claude-sonnet-5` is $2 / $10 per MTok, so one million in and one million out
    is $12.00 — 12,000,000 micro-USD.
    """
    assert (
        prices.cost_micro_usd(
            "claude-sonnet-5", input_tokens=1_000_000, output_tokens=1_000_000
        )
        == 12_000_000
    )


def test_a_model_the_table_does_not_carry_is_refused() -> None:
    """⚠️ **Raised rather than defaulted to zero.**

    ADR 0018 walks the model, so an id the table has never heard of is the
    expected shape of a mistake — and a run that silently recorded
    `cost_micro_usd = 0` would put a free *ingestion* in the ledger `S10`
    reports from, which is worse than no number at all.
    """
    with pytest.raises(prices.UnpricedModel):
        prices.cost_micro_usd("claude-nonesuch-9", input_tokens=10, output_tokens=10)


def test_every_model_adr_0018_names_is_priced() -> None:
    """ADR 0018's walk goes `claude-opus-5` → `claude-sonnet-5` →
    `gpt-5.6-luna`, and a walk that stops at an `UnpricedModel` is a walk that
    stops at a code change.
    """
    table = prices.current_prices()
    for model_id in ("claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "gpt-5.6-luna"):
        assert model_id in table.prices
