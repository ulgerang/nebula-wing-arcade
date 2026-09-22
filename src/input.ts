import { INPUT_BUFFER_MS } from './config';

export type InputAction = 'left' | 'right' | 'fire' | 'pause' | 'start' | 'resume' | 'restart' | 'title';

const ACTION_KEYS: Record<InputAction, string[]> = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  fire: [' ', 'spacebar', 'z'],
  pause: ['escape', 'esc', 'p'],
  start: ['enter', 'return'],
  resume: ['enter', 'return'],
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
  private gamepadConnected = false;

  constructor(target: HTMLElement, onAutoPause: () => void) {
    this.target = target;
    this.onAutoPause = onAutoPause;
    this.attach();
  }

  private attach(): void {
    const keydown = (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      if (PREVENT_DEFAULT_KEYS.has(key)) event.preventDefault();
      const wasDown = this.down.has(key);
      this.down.add(key);
      if (!wasDown) {
        for (const [action, keys] of Object.entries(ACTION_KEYS) as Array<[InputAction, string[]]>) {
          if (keys.includes(key)) this.pressedAt.set(action, performance.now());
        }
      }
      this.target.focus({ preventScroll: true });
    };
    const keyup = (event: KeyboardEvent) => {
      const key = normalizeKey(event.key);
      this.down.delete(key);
    };
    const blur = () => this.onAutoPause();
    const visibility = () => {
      if (document.visibilityState !== 'visible') this.onAutoPause();
    };
    const gamepadConnected = () => {
      this.gamepadConnected = true;
    };
    const gamepadDisconnected = () => {
      this.gamepadConnected = false;
    };

    window.addEventListener('keydown', keydown, { passive: false });
    window.addEventListener('keyup', keyup, { passive: true });
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('gamepadconnected', gamepadConnected);
    window.addEventListener('gamepaddisconnected', gamepadDisconnected);
    this.listeners.push(
      () => window.removeEventListener('keydown', keydown),
      () => window.removeEventListener('keyup', keyup),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', visibility),
      () => window.removeEventListener('gamepadconnected', gamepadConnected),
      () => window.removeEventListener('gamepaddisconnected', gamepadDisconnected)
    );
  }

  isDown(action: InputAction): boolean {
    return ACTION_KEYS[action].some((key) => this.down.has(key));
  }

  consume(action: InputAction): boolean {
    const pressed = this.pressedAt.get(action);
    if (pressed === undefined) return false;
    this.pressedAt.delete(action);
    return performance.now() - pressed <= INPUT_BUFFER_MS;
  }

  horizontalAxis(): number {
    let axis = 0;
    if (this.isDown('left')) axis -= 1;
    if (this.isDown('right')) axis += 1;
    if (this.gamepadConnected) {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected);
      if (pad) {
        const stick = pad.axes[0] ?? 0;
        if (Math.abs(stick) > 0.15) axis = stick;
        if (pad.buttons[0]?.pressed) this.pressedAt.set('fire', performance.now());
        if (pad.buttons[9]?.pressed) this.pressedAt.set('pause', performance.now());
      }
    }
    return Math.max(-1, Math.min(1, axis));
  }

  dispose(): void {
    for (const remove of this.listeners) remove();
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}
