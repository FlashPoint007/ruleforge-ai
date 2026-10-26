"""Registry contract test: the server's DSL mirror must equal the client's.

The client (packages/rule-schema) is the single source of truth. The server keeps
its own copy so it can validate without a TypeScript toolchain; this test reads
the TypeScript file and compares, so a drift fails here instead of producing packs
the client silently rejects.
"""

import re
from pathlib import Path

import pytest

from app.domain import registry

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_TS = REPO_ROOT / "packages" / "rule-schema" / "src" / "index.ts"


def read_ts_const(name: str) -> list[str]:
    """Extracts a string array literal from the TypeScript schema."""
    source = SCHEMA_TS.read_text(encoding="utf-8")
    pattern = re.compile(
        r"export const " + name + r"\s*=\s*\[(?P<body>.*?)\]\s*as const;",
        re.DOTALL,
    )
    match = pattern.search(source)
    assert match is not None, f"{name} not found in {SCHEMA_TS}"
    return re.findall(r'"([^"]+)"', match.group("body"))


def test_schema_file_exists():
    assert SCHEMA_TS.is_file(), f"missing schema at {SCHEMA_TS}"


def test_events_match_the_client_registry():
    assert list(registry.P0_EVENTS) == read_ts_const("P0_EVENTS")


def test_actions_match_the_client_registry():
    assert list(registry.P0_ACTIONS) == read_ts_const("P0_ACTIONS")


def test_condition_operators_match_the_client_registry():
    assert list(registry.P0_CONDITION_OPERATORS) == read_ts_const("P0_CONDITION_OPERATORS")


def test_fact_paths_match_the_client_registry():
    assert list(registry.P0_FACT_PATHS) == read_ts_const("P0_FACT_PATHS")


def test_dsl_version_matches_the_client():
    source = SCHEMA_TS.read_text(encoding="utf-8")
    match = re.search(r'export const DSL_VERSION\s*=\s*"([^"]+)"', source)
    assert match is not None
    assert match.group(1) == registry.DSL_VERSION


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("maxRulesPerPack", registry.MAX_RULES_PER_PACK),
        ("maxConditionsPerRule", registry.MAX_CONDITIONS_PER_RULE),
        ("maxActionsPerRule", registry.MAX_ACTIONS_PER_RULE),
        ("maxConditionDepth", registry.MAX_CONDITION_DEPTH),
        ("maxEffectDurationMs", registry.MAX_EFFECT_DURATION_MS),
    ],
)
def test_limits_match_the_client(name, expected):
    source = SCHEMA_TS.read_text(encoding="utf-8")
    match = re.search(name + r":\s*([0-9_]+)", source)
    assert match is not None, f"{name} not found in RULE_LIMITS"
    assert int(match.group(1).replace("_", "")) == expected