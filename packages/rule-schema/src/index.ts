/**
 * Single source of truth for the RuleForge DSL.
 *
 * Mirrors section 4.3 / 4.4 / 4.5 of docs/RuleForge_AI_V1.1.md. The server-side
 * compiler (milestone M2) must stay in sync with these constants; contract tests
 * will enforce it once the Python compiler exists.
 */

export const DSL_VERSION = "1.1.0";
export const ENGINE_VERSION = "0.1.0";

export const P0_EVENTS = [
  "level.start",
  "player.jumpCommitted",
  "player.landed",
  "player.enterZone",
  "player.damage",
  "coin.collected",
  "enemy.defeated",
  "timer.interval",
] as const;

export type P0Event = (typeof P0_EVENTS)[number];

export const P0_ACTIONS = [
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
] as const;

export type P0ActionOp = (typeof P0_ACTIONS)[number];

export const P0_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "modEq",
] as const;

export type P0ConditionOperator = (typeof P0_CONDITION_OPERATORS)[number];

export const P0_FACT_PATHS = [
  "player.hp",
  "player.alive",
  "player.grounded",
  "player.gravityDirection",
  "player.coinCount",
  "level.elapsedMs",
  "event.platformType",
  "event.platformId",
  "event.zoneId",
] as const;

/** Resource ceilings from section 4.6. Enforced again on the client. */
export const RULE_LIMITS = {
  maxRulesPerPack: 3,
  maxConditionsPerRule: 3,
  maxActionsPerRule: 2,
  maxConditionDepth: 2,
  maxEffectDurationMs: 10_000,
} as const;

export type FactPath = (typeof P0_FACT_PATHS)[number] | `counter.${string}`;

export interface RuleAction {
  op: P0ActionOp;
  target: string;
  params: Record<string, number | boolean | string>;
}

export interface AtomicCondition {
  op: P0ConditionOperator;
  fact: FactPath;
  value: number | boolean | string;
}

export interface GroupCondition {
  all?: ConditionNode[];
  any?: ConditionNode[];
}

export type ConditionNode = AtomicCondition | GroupCondition;

export interface RuleTrigger {
  event: P0Event;
}

export interface Rule {
  id: string;
  trigger: RuleTrigger;
  conditions: ConditionNode[];
  actions: RuleAction[];
}

export interface RulePack {
  dslVersion: string;
  engineVersion: string;
  packId: string;
  levelId: string;
  levelVersion: string;
  seed: number;
  rules: Rule[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const EVENT_SET: ReadonlySet<string> = new Set(P0_EVENTS);
const ACTION_SET: ReadonlySet<string> = new Set(P0_ACTIONS);

function countNodes(nodes: readonly unknown[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (isRecord(node)) {
      const all = node["all"];
      const any = node["any"];
      if (Array.isArray(all)) {
        total += countNodes(all);
      } else if (Array.isArray(any)) {
        total += countNodes(any);
      }
    }
  }
  return total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRule(rule: unknown, index: number, errors: string[]): void {
  const label = `rules[${index}]`;

  if (!isRecord(rule)) {
    errors.push(`${label} must be an object`);
    return;
  }

  if (typeof rule.id !== "string" || rule.id.length === 0) {
    errors.push(`${label}.id must be a non-empty string`);
  }

  const trigger = rule.trigger;
  if (!isRecord(trigger) || typeof trigger.event !== "string") {
    errors.push(`${label}.trigger.event is required`);
  } else if (!EVENT_SET.has(trigger.event)) {
    errors.push(`${label}.trigger.event "${trigger.event}" is not a registered P0 event`);
  }

  const conditions = rule.conditions;
  if (conditions !== undefined) {
    if (!Array.isArray(conditions)) {
      errors.push(`${label}.conditions must be an array`);
    } else {
      // Count every node, not just top-level entries: two groups of two
      // children is four conditions, not two.
      const nodeCount = countNodes(conditions);
      if (nodeCount > RULE_LIMITS.maxConditionsPerRule) {
        errors.push(
          `${label}.conditions has ${nodeCount} nodes, limit is ${RULE_LIMITS.maxConditionsPerRule}`,
        );
      }
    }
  }

  const actions = rule.actions;
  if (!Array.isArray(actions)) {
    errors.push(`${label}.actions must be an array`);
    return;
  }

  if (actions.length > RULE_LIMITS.maxActionsPerRule) {
    errors.push(
      `${label}.actions has ${actions.length} entries, limit is ${RULE_LIMITS.maxActionsPerRule}`,
    );
  }

  actions.forEach((action, actionIndex) => {
    const actionLabel = `${label}.actions[${actionIndex}]`;
    if (!isRecord(action)) {
      errors.push(`${actionLabel} must be an object`);
      return;
    }
    if (typeof action.op !== "string") {
      errors.push(`${actionLabel}.op is required`);
    } else if (!ACTION_SET.has(action.op)) {
      errors.push(`${actionLabel}.op "${action.op}" is not a registered P0 action`);
    }
    if (typeof action.target !== "string" || action.target.length === 0) {
      errors.push(`${actionLabel}.target must be a non-empty string`);
    }
  });
}

/**
 * Structural pre-flight check. This is intentionally shallow: it proves the
 * shape and the registry membership only. Semantic and conflict validation live
 * on the server and are authoritative.
 */
export function validateRulePackShape(pack: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(pack)) {
    return { ok: false, errors: ["rule pack must be an object"] };
  }

  if (pack.dslVersion !== DSL_VERSION) {
    errors.push(`dslVersion must be "${DSL_VERSION}", received "${String(pack.dslVersion)}"`);
  }

  if (typeof pack.levelId !== "string" || pack.levelId.length === 0) {
    errors.push("levelId must be a non-empty string");
  }

  const rules = pack.rules;
  if (!Array.isArray(rules)) {
    errors.push("rules must be an array");
  } else {
    if (rules.length === 0) {
      errors.push("rules must not be empty");
    }
    if (rules.length > RULE_LIMITS.maxRulesPerPack) {
      errors.push(
        `rules has ${rules.length} entries, limit is ${RULE_LIMITS.maxRulesPerPack}`,
      );
    }
    rules.forEach((rule, index) => validateRule(rule, index, errors));
  }

  return { ok: errors.length === 0, errors };
}