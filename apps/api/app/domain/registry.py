"""The DSL registry, mirrored from packages/rule-schema.

This module is the server's copy of the executable vocabulary. It must stay in
lockstep with packages/rule-schema/src/index.ts; a contract test asserts that,
because a drift here would let the server emit packs the client cannot run.
"""

from typing import Final

DSL_VERSION: Final = "1.1.0"
ENGINE_VERSION: Final = "0.1.0"

P0_EVENTS: Final[tuple[str, ...]] = (
    "level.start",
    "player.jumpCommitted",
    "player.landed",
    "player.enterZone",
    "player.damage",
    "coin.collected",
    "enemy.defeated",
    "timer.interval",
)

P0_ACTIONS: Final[tuple[str, ...]] = (
    "player.gravity.toggle",
    "player.jump.scale",
    "player.speed.multiply",
    "player.shield.grant",
    "enemy.speed.multiply",
    "enemy.spawn",
    "enemy.direction.reverse",
    "platform.visibility.set",
    "platform.collapseAfter",
    "coin.spawn",
    "coin.flee",
    "checkpoint.activate",
)

P0_CONDITION_OPERATORS: Final[tuple[str, ...]] = (
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "modEq",
)

P0_FACT_PATHS: Final[tuple[str, ...]] = (
    "player.hp",
    "player.alive",
    "player.grounded",
    "player.gravityDirection",
    "player.coinCount",
    "level.elapsedMs",
    "event.platformType",
    "event.platformId",
    "event.zoneId",
)

MAX_RULES_PER_PACK: Final = 3
MAX_CONDITIONS_PER_RULE: Final = 3
MAX_ACTIONS_PER_RULE: Final = 2
MAX_CONDITION_DEPTH: Final = 2
MAX_EFFECT_DURATION_MS: Final = 10_000

# Per-action parameter bounds, from spec section 4.5.
PARAM_BOUNDS: Final[dict[str, dict[str, tuple[float, float]]]] = {
    "player.gravity.toggle": {"magnitude": (500, 1400)},
    "player.jump.scale": {"factor": (0.5, 1.7)},
    "player.speed.multiply": {"factor": (0.4, 2.0)},
    "player.shield.grant": {"durationMs": (1000, 10_000)},
    "enemy.speed.multiply": {"factor": (0.3, 2.0)},
    "enemy.spawn": {"count": (1, 2)},
    "coin.spawn": {"count": (1, 3)},
    "coin.flee": {"radius": (40, 200), "speed": (30, 180)},
    "platform.collapseAfter": {"delayMs": (250, 5000)},
}

# Actions whose parameters are booleans rather than numbers.
BOOLEAN_PARAMS: Final[dict[str, tuple[str, ...]]] = {
    "platform.visibility.set": ("visible",),
}

# Actions whose parameters must be non-empty strings.
STRING_PARAMS: Final[dict[str, tuple[str, ...]]] = {
    "platform.visibility.set": ("platformId",),
    "checkpoint.activate": ("checkpointId",),
}

# The resource each action writes, used for conflict detection.
WRITE_SET: Final[dict[str, tuple[str, ...]]] = {
    "player.gravity.toggle": ("player.gravity.controller",),
    "player.jump.scale": ("player.jump.multiplier",),
    "player.speed.multiply": ("player.speed.multiplier",),
    "player.shield.grant": ("player.shield",),
    "enemy.speed.multiply": ("enemy.speed.multiplier",),
    "enemy.spawn": ("enemy.spawnPool",),
    "enemy.direction.reverse": ("enemy.direction",),
    "platform.visibility.set": ("platform.visibility",),
    "platform.collapseAfter": ("platform.active",),
    "coin.spawn": ("coin.spawnPool",),
    "coin.flee": ("coin.movementMode",),
    "checkpoint.activate": ("player.checkpoint",),
}
