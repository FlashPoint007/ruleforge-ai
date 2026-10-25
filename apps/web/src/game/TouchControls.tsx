import { useCallback } from "react";

import { resetTouch, setTouch } from "@/game/systems/inputBus";

/**
 * On-screen controls for touch devices.
 *
 * They are real DOM buttons rather than canvas objects so they stay accessible,
 * scale with the layout, and never depend on canvas hit-testing. Pointer events
 * are used instead of click so a held button keeps the character running.
 */
export function TouchControls() {
  const press = useCallback((key: "left" | "right" | "jump", pressed: boolean) => {
    setTouch(key, pressed);
  }, []);

  const bind = (key: "left" | "right" | "jump") => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      press(key, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      press(key, false);
    },
    onPointerCancel: () => press(key, false),
    onPointerLeave: () => press(key, false),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <div className="touch-controls" aria-label="触屏操作">
      <div className="touch-controls__cluster">
        <button type="button" className="touch-controls__button" aria-label="向左" {...bind("left")}>
          ◀
        </button>
        <button type="button" className="touch-controls__button" aria-label="向右" {...bind("right")}>
          ▶
        </button>
      </div>
      <button
        type="button"
        className="touch-controls__button touch-controls__button--jump"
        aria-label="跳跃"
        {...bind("jump")}
      >
        跳
      </button>
      <button
        type="button"
        className="touch-controls__reset"
        aria-label="重置触屏输入"
        onClick={() => resetTouch()}
      >
        复位
      </button>
    </div>
  );
}
