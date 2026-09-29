import { INPUT_BUFFER_MS } from './config';
import type { Settings } from './types';

export type InputAction = 'left' | 'right' | 'fire' | 'pause' | 'start' | 'restart' | 'title';

const ACTION_KEYS: Record<InputAction, string[]> = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  fire: [' ', 'spacebar', 'z'],
  pause: ['escape', 'esc', 'p'],
  start: ['enter', 'return'],
  restart: ['r'],
  title: ['t']
};

const PREVENT_DEFAULT_KEYS = new Set([' ', 'spacebar', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);

export class InputManager {
  private readonly target: HTMLElement;
  private readonly onAutoPause: () => void;
  private readonly down = new Set<string>();
  private readonly pressedAt = new Map<InputAction, number>();
  private readonly listeners: Array<() => void> = [];
  private keyBindings: Settings['keyBindings'] = { left: '', right: '', fire: '', pause: '' };
  private gamepadDown = new Set<InputAction>();
  private gamepadAxis = 0;
  private lastGamepadPollAt = Number.NEGATIVE_INFINITY;

  constructor(target: HTMLElement, onAutoPause: () => void) {
    this.target = target;
    this.onAutoPause = onAutoPause;
    this.attach();
  }

  private attach(): void {
    const keydown = (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      const source = event.target instanceof HTMLElement ? event.target : null;
      const isEditable = source?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
      const isOverlayControl = source !== null && source.closest('#screen-overlay button, #screen-overlay input, #screen-overlay select, #screen-overlay textarea, #screen-overlay [contenteditable="true"]') !== null;
      if (isEditable || isOverlayControl) return;
      if (!isEditable && PREVENT_DEFAULT_KEYS.has(key)) event.preventDefault();
      const wasDown = this.down.has(key);
      this.down.add(key);
      if (!wasDown) {
        for (const [action, keys] of Object.entries(ACTION_KEYS) as Array<[InputAction, string[]]>) {
          const custom = this.keyBindings[action as keyof Settings['keyBindings']];
          if (keys.includes(key) || (custom !== undefined && custom !== '' && normalizeKey(custom) === key)) {
            this.pressedAt.set(action, performance.now());
          }
        }
      }
      this.target.focus({ preventScroll: true });
    };
    const keyup = (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      this.down.delete(key);
    };
    const blur = () => {
      this.clear();
      this.onAutoPause();
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') {
        this.clear();
        this.onAutoPause();
      }
    };

    window.addEventListener('keydown', keydown, { passive: false });
    window.addEventListener('keyup', keyup, { passive: true });
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    this.listeners.push(
      () => window.removeEventListener('keydown', keydown),
      () => window.removeEventListener('keyup', keyup),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', visibility),
    );
  }

  setKeyBindings(bindings: Settings['keyBindings']): void {
    this.keyBindings = { ...bindings };
  }

  clear(): void {
    this.down.clear();
    this.pressedAt.clear();
    this.gamepadDown.clear();
    this.gamepadAxis = 0;
  }

  isDown(action: InputAction): boolean {
    const custom = this.keyBindings[action as keyof Settings['keyBindings']];
    return ACTION_KEYS[action].some((key) => this.down.has(key)) ||
      (custom !== undefined && custom !== '' && this.down.has(normalizeKey(custom))) ||
      this.gamepadDown.has(action);
  }

  consume(action: InputAction): boolean {
    this.pollGamepad();
    const pressed = this.pressedAt.get(action);
    if (pressed === undefined) return false;
    this.pressedAt.delete(action);
    return performance.now() - pressed <= INPUT_BUFFER_MS;
  }

  horizontalAxis(): number {
    this.pollGamepad();
    const bufferedLeft = this.consume('left');
    const bufferedRight = this.consume('right');
    let axis = this.gamepadAxis;
    if (this.isDown('left') || bufferedLeft) axis -= 1;
    if (this.isDown('right') || bufferedRight) axis += 1;
    return Math.max(-1, Math.min(1, axis));
  }

  private pollGamepad(): void {
    const now = performance.now();
    if (now - this.lastGamepadPollAt < 8) return;
    this.lastGamepadPollAt = now;
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    for (const candidate of pads) {
      if (candidate?.connected) {
        pad = candidate;
        break;
      }
    }
    const nextDown = new Set<InputAction>();
    this.gamepadAxis = 0;
    if (pad) {
      const stick = pad.axes[0] ?? 0;
      if (Math.abs(stick) > 0.15) this.gamepadAxis = stick;
      if (pad.buttons[14]?.pressed) nextDown.add('left');
      if (pad.buttons[15]?.pressed) nextDown.add('right');
      if (pad.buttons[0]?.pressed) nextDown.add('fire');
      if (pad.buttons[9]?.pressed) nextDown.add('pause');
    }
    for (const action of nextDown) {
      if (!this.gamepadDown.has(action)) this.pressedAt.set(action, now);
    }
    this.gamepadDown = nextDown;
  }

  dispose(): void {
    for (const remove of this.listeners) remove();
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}
