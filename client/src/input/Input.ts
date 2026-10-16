// Keyboard + gamepad. Remapping UI comes in Phase 3; bindings are data already.

export type Action = 'accel' | 'brake' | 'left' | 'right' | 'item' | 'respawn' | 'pause';

const DEFAULT_KEYS: Record<Action, string[]> = {
  accel: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  item: ['ShiftLeft', 'ShiftRight'],
  respawn: ['KeyR'],
  pause: ['Escape'],
};

const STORAGE_KEY = 'fsr.keys';

export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  item: boolean;
  respawn: boolean;
  pause: boolean;
}

export class Input {
  private down = new Set<string>();
  private pressedOnce = new Set<Action>();
  keys: Record<Action, string[]>;

  constructor() {
    this.keys = loadKeys();
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) {
        for (const a of Object.keys(this.keys) as Action[]) if (this.keys[a].includes(e.code)) this.pressedOnce.add(a);
      }
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private held(a: Action): boolean {
    return this.keys[a].some((k) => this.down.has(k));
  }

  /** One-shot press, consumed on read. */
  private consume(a: Action): boolean {
    const had = this.pressedOnce.has(a);
    this.pressedOnce.delete(a);
    return had;
  }

  read(): InputState {
    let throttle = this.held('accel') ? 1 : 0;
    let brake = this.held('brake') ? 1 : 0;
    let steer = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let item = this.consume('item');
    let respawn = this.consume('respawn');
    let pause = this.consume('pause');

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, steer + ax));
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      item ||= !!pad.buttons[0]?.pressed;
      respawn ||= !!pad.buttons[3]?.pressed;
      pause ||= !!pad.buttons[9]?.pressed;
    }
    return { throttle, brake, steer, item, respawn, pause };
  }
}

function loadKeys(): Record<Action, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_KEYS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return structuredClone(DEFAULT_KEYS);
}
