import { DSL_VERSION, RULE_LIMITS, validateRulePackShape } from "@ruleforge/rule-schema";
import type { ConditionNode, P0ActionOp, RuleAction } from "@ruleforge/rule-schema";

import { countConditionNodes } from "@/game/rules/conditions";

import type { RuntimeEventName } from "@/game/rules/types";

export const IMPLEMENTED_ACTIONS: ReadonlySet<P0ActionOp> = new Set<P0ActionOp>([
  "player.gravity.toggle",
  "player.speed.multiply",
  "player.jump.scale",
  "enemy.speed.multiply",
  "enemy.direction.reverse",
  "coin.flee",
  "player.shield.grant",
  "enemy.spawn",
  "coin.spawn",
  "platform.visibility.set",
  "platform.collapseAfter",
  "checkpoint.activate",
]);

export const RUNTIME_EVENTS: ReadonlySet<string> = new Set<RuntimeEventName>([
  "level.start",
  "player.jumpCommitted",
  "player.landed",
  "player.enterZone",
  "player.damage",
  "coin.collected",
  "enemy.defeated",
  "timer.interval",
]);

/** Parameter bounds from the DSL spec, section 4.5. */
const PARAM_BOUNDS: Partial<Record<P0ActionOp, Record<string, { min: number; max: number }>>> = {
  "player.gravity.toggle": { magnitude: { min: 500, max: 1400 } },
  "player.speed.multiply": { factor: { min: 0.4, max: 2 } },
  "player.jump.scale": { factor: { min: 0.5, max: 1.7 } },
  "enemy.speed.multiply": { factor: { min: 0.3, max: 2 } },
  "coin.flee": { radius: { min: 40, max: 200 }, speed: { min: 30, max: 180 } },
  "player.shield.grant": { durationMs: { min: 1000, max: 10000 } },
  "enemy.spawn": { count: { min: 1, max: 2 } },
  "coin.spawn": { count: { min: 1, max: 3 } },
  "platform.collapseAfter": { delayMs: { min: 250, max: 5000 } },
};

/** Parameters that must be present and boolean, not numeric. */
const BOOLEAN_PARAMS: Partial<Record<P0ActionOp, string[]>> = {
  "platform.visibility.set": ["visible"],
};

/** Parameters that must be present and a non-empty string. */
const STRING_PARAMS: Partial<Record<P0ActionOp, string[]>> = {
  "platform.visibility.set": ["platformId"],
  "checkpoint.activate": ["checkpointId"],
};

export class RulePackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulePackError";
  }
}

function fail(message: string): never {
  throw new RulePackError(message);
}

/**
 * Validates a rule pack for execution.
 *
 * Two stages on purpose: the shared shape validator proves the structure, then
 * this pass proves every action can actually run. A pack that references an
 * unimplemented action is rejected outright — silently ignoring it would make
 * the game lie about what the player's rule does.
 */
export function parseExecutablePack(raw: unknown): { id: string; rules: unknown[] } {
  const shape = validateRulePackShape(raw);
  if (!shape.ok) {
    fail(shape.errors.join("; "));
  }

  const pack = raw as {
    packId?: string;
    id?: string;
    rules: Array<{
      id: string;
      trigger: { event: string };
      conditions?: ConditionNode[];
      actions: RuleAction[];
    }>;
  };
  // Prefer the server's content-hashed packId; "id" is the older preset shape.
  const label =
    typeof pack.packId === "string" && pack.packId.length > 0
      ? pack.packId
      : typeof pack.id === "string" && pack.id.length > 0
        ? pack.id
        : "rule-pack";

  if (!Array.isArray(pack.rules) || pack.rules.length === 0) {
    fail("rule pack has no rules");
  }
  if (pack.rules.length > RULE_LIMITS.maxRulesPerPack) {
    fail(`rule pack exceeds ${RULE_LIMITS.maxRulesPerPack} rules`);
  }

  for (const rule of pack.rules) {
    if (!RUNTIME_EVENTS.has(rule.trigger.event)) {
      fail(`rule "${rule.id}" listens to unsupported event "${rule.trigger.event}"`);
    }

    if (rule.conditions !== undefined) {
      if (!Array.isArray(rule.conditions)) {
        fail(`rule "${rule.id}" conditions must be an array`);
      }
      const nodeCount = countConditionNodes(rule.conditions);
      if (nodeCount > RULE_LIMITS.maxConditionsPerRule) {
        fail(
          `rule "${rule.id}" conditions has ${nodeCount} nodes, limit is ${RULE_LIMITS.maxConditionsPerRule}`,
        );
      }
    }

    for (const action of rule.actions) {
      if (!IMPLEMENTED_ACTIONS.has(action.op)) {
        fail(`rule "${rule.id}" uses action "${action.op}", which is not implemented yet`);
      }

      for (const name of BOOLEAN_PARAMS[action.op] ?? []) {
        if (typeof action.params[name] !== "boolean") {
          fail(`rule "${rule.id}" action "${action.op}" needs a boolean "${name}"`);
        }
      }

      for (const name of STRING_PARAMS[action.op] ?? []) {
        const value = action.params[name];
        if (typeof value !== "string" || value.length === 0) {
          fail(`rule "${rule.id}" action "${action.op}" needs a non-empty "${name}"`);
        }
      }

      const bounds = PARAM_BOUNDS[action.op];
      if (!bounds) {
        continue;
      }
      for (const [name, range] of Object.entries(bounds)) {
        const value = action.params[name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          fail(`rule "${rule.id}" action "${action.op}" needs a numeric "${name}"`);
        }
        if (value < range.min || value > range.max) {
          fail(
            `rule "${rule.id}" action "${action.op}" param "${name}"=${value} is outside ${range.min}-${range.max}`,
          );
        }
      }
    }
  }

  return { id: label, rules: pack.rules };
}

export { DSL_VERSION };