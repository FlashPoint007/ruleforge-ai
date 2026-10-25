import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { RULES_CHANGED_EVENT } from "@/game/rules/types";

describe("App", () => {
  it("renders the product title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RuleForge AI" })).toBeInTheDocument();
  });

  it("renders the two offline preset rules", () => {
    render(<App />);
    // The preset list and the rule panel both name these rules.
    expect(screen.getAllByText("重力反转").length).toBeGreaterThan(0);
    expect(screen.getAllByText("拾金减速").length).toBeGreaterThan(0);
  });

  it("shows the rule panel in an inactive state by default", () => {
    render(<App />);
    expect(screen.getByTestId("rule-status")).toHaveTextContent("当前没有生效的规则");
  });

  it("does not claim a rule is active before the lab is running", async () => {
    render(<App />);
    const [card] = screen.getAllByRole("button", { name: /重力反转/ });
    expect(card).toBeDefined();
    await userEvent.click(card as HTMLElement);

    // No game is mounted in jsdom, so the panel must say so rather than lie.
    expect(screen.getByTestId("rule-status")).toHaveTextContent("实验室未启动");
  });

  it("reports a blocked condition instead of pretending nothing happened", () => {
    render(<App />);

    // The scene broadcasts real engine stats; a rule that fired but was blocked
    // by its guard must say so, otherwise it looks broken to the player.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(RULES_CHANGED_EVENT, {
          detail: {
            packId: "preset-guarded-gravity",
            error: null,
            stats: {
              eventsDispatched: 3,
              eventsDropped: 0,
              actionsApplied: 0,
              actionsRejected: 0,
              conditionsBlocked: 3,
            },
          },
        }),
      );
    });

    expect(screen.getByTestId("rule-status")).toHaveTextContent("条件未满足 3 次");
  });

  it("lists all twelve registered actions", () => {
    render(<App />);
    expect(screen.getByText("已注册动作（12 / 12）")).toBeInTheDocument();
  });
});