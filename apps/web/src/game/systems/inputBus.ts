/**
 * Touch input shared between the React overlay and the Phaser scene.
 *
 * Keeping it outside Phaser means the on-screen buttons are real DOM elements:
 * they style like the rest of the UI and they never depend on canvas hit areas.
 */

export interface TouchState {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export const touchState: TouchState = { left: false, right: false, jump: false };

type TouchKey = keyof TouchState;

export function setTouch(key: TouchKey, pressed: boolean): void {
  touchState[key] = pressed;
}

export function resetTouch(): void {
  touchState.left = false;
  touchState.right = false;
  touchState.jump = false;
}
