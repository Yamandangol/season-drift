// Keyboard + gamepad. Remapping UI comes in Phase 3; bindings are data already.

export type Action = 'accel' | 'brake' | 'left' | 'right' | 'item' | 'respawn' | 'pause';

/** Remappable driving actions, per player. */
export type DriveAction = 'accel' | 'brake' | 'left' | 'right';
export const DRIVE_ACTIONS: DriveAction[] = ['accel', 'brake', 'left', 'right'];
export type KeyMap = Record<DriveAction, string>;

export const DEFAULT_BINDS: [KeyMap, KeyMap] = [
  { accel: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD' },
  { accel: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
];
const FIXED: Record<'item' | 'respawn' | 'pause', string[]> = { item: ['Space', 'ShiftLeft', 'ShiftRight'], respawn: [], pause: ['Escape'] };

const STORAGE_KEY = 'fsr.binds';

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
  private padPrev: boolean[] = [];
  binds: [KeyMap, KeyMap];
  /** on-screen touch buttons (phones / tablets) */
  private touch = { left: false, right: false, gas: false, brake: false };
  private touchPause = false;
  private touchEl: HTMLDivElement | null = null;
  /** used by the settings screen to capture a key */
  onAnyKey: ((e: KeyboardEvent) => void) | null = null;
  readonly isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

  constructor() {
    this.binds = loadBinds();
    if (this.isTouch) this.buildTouch();
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) {
        for (const a of Object.keys(FIXED) as (keyof typeof FIXED)[]) if (FIXED[a].includes(e.code)) this.pressedOnce.add(a);
      }
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.onAnyKey?.(e);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private buildTouch() {
    const el = document.createElement('div');
    el.className = 'touch-ui hidden';
    el.innerHTML = `
      <div class="tc-left"><button data-k="left">◀</button><button data-k="right">▶</button></div>
      <div class="tc-right"><button data-k="brake" class="tc-brake">BRAKE</button><button data-k="gas" class="tc-gas">GAS</button></div>
      <button class="tc-pause" data-k="pause">⏸</button>`;
    document.body.appendChild(el);
    el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const k = b.dataset.k as keyof typeof this.touch | 'pause';
      const set = (on: boolean) => {
        if (k === 'pause') { if (on) this.touchPause = true; return; }
        this.touch[k] = on;
        b.classList.toggle('on', on);
      };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic event */ } set(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.touchEl = el;
  }

  /** show the on-screen controls (touch devices only) */
  showTouch(on: boolean) {
    if (!this.touchEl) return;
    this.touchEl.classList.toggle('hidden', !on);
    if (!on) for (const k of Object.keys(this.touch) as (keyof typeof this.touch)[]) this.touch[k] = false;
  }

  /** slot undefined: either player's keys (solo); slot 0 / 1: that player's keys only */
  private held(a: DriveAction, slot?: number): boolean {
    if (slot === undefined) return this.down.has(this.binds[0][a]) || this.down.has(this.binds[1][a]);
    return this.down.has(this.binds[slot][a]);
  }

  setBind(slot: 0 | 1, a: DriveAction, code: string) {
    // a key can only do one job: unbind it anywhere else first
    for (const sl of [0, 1] as const) for (const b of DRIVE_ACTIONS) if (this.binds[sl][b] === code) this.binds[sl][b] = '';
    this.binds[slot][a] = code;
    this.saveBinds();
  }

  resetBinds() {
    this.binds = structuredClone(DEFAULT_BINDS);
    this.saveBinds();
  }

  private saveBinds() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.binds)); } catch { /* ignore */ }
  }

  /** One-shot press, consumed on read. */
  private consume(a: Action): boolean {
    const had = this.pressedOnce.has(a);
    this.pressedOnce.delete(a);
    return had;
  }

  /**
   * @param slot undefined = single player (all keys, first gamepad);
   *             0 = player 1 (WASD, gamepad 1); 1 = player 2 (arrows, gamepad 2)
   */
  read(slot?: number): InputState {
    let throttle = this.held('accel', slot) ? 1 : 0;
    let brake = this.held('brake', slot) ? 1 : 0;
    let steer = (this.held('right', slot) ? 1 : 0) - (this.held('left', slot) ? 1 : 0);
    let item = slot === 1 ? false : this.consume('item');
    let respawn = slot === 1 ? false : this.consume('respawn');
    let pause = slot === 1 ? false : this.consume('pause');
    if (slot !== 1 && this.touchEl) {
      if (this.touch.gas) throttle = 1;
      if (this.touch.brake) brake = 1;
      steer += (this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0);
      steer = Math.max(-1, Math.min(1, steer));
      if (this.touchPause) { pause = true; this.touchPause = false; }
    }

    const pads = (navigator.getGamepads?.() ?? []).filter((p) => p && p.connected);
    const pad = pads[slot ?? 0];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, steer + ax));
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      // one-shot buttons fire on the press edge only
      const edge = (i: number) => !!pad.buttons[i]?.pressed && !this.padPrev[i];
      item ||= edge(0);
      pause ||= edge(9);
      if (slot !== 1) this.padPrev = pad.buttons.map((b) => b.pressed);
    }
    return { throttle, brake, steer, item, respawn, pause };
  }
}

function loadBinds(): [KeyMap, KeyMap] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const b = JSON.parse(raw) as [KeyMap, KeyMap];
      return [{ ...DEFAULT_BINDS[0], ...b[0] }, { ...DEFAULT_BINDS[1], ...b[1] }];
    }
  } catch {
    /* storage unavailable */
  }
  return structuredClone(DEFAULT_BINDS);
}

/** 'KeyW' → 'W', 'ArrowUp' → '▲' */
export function keyLabel(code: string): string {
  if (!code) return '—';
  const arrows: Record<string, string> = { ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶' };
  if (arrows[code]) return arrows[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code.replace('Left', ' L').replace('Right', ' R');
}
