"""Read-only OFFICE-12b vacancy growth for Marina's production qa profile.

Writes belong only to bridge state in the office DB; no JH files are changed.
"""
from __future__ import annotations
import json
import math
from pathlib import Path


def read_bugs(path: Path):
    try:
        value = json.loads(path.read_text()).get('bugs')
        if type(value) in (str, int, float) and (not isinstance(value, float) or math.isfinite(value)):
            return value
    except (OSError, ValueError, AttributeError):
        pass
    return 'вагон 🚃'


def observe(root: Path, previous: dict | None, config: Path, *, baseline=False):
    """Count growth of qa's observed vacancies, never the search's found/new total.

    Only numeric state is persisted in the office DB. First reads, startup,
    shrinkage and jumps above fifty quietly establish a new baseline.
    Missing/partially written files leave the confirmed baseline intact.
    """
    state = dict(previous) if previous and previous.get('version') == 2 else {
        'version': 2, 'total': 0, 'latestCount': 0, 'count': None}
    try:
        data = json.loads((root / 'profiles/qa/seen_vacancies.json').read_text())
        if not isinstance(data, dict):
            raise ValueError('invalid vacancy state')
        count = len(data)
    except (OSError, ValueError):
        count = None
    if count is None and baseline:
        state['count'] = None
    if count is not None:
        old = state['count']
        delta = count - old if type(old) is int else 0
        if not baseline and 0 < delta <= 50:
            state['total'] += delta
            state['latestCount'] = delta
        state['count'] = count
    public = {key: state[key] for key in ('total', 'latestCount')}
    public['bugs'] = read_bugs(config)
    return state, public
