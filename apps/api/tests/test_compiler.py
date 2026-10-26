"""Compiler and validation tests.

Each layer gets a case that must be refused, so a regression in one layer cannot
hide behind another layer catching the same input.
"""

import json

import pytest

from app.compiler import RuleCompiler, parse_ir
from app.domain.models import LevelCapabilities

LEVEL = LevelCapabilities(
    levelId="lab-01",
    levelVersion="1.8.0",
    hasEnemies=True,
    hasCoins=True,
    collapsiblePlatforms=2,
    hideablePlatforms=["bridge-1"],
    checkpoints=["mid-1"],
    enemySpawnPoints=2,
    coinSpawnPoints=3,
)

BARE_LEVEL = LevelCapabilities(levelId="lab-empty", levelVersion="1.0.0")


def compile_doc(document: dict, level: LevelCapabilities = LEVEL):
    return RuleCompiler().compile(parse_ir(document), level=level)


GRAVITY_ACTION = {
    "op": "player.gravity.toggle",
    "target": "player",
    "params": {"magnitude": 980},
}


def gravity_action() -> dict:
    """A fresh copy, so a test mutating it cannot affect the next one."""
    return json.loads(json.dumps(GRAVITY_ACTION))


def gravity_doc(**overrides) -> dict:
    document = {
        "status": "ok",
        "rules": [
            {
                "trigger": {"event": "player.jumpCommitted"},
                "conditions": [],
                "actions": [gravity_action()],
            }
        ],
        "explanation": "每跳一次重力反转",
        "warnings": [],
    }
    document.update(overrides)
    return document


def test_compiles_a_valid_rule_into_a_versioned_pack():
    result = compile_doc(gravity_doc())

    assert result.ok is True
    assert result.pack is not None
    assert result.pack.dslVersion == "1.1.0"
    assert result.pack.engineVersion == "0.1.0"
    assert result.pack.levelId == "lab-01"
    assert result.pack.packId.startswith("pack-")
    assert len(result.pack.rules) == 1


def test_compiler_fills_missing_ids_targets_and_defaults():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [],
                    "actions": [{"op": "player.gravity.toggle", "target": "", "params": {}}],
                }
            ],
            "explanation": "",
            "warnings": [],
        }
    )

    assert result.ok is True
    rule = result.pack.rules[0]
    assert rule.id == "rule-1"
    assert rule.actions[0].target == "player"
    # The compiler supplies the registered default magnitude.
    assert rule.actions[0].params["magnitude"] == 980


def test_pack_id_is_stable_for_identical_content():
    first = compile_doc(gravity_doc())
    second = compile_doc(gravity_doc())

    assert first.pack.packId == second.pack.packId


def test_empty_pack_is_refused():
    result = compile_doc({"status": "ok", "rules": [], "explanation": "", "warnings": []})

    assert result.ok is False
    assert result.report.schemaOk is False
    assert "at least one rule" in " ".join(result.report.errors)


def test_unregistered_action_is_refused_by_the_schema_layer():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [],
                    "actions": [
                        {"op": "player.teleport.anywhere", "target": "player", "params": {}}
                    ],
                }
            ],
        }
    )

    assert result.ok is False
    assert result.report.schemaOk is False
    assert "not registered" in " ".join(result.report.errors)


def test_unregistered_event_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.dance"},
                    "conditions": [],
                    "actions": [{"op": "player.gravity.toggle", "target": "player", "params": {}}],
                }
            ],
        }
    )

    assert result.ok is False
    assert "not registered" in " ".join(result.report.errors)


def test_too_many_rules_is_refused():
    rule = gravity_doc()["rules"][0]
    result = compile_doc({"status": "ok", "rules": [rule, rule, rule, rule]})

    assert result.ok is False
    assert "limit is 3" in " ".join(result.report.errors)


