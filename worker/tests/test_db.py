"""Which connection string the worker takes, and which one it refuses.

⚠️ Needs no Docker and no database — these are two string checks and a refusal.
They are here because the failure they prevent is the worst-shaped one in the
tier: a worker on the pooled endpoint **starts, connects, claims nothing and
never wakes** (`03` §4.1). Nothing in the run list distinguishes that from a
worker nobody started.
"""

from __future__ import annotations

import pytest

from db import DIRECT_URL_ENV, MisconfiguredWorker, refuse_pooled, require_direct_url

DIRECT = "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/kioku?sslmode=require"
POOLED = "postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/kioku?sslmode=require"


def test_the_direct_string_is_taken_verbatim():
    """ADR 0027: no `options=endpoint%3D…` rewriting, no hand-edited TLS
    parameters. Whatever Neon issued is what psycopg is handed."""
    assert require_direct_url({DIRECT_URL_ENV: DIRECT}) == DIRECT


def test_the_pooled_string_is_refused_by_name():
    with pytest.raises(MisconfiguredWorker, match="pooled endpoint"):
        refuse_pooled(POOLED)


def test_a_missing_string_names_the_variable_and_which_endpoint():
    with pytest.raises(MisconfiguredWorker, match=DIRECT_URL_ENV):
        require_direct_url({})


def test_pooler_in_a_password_or_a_query_string_is_not_the_hostname():
    """⚠️ The guard reads the part before `?`, so a database named for the
    project's pooler notes, or a generated password containing the substring,
    does not lock the worker out of its own database."""
    assert refuse_pooled(DIRECT + "&application_name=no-pooler-here") == (
        DIRECT + "&application_name=no-pooler-here"
    )
