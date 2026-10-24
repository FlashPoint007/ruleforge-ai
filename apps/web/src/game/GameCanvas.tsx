import { useEffect, useRef } from "react";

import { createGame } from "@/game/createGame";

/**
 * Mounts Phaser only in a real browser. jsdom has no canvas or WebGL, so tests
 * must never reach this component's effect body.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const game = createGame(host);
    return () => {
      game.destroy(true);
    };
  }, []);

  return <div className="game-canvas" ref={hostRef} data-testid="game-canvas" />;
}
