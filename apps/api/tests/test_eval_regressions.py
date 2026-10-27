"""Regressions for the defects the 50-prompt evaluation exposed.

Each of these was invisible to the existing suite and only showed up when real
prose was pushed through the pipeline.
"""

from app.compiler import RuleCompiler, parse_ir
from app.services.levels import SUPPORTED_LEVELS

LEVEL = SUPPORTED_LEVELS["lab-01"]


def compile_rules(*actions: dict):
    document = {
        "status": "ok",
        "rules": [
            {"trigger": {"event": "level.start"}, "conditions": [], "actions": list(actions)}
        ],
    }
    return RuleCompiler().compile(parse_ir(document), level=LEVEL)


def test_checkpoint_action_gets_a_valid_id_when_the_model_omits_one():
    """The model has never seen the level, so it cannot know checkpoint ids.

    Rejecting the rule made "activate a checkpoint" impossible to express even
    though the level defines valid ones. The compiler knows them, so it fills the
    id instead of failing.
    """
    result = compile_rules({"op": "checkpoint.activate", "target": "player", "params": {}})

    assert result.ok is True
    params = result.pack.rules[0].actions[0].params
    assert params["checkpointId"] in LEVEL.checkpoints


def test_hideable_platform_action_gets_a_valid_id():
    result = compile_rules(
        {"op": "platform.visibility.set", "target": "platform", "params": {"visible": False}}
    )

    assert result.ok is True
    params = result.pack.rules[0].actions[0].params
    assert params["platformId"] in LEVEL.hideablePlatforms


def test_an_explicit_id_is_never_overwritten():
    result = compile_rules(
        {"op": "checkpoint.activate", "target": "player", "params": {"checkpointId": "end-1"}}
    )

    assert result.ok is True
    assert result.pack.rules[0].actions[0].params["checkpointId"] == "end-1"


def test_a_level_without_checkpoints_still_rejects_the_rule():
    """Filling a default must not invent an id the level does not have."""
    from app.domain.models import LevelCapabilities

    bare = LevelCapabilities(levelId="bare", levelVersion="1.0.0")
    document = {
        "status": "ok",
        "rules": [
            {
                "trigger": {"event": "level.start"},
                "conditions": [],
                "actions": [{"op": "checkpoint.activate", "target": "player", "params": {}}],
            }
        ],
    }

    result = RuleCompiler().compile(parse_ir(document), level=bare)

    assert result.ok is False
    assert "checkpointId" in " ".join(result.report.errors)