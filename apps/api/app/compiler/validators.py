"""The five validation layers, each independently reportable.

Order matters: schema first (is this even a rule?), then types (are the operands
sane?), then semantics (are the values within the registered bounds?), then
conflicts (do two rules fight?), then level compatibility (can this level even
support it?). A later layer is meaningless if an earlier one failed, so the
compiler short-circuits but still reports every layer it reached.
"""

from app.domain.models import (
    AtomicCondition,
    ConditionNode,
    LevelCapabilities,
    Rule,
    ValidationReport,
)
from app.domain.registry import (
    BOOLEAN_PARAMS,
    MAX_ACTIONS_PER_RULE,
    MAX_CONDITION_DEPTH,
    MAX_CONDITIONS_PER_RULE,
    MAX_EFFECT_DURATION_MS,
    MAX_RULES_PER_PACK,
    P0_ACTIONS,
    P0_CONDITION_OPERATORS,
    P0_EVENTS,
    P0_FACT_PATHS,
    PARAM_BOUNDS,
    STRING_PARAMS,
    WRITE_SET,
    allowed_params,
)

"""The declared type of each whitelisted fact.

Comparing a boolean fact with `gt` cannot mean anything, and the compiler knows
that without running the game, so it is a type error rather than a semantic one.
"""
FACT_TYPES: dict[str, str] = {
    "player.hp": "number",
    "player.alive": "boolean",
    "player.grounded": "boolean",
    "player.gravityDirection": "number",
    "player.coinCount": "number",
    "level.elapsedMs": "number",
    "event.platformType": "string",
    "event.platformId": "string",
    "event.zoneId": "string",
}

ORDERING_OPERATORS = frozenset({"gt", "gte", "lt", "lte", "modEq"})

EVENT_SET = frozenset(P0_EVENTS)
ACTION_SET = frozenset(P0_ACTIONS)
OPERATOR_SET = frozenset(P0_CONDITION_OPERATORS)
FACT_SET = frozenset(P0_FACT_PATHS)


def _is_atomic(node: ConditionNode) -> bool:
    return isinstance(node, AtomicCondition)


def _condition_depth(nodes: list[ConditionNode]) -> int:
    """Deepest nesting level in a condition list (a flat list is depth 1)."""
    depth = 0
    for node in nodes:
        if _is_atomic(node):
            depth = max(depth, 1)
        else:
            group = node
            children = group.all if group.all is not None else group.any
            depth = max(depth, 1 + _condition_depth(children or []))
    return depth


def _count_nodes(nodes: list[ConditionNode]) -> int:
    total = 0
    for node in nodes:
        total += 1
        if not _is_atomic(node):
            group = node
            children = group.all if group.all is not None else group.any
            total += _count_nodes(children or [])
    return total


def validate_schema(rules: list[Rule], report: ValidationReport) -> bool:
    """Layer 1: structure. Non-empty pack, registered event, action shape."""
    ok = True

    if not rules:
        report.errors.append("rule pack is empty; at least one rule is required")
        return False

    if len(rules) > MAX_RULES_PER_PACK:
        report.errors.append(f"rule pack has {len(rules)} rules, limit is {MAX_RULES_PER_PACK}")
        ok = False

    for rule in rules:
        label = f"rule {rule.id!r}"

        if rule.trigger.event not in EVENT_SET:
            report.errors.append(f"{label} trigger event {rule.trigger.event!r} is not registered")
            ok = False

        if not rule.actions:
            report.errors.append(f"{label} has no actions")
            ok = False

        if len(rule.actions) > MAX_ACTIONS_PER_RULE:
            report.errors.append(
                f"{label} has {len(rule.actions)} actions, limit is {MAX_ACTIONS_PER_RULE}"
            )
            ok = False

        node_count = _count_nodes(rule.conditions)
        if node_count > MAX_CONDITIONS_PER_RULE:
            report.errors.append(
                f"{label} has {node_count} condition nodes, limit is {MAX_CONDITIONS_PER_RULE}"
            )
            ok = False

        if _condition_depth(rule.conditions) > MAX_CONDITION_DEPTH:
            report.errors.append(
                f"{label} nests conditions deeper than {MAX_CONDITION_DEPTH}"
            )
            ok = False

        for action in rule.actions:
            if action.op not in ACTION_SET:
                report.errors.append(f"{label} action {action.op!r} is not registered")
                ok = False

    report.schemaOk = ok
    return ok


def validate_types(rules: list[Rule], report: ValidationReport) -> bool:
    """Layer 2: operand types. Numbers compare with numbers, booleans with booleans."""
    ok = True

    for rule in rules:
        label = f"rule {rule.id!r}"

        for action in rule.actions:
            for name in BOOLEAN_PARAMS.get(action.op, ()):
                if not isinstance(action.params.get(name), bool):
                    report.errors.append(f"{label} action {action.op} needs a boolean {name!r}")
                    ok = False

            for name in STRING_PARAMS.get(action.op, ()):
                value = action.params.get(name)
                if not isinstance(value, str) or not value:
                    report.errors.append(
                        f"{label} action {action.op} needs a non-empty string {name!r}"
                    )
                    ok = False

        for action in rule.actions:
            permitted = allowed_params(action.op)
            unknown = sorted(set(action.params) - permitted)
            if unknown:
                # Silently dropping an unknown parameter changes what the rule
                # means while still reporting success.
                report.errors.append(
                    f"{label} action {action.op} has unknown parameter(s): {unknown}"
                )
                ok = False

        for node in _walk_conditions(rule.conditions):
            if not _is_atomic(node):
                continue
            atomic = node
            if atomic.op not in OPERATOR_SET:
                report.errors.append(f"{label} condition operator {atomic.op!r} is not registered")
                ok = False
            if not _fact_is_allowed(atomic.fact):
                report.errors.append(
                    f"{label} condition fact {atomic.fact!r} is not in the whitelist"
                )
                ok = False
            operand_is_number = isinstance(atomic.value, (int, float)) and not isinstance(
                atomic.value, bool
            )
            if atomic.op in ORDERING_OPERATORS and not operand_is_number:
                report.errors.append(
                    f"{label} operator {atomic.op} requires a numeric operand, "
                    f"got {type(atomic.value).__name__}"
                )
                ok = False

            declared = FACT_TYPES.get(atomic.fact)
            if atomic.op in ORDERING_OPERATORS and declared is not None and declared != "number":
                report.errors.append(
                    f"{label} operator {atomic.op} cannot be applied to {atomic.fact!r}, "
                    f"which is a {declared}"
                )
                ok = False

            if atomic.op in {"eq", "neq"} and declared is not None:
                actual_kind = _python_kind(atomic.value)
                if actual_kind != declared:
                    report.errors.append(
                        f"{label} fact {atomic.fact!r} is a {declared} but is compared with "
                        f"a {actual_kind}"
                    )
                    ok = False

    report.typeOk = ok
    return ok


