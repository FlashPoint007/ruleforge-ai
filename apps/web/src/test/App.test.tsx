import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";

describe("App", () => {
  it("renders the product title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "RuleForge AI" })).toBeInTheDocument();
  });

  it("renders the two offline preset rules", () => {
    render(<App />);
    expect(screen.getByText("重力反转")).toBeInTheDocument();
    expect(screen.getByText("拾金减速")).toBeInTheDocument();
  });

  it("lists all twelve registered actions", () => {
    render(<App />);
    expect(screen.getByText("已注册动作（12 / 12）")).toBeInTheDocument();
  });
});
