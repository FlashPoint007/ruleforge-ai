import { useEffect, useRef } from "react";

import type Phaser from "phaser";

import { createGame } from "@/game/createGame";
import { readDebugState, registerGame } from "@/game/rules/ruleBridge";

/**
 * Mounts Phaser only in a real browser. jsdom has no canvas or WebGL, so tests
 * must never reach this component's effect body.
 *
 * React StrictMode intentionally mounts, unmounts and remounts in development.
 * Without an explicit teardown that removes the canvas, that leaves two running
 * game loops stacked in the DOM, so cleanup is deliberate here.
 */
export function GameCanvas({ levelId }: { levelId?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const game = createGame(host, levelId);
    gameRef.current = game;
    registerGame(game);

    // Test hook: lets e2e assert on real physics state. Guarded so it never
    // ships a global in a production build.
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      (window as unknown as { __ruleforge?: unknown }).__ruleforge = { readDebugState };
    }

    return () => {
      gameRef.current = null;
      registerGame(null);
      game.destroy(true);
      // Phaser leaves the canvas behind in some teardown orders; be explicit.
      host.replaceChildren();
    };
  }, [levelId]);

  return (
    <div className="game-stage">
      <div className="game-canvas" ref={hostRef} data-testid="game-canvas" />
    </div>
  );
}