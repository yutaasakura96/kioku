"""One JSON line per event, on stdout — the worker's half of `03` §11.

⚠️ **A module of its own since #20**, because `worker/ingest.py` has something
to say now (ADR 0064 §2: a run nobody owns mints nothing *and says so*) and
importing `__main__` from a module it runs would be a cycle.
"""

from __future__ import annotations

import json
import time
from typing import Any


def log(event: str, **fields: Any) -> None:
    print(json.dumps({"t": time.time(), "event": event, **fields}), flush=True)