def _walk_conditions(nodes: list[ConditionNode]):
    for node in nodes:
        yield node
        if not _is_atomic(node):
            group = node
            children = group.all if group.all is not None else group.any
            yield from _walk_conditions(children or [])


def _python_kind(value: float | int | bool | str) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    return "string"


def _fact_is_allowed(path: str) -> bool:
    if path in FACT_SET:
        return True
    # counter.<registeredName> is the only open-ended form the DSL allows.
    return path.startswith("counter.") and len(path) > len("counter.")


def validate_semantics(rules: list[Rule], report: ValidationReport) -> bool:
    """Layer 3: values are inside the registered bounds."""
    ok = True

    for rule in rules:
        label = f"rule {rule.id!r}"

        for action in rule.actions:
            bounds = PARAM_BOUNDS.get(action.op, {})
            for name, (low, high) in bounds.items():
                value = action.params.get(name)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    report.errors.append(
                        f"{label} action {action.op} needs a numeric {name!r}, "
                        f"got {type(value).__name__}"
                    )
                    ok = False
                    continue
                if value < low or value > high:
                    report.errors.append(
                        f"{label} action {action.op} param {name}={value} is outside {low}-{high}"
                    )
                    ok = False

            duration = action.params.get("durationMs")
            if isinstance(duration, (int, float)) and duration > MAX_EFFECT_DURATION_MS:
                report.errors.append(
                    f"{label} action {action.op} durationMs exceeds {MAX_EFFECT_DURATION_MS}"
                )
                ok = False

        for node in _walk_conditions(rule.conditions):
            if _is_atomic(node) and node.op == "modEq" and node.value == 0:
                report.errors.append(f"{label} modEq divisor must not be zero")
                ok = False

    report.semanticOk = ok
    return ok


def validate_conflicts(rules: list[Rule], report: ValidationReport) -> bool:
    """Layer 4: two rules must not write the same resource with opposed intent."""
    ok = True

    writes: dict[str, list[str]] = {}
    for rule in rules:
        for action in rule.actions:
            for resource in WRITE_SET.get(action.op, ()):
                writes.setdefault(resource, []).append(f"{rule.id}:{action.op}")

    for resource, writers in writes.items():
        if len(writers) < 2:
            continue
        # Any resource written by two rules is a conflict. Two rules writing the
        # same controller cancel each other out, which is just as wrong as two
        # different ops fighting over one field — and far harder to notice.
        report.errors.append(
            f"conflict on {resource!r}: {', '.join(sorted(writers))} write the same resource"
        )
        ok = False

    report.conflictOk = ok
    return ok


def validate_level_compatibility(
    rules: list[Rule], level: LevelCapabilities, report: ValidationReport
) -> bool:
    """Layer 5: the level must actually be able to support the rules."""
    ok = True

    for rule in rules:
        label = f"rule {rule.id!r}"

        for action in rule.actions:
            needs_enemies = action.op in {"enemy.speed.multiply", "enemy.direction.reverse"}
            if needs_enemies and not level.hasEnemies:
                report.errors.append(
                    f"{label} needs enemies, but level {level.levelId} has none"
                )
                ok = False

            if action.op == "coin.flee" and not level.hasCoins:
                report.errors.append(f"{label} needs coins, but level {level.levelId} has none")
                ok = False

            if action.op == "enemy.spawn" and level.enemySpawnPoints == 0:
                report.errors.append(f"{label} needs enemy spawn points; the level defines none")
                ok = False

            if action.op == "coin.spawn" and level.coinSpawnPoints == 0:
                report.errors.append(f"{label} needs coin spawn points; the level defines none")
                ok = False

            if action.op == "platform.collapseAfter" and level.collapsiblePlatforms == 0:
                report.errors.append(f"{label} needs a collapsible platform; the level has none")
                ok = False

            if action.op == "platform.visibility.set":
                platform_id = action.params.get("platformId")
                if not isinstance(platform_id, str) or platform_id not in level.hideablePlatforms:
                    report.errors.append(
                        f"{label} targets platform {platform_id!r}, "
                        "which is not hideable in this level"
                    )
                    ok = False

            if action.op == "checkpoint.activate":
                checkpoint_id = action.params.get("checkpointId")
                if not isinstance(checkpoint_id, str) or checkpoint_id not in level.checkpoints:
                    report.errors.append(
                        f"{label} targets checkpoint {checkpoint_id!r}, "
                        "which the level does not define"
                    )
                    ok = False

    report.levelCompatible = ok
    return ok