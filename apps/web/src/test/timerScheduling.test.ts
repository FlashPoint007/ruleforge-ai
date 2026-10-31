import { describe, expect, it } from "vitest";

import { nextFireTime } from "@/game/systems/timerScheduling";

describe("timer scheduling", () => {
  it("advances one interval when on time", () => {
    expect(nextFireTime(1000, 1000, 1000)).toBe(2000);
  });

  it("skips the whole backlog after a long pause", () => {
    // 30 seconds late must schedule the next firing in the future, not queue 30.
    expect(nextFireTime(1000, 31_000, 1000)).toBe(32_000);
  });

  it("never returns a time in the past", () => {
    for (const now of [1000, 1001, 5000, 99_999]) {
      expect(nextFireTime(1000, now, 1000)).toBeGreaterThan(now);
    }
  });

  it("keeps the cadence when a frame is slightly late", () => {
    expect(nextFireTime(1000, 1600, 1000)).toBe(2000);
  });

  it("is monotonic across repeated late frames", () => {
    let at = 1000;
    const times: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      at = nextFireTime(at, at + 5000, 1000);
      times.push(at);
    }
    // Strictly increasing: a regression would emit the same timestamp repeatedly.
    expect(times.every((value, index) => index === 0 || value > (times[index - 1] as number))).toBe(
      true,
    );
  });
});
