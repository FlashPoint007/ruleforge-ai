"""IR -> DSL compiler.

The compiler is deliberately ignorant of which provider produced the IR. It takes
a loose Rule IR document and produces a complete, versioned RulePack, or a report
explaining exactly which layer refused it.
"""

import hashlib
import json
from typing import Any

from app.compiler import validators
from app.domain.models import (
    CompileResult,
    LevelCapabilities,
    Rule,
    RuleIR,
    RuleIRDocument,
    RulePack,
    ValidationReport,
)
from app.domain.registry import DSL_VERSION, ENGINE_VERSION

DEFAULT_TARGETS: dict[str, str] = {
    "player.gravity.toggle": "player",
    "player.jump.scale": "player",
    "player.speed.multiply": "player",
    "player.shield.grant": "player",
    "enemy.speed.multiply": "enemies",
    "enemy.spawn": "enemies",
    "enemy.direction.reverse": "enemies",
    "platform.visibility.set": "platform",
    "platform.collapseAfter": "platform",
    "coin.spawn": "coins",
    "coin.flee": "coins",
    "checkpoint.activate": "player",
}

"""Defaults the compiler fills in when the model omitted a parameter."""
PARAM_DEFAULTS: dict[str, dict[str, float | int | bool | str]] = {
    "player.gravity.toggle": {"magnitude": 980},
    "player.jump.scale": {"factor": 1.2},
    "player.speed.multiply": {"factor": 1.5},
    "player.shield.grant": {"durationMs": 3000},
    "enemy.speed.multiply": {"factor": 0.7},
    "enemy.spawn": {"count": 1},
    "coin.spawn": {"count": 1},
    "coin.flee": {"radius": 120, "speed": 80},
    "platform.collapseAfter": {"delayMs": 2000},
    "platform.visibility.set": {"visible": False},
}


class RuleCompiler:
    """Compiles Rule IR into an executable RulePack."""

    def compile(
        self,
        document: RuleIRDocument,
        *,
        level: LevelCapabilities,
        seed: int = 0,
    ) -> CompileResult:
        report = ValidationReport()

        if document.status == "unsupported":
            return CompileResult(
                ok=False,
                pack=None,
                report=report,
                explanation=document.explanation or "模型无法把这段描述变成受支持的规则。",
                warnings=list(document.warnings),
            )

        rules = [self._lower(rule, index) for index, rule in enumerate(document.rules)]

        # Layers run in order and short-circuit: a later layer cannot say anything
        # meaningful about a pack whose structure is already broken.
        if not validators.validate_schema(rules, report):
            return self._fail(report, document)
        if not validators.validate_types(rules, report):
            return self._fail(report, document)
        if not validators.validate_semantics(rules, report):
            return self._fail(report, document)
        if not validators.validate_conflicts(rules, report):
            return self._fail(report, document)
        if not validators.validate_level_compatibility(rules, level, report):
            return self._fail(report, document)

        content = {
            "dslVersion": DSL_VERSION,
            "engineVersion": ENGINE_VERSION,
            "levelId": level.levelId,
            "levelVersion": level.levelVersion,
            "rules": [rule.model_dump(mode="json") for rule in rules],
        }
        pack_id = "pack-" + hashlib.sha256(
            json.dumps(content, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16]

        pack = RulePack(
            dslVersion=DSL_VERSION,
            engineVersion=ENGINE_VERSION,
            packId=pack_id,
            levelId=level.levelId,
            levelVersion=level.levelVersion,
            seed=seed,
            rules=rules,
        )

        return CompileResult(
            ok=True,
            pack=pack,
            report=report,
            explanation=document.explanation,
            warnings=list(document.warnings),
        )

    def _fail(self, report: ValidationReport, document: RuleIRDocument) -> CompileResult:
        return CompileResult(
            ok=False,
            pack=None,
            report=report,
            explanation=document.explanation,
            warnings=list(document.warnings),
        )

    def _lower(self, rule: RuleIR, index: int) -> Rule:
        """Fills ids, targets and default parameters the model left out."""
        actions = []
        for action in rule.actions:
            params = dict(action.params)
            for name, default in PARAM_DEFAULTS.get(action.op, {}).items():
                params.setdefault(name, default)
            actions.append(
                action.model_copy(
                    update={
                        "target": action.target or DEFAULT_TARGETS.get(action.op, "player"),
                        "params": params,
                    }
                )
            )

        return Rule(
            id=rule.id or f"rule-{index + 1}",
            trigger=rule.trigger,
            conditions=list(rule.conditions),
            actions=actions,
        )


def parse_ir(raw: dict[str, Any]) -> RuleIRDocument:
    """Parses a provider answer into a validated IR document.

    Raises pydantic.ValidationError when the shape is wrong; the caller turns that
    into a validation_failed response rather than a 500.
    """
    return RuleIRDocument.model_validate(raw)