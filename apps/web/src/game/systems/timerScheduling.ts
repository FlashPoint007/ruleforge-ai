/**
 * Fixed-cadence scheduling for `timer.interval`.
 *
 * Extracted from the scene so the rule is testable without Phaser, and so the
 * test covers the code that actually runs.
 */
export function nextFireTime(nextAtMs: number, nowMs: number, intervalMs: number): number {
  // Skip the whole backlog in one step. Advancing by a single interval per frame
  // meant a long pause (paused scene, throttled tab) emitted one event per frame
  // until it caught up: a burst, not a cadence.
  const missed = Math.floor((nowMs - nextAtMs) / intervalMs);
  return nextAtMs + intervalMs * (missed + 1);
}