def test_out_of_bounds_parameter_is_refused_by_the_semantic_layer():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [],
                    "actions": [
                        {
                            "op": "player.gravity.toggle",
                            "target": "player",
                            "params": {"magnitude": 9999},
                        }
                    ],
                }
            ],
        }
    )

    assert result.ok is False
    assert result.report.schemaOk is True
    assert result.report.semanticOk is False
    assert "outside 500-1400" in " ".join(result.report.errors)


def test_numeric_operator_on_a_boolean_fact_is_refused_by_the_type_layer():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [{"op": "gt", "fact": "player.alive", "value": 1}],
                    "actions": [gravity_action()],
                }
            ],
        }
    )

    assert result.ok is False
    assert result.report.typeOk is False
    assert "cannot be applied" in " ".join(result.report.errors)


def test_unknown_fact_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [{"op": "eq", "fact": "player.secret", "value": 1}],
                    "actions": [gravity_action()],
                }
            ],
        }
    )

    assert result.ok is False
    assert "whitelist" in " ".join(result.report.errors)


def test_two_rules_writing_the_same_resource_is_a_conflict():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [],
                    "actions": [gravity_action()],
                },
                {
                    "trigger": {"event": "player.landed"},
                    "conditions": [],
                    "actions": [gravity_action()],
                },
            ],
        }
    )

    assert result.ok is False
    assert result.report.conflictOk is False
    assert "conflict" in " ".join(result.report.errors)


def test_enemy_action_on_a_level_without_enemies_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "coin.collected"},
                    "conditions": [],
                    "actions": [
                        {
                            "op": "enemy.speed.multiply",
                            "target": "enemies",
                            "params": {"factor": 0.7},
                        }
                    ],
                }
            ],
        },
        level=BARE_LEVEL,
    )

    assert result.ok is False
    assert result.report.levelCompatible is False
    assert "has none" in " ".join(result.report.errors)


def test_platform_action_targeting_an_unknown_platform_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "level.start"},
                    "conditions": [],
                    "actions": [
                        {
                            "op": "platform.visibility.set",
                            "target": "platform",
                            "params": {"platformId": "nope", "visible": False},
                        }
                    ],
                }
            ],
        }
    )

    assert result.ok is False
    assert result.report.levelCompatible is False
    assert "not hideable" in " ".join(result.report.errors)


def test_checkpoint_action_targeting_an_unknown_checkpoint_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "level.start"},
                    "conditions": [],
                    "actions": [
                        {
                            "op": "checkpoint.activate",
                            "target": "player",
                            "params": {"checkpointId": "nope"},
                        }
                    ],
                }
            ],
        }
    )

    assert result.ok is False
    assert "does not define" in " ".join(result.report.errors)


def test_unsupported_status_compiles_to_a_refusal_not_an_error():
    result = compile_doc(
        {
            "status": "unsupported",
            "rules": [],
            "explanation": "无法表达",
            "warnings": [],
        }
    )

    assert result.ok is False
    assert result.explanation == "无法表达"


def test_condition_depth_limit_is_enforced():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [
                        {"all": [{"all": [{"op": "eq", "fact": "player.hp", "value": 1}]}]}
                    ],
                    "actions": [gravity_action()],
                }
            ],
        }
    )

    assert result.ok is False
    assert "deeper than" in " ".join(result.report.errors)


def test_zero_divisor_is_refused():
    result = compile_doc(
        {
            "status": "ok",
            "rules": [
                {
                    "trigger": {"event": "coin.collected"},
                    "conditions": [{"op": "modEq", "fact": "player.coinCount", "value": 0}],
                    "actions": [gravity_action()],
                }
            ],
        }
    )

    assert result.ok is False
    assert "divisor" in " ".join(result.report.errors)


@pytest.mark.parametrize(
    "raw",
    [
        {"status": "nonsense", "rules": []},
        {"rules": []},
        {"status": "ok", "rules": [{"trigger": {}, "actions": []}]},
    ],
)
def test_malformed_ir_is_rejected_at_parse_time(raw):
    with pytest.raises(ValueError):
        parse_ir(raw)