import type { ConditionNode, FactPath, P0ConditionOperator } from "@ruleforge/rule-schema";

/**
 * The world as the condition evaluator sees it.
 *
 * Facts are plain values, resolved by the caller. The evaluator never reaches
 * into Phaser, which keeps it a pure function and therefore testable without a
 * browser.
 */
export type FactValue = number | boolean | string;

export interface FactSnapshot {
  /** Resolved facts by path, e.g. "player.hp". Missing keys read as undefined. */
  values: Record<string, FactValue | undefined>;
  /**
   * Event-scoped facts are only legal while that event is being handled.
   * Reading event.platformId during coin.collected must fail loudly, not
   * silently return undefined — the spec calls this out explicitly.
   */
  eventName: string;
}

export class ConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionError";
  }
}

const MAX_DEPTH = 2;

function compare(
  op: P0ConditionOperator,
  actual: FactValue | undefined,
  expected: FactValue,
): boolean {
  if (actual === undefined) {
    // An unknown fact is a validation bug, not a false condition: treating it as
    // false would silently disable the player's rule.
    throw new ConditionError("fact is not available in this context");
  }

  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    default:
      break;
  }

  if (typeof actual !== "number" || typeof expected !== "number") {
    throw new ConditionError(`operator "${op}" requires numeric operands`);
  }

  switch (op) {
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    case "modEq":
      // modEq with a zero divisor is a rule author's mistake; refuse it rather
      // than returning Infinity-based nonsense.
      if (expected === 0) {
        throw new ConditionError("modEq divisor must not be zero");
      }
      return actual % expected === 0;
    default:
      throw new ConditionError(`unknown operator "${String(op)}"`);
  }
}

interface AtomicNode {
  op: P0ConditionOperator;
  fact: FactPath;
  value: FactValue;
}

function isAtomic(node: ConditionNode): node is AtomicNode {
  return typeof (node as { op?: unknown }).op === "string";
}

/**
 * Evaluates a condition tree.
 *
 * Returns true when there is nothing to check, so a rule without conditions
 * keeps behaving exactly as it did before conditions existed.
 */
export function evaluateConditions(nodes: readonly ConditionNode[] | undefined, snapshot: FactSnapshot): boolean {
  if (!nodes || nodes.length === 0) {
    return true;
  }
  return evaluateAll(nodes, snapshot, 1);
}

function evaluateAll(
  nodes: readonly ConditionNode[],
  snapshot: FactSnapshot,
  depth: number,
): boolean {
  if (depth > MAX_DEPTH) {
    throw new ConditionError(`condition nesting exceeds depth ${MAX_DEPTH}`);
  }
  return nodes.every((node) => evaluateNode(node, snapshot, depth));
}

function evaluateNode(node: ConditionNode, snapshot: FactSnapshot, depth: number): boolean {
  if (isAtomic(node)) {
    return compare(node.op, snapshot.values[node.fact], node.value);
  }

  const group = node as { all?: ConditionNode[]; any?: ConditionNode[] };

  if (Array.isArray(group.all)) {
    return evaluateAll(group.all, snapshot, depth + 1);
  }
  if (Array.isArray(group.any)) {
    if (depth + 1 > MAX_DEPTH) {
      throw new ConditionError(`condition nesting exceeds depth ${MAX_DEPTH}`);
    }
    return group.any.some((child) => evaluateNode(child, snapshot, depth + 1));
  }

  throw new ConditionError("condition node must be an atomic comparison or an all/any group");
}

/** Counts nodes so a pack can be checked against the spec's per-rule ceiling. */
export function countConditionNodes(nodes: readonly ConditionNode[] | undefined): number {
  if (!nodes) {
    return 0;
  }
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (!isAtomic(node)) {
      const group = node as { all?: ConditionNode[]; any?: ConditionNode[] };
      total += countConditionNodes(group.all ?? group.any ?? []);
    }
  }
  return total;
}