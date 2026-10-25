import { afterEach, describe, expect, it } from "vitest";

import { resetTouch, setTouch, touchState } from "@/game/systems/inputBus";

afterEach(() => {
  resetTouch();
});

describe("touch input bus", () => {
  it("starts with every control released", () => {
    expect(touchState).toEqual({ left: false, right: false, jump: false });
  });

  it("records presses", () => {
    setTouch("left", true);
    setTouch("jump", true);

    expect(touchState.left).toBe(true);
    expect(touchState.jump).toBe(true);
    expect(touchState.right).toBe(false);
  });

  it("clears every control on reset", () => {
    setTouch("left", true);
    setTouch("right", true);
    setTouch("jump", true);

    resetTouch();

    expect(touchState).toEqual({ left: false, right: false, jump: false });
  });
});
