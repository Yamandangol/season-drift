// Settings: remappable controls for both players, accessibility, sound and graphics.
// Everything is saved in localStorage and applied live.

import { DRIVE_ACTIONS, keyLabel, type DriveAction, type Input } from '../input/Input';

export interface Prefs {
  colorBlind: boolean;
  reduceFlashes: boolean;
  nameTags: boolean;
  music: number; // 0..1
  sfx: number; // 0..1
  quality: 'high' | 'low';
}

const KEY = 'fsr.settings';
const DEFAULTS: Prefs = { colorBlind: false, reduceFlashes: false, nameTags: true, music: 0.8, sfx: 1, quality: 'high' };
const NAMES: Record<DriveAction, string> = { accel: 'Accelerate', brake: 'Brake / reverse', left: 'Steer left', right: 'Steer right' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export class Settings {
  private el: HTMLDivElement;
  prefs: Prefs = loadPrefs();
  onChange: (p: Prefs) => void = () => {};
  onClose: () => void = () => {};
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private capturing: { slot: 0 | 1; a: DriveAction; btn: HTMLButtonElement } | null = null;

  constructor(parent: HTMLElement, private input: Input) {
    this.el = document.createElement('div');
    this.el.className = 'screen settings hidden';
    this.el.innerHTML = `
      <div class="set-card">
        <div class="set-head"><span>⚙️</span><div class="set-title">Settings</div></div>
        <div class="set-tabs">
          <button class="set-tab on" data-tab="controls">🎮 Controls</button>
          <button class="set-tab" data-tab="access">♿ Accessibility</button>
          <button class="set-tab" data-tab="sound">🔊 Sound</button>
          <button class="set-tab" data-tab="gfx">✨ Graphics</button>
        </div>
        <div class="set-page" data-page="controls">
          <div class="bind-grid">
            <div></div><div class="bind-h p1">Player 1</div><div class="bind-h p2">Player 2</div>
            ${DRIVE_ACTIONS.map((a) => `<div class="bind-name">${NAMES[a]}</div><button class="bind" data-slot="0" data-a="${a}"></button><button class="bind" data-slot="1" data-a="${a}"></button>`).join('')}
          </div>
          <div class="set-note">Click a key, then press the new one (Esc cancels). In solo either player's keys drive. Gamepads and on-screen touch buttons always work.</div>
          <button class="btn secondary small" data-act="reset">↺ Reset keys</button>
        </div>
        <div class="set-page hidden" data-page="access">
          <label class="tgl"><input type="checkbox" data-p="colorBlind"><span></span><div><b>Colour-blind friendly</b><small>Every colour cue gets an icon or number too: markers over hazards and heaters, a blue→orange heat scale, name tags on all cars</small></div></label>
          <label class="tgl"><input type="checkbox" data-p="reduceFlashes"><span></span><div><b>Reduce flashes &amp; shake</b><small>No sun glare flashes, no camera shake, no speed lines</small></div></label>
          <label class="tgl"><input type="checkbox" data-p="nameTags"><span></span><div><b>Name tags over cars</b><small>See who's who at a glance</small></div></label>
          <div class="set-note">Bot difficulty (Easy / Normal / Hard) is on the main menu.</div>
        </div>
        <div class="set-page hidden" data-page="sound">
          <label class="sld"><b>🎵 Music</b><input type="range" min="0" max="1" step="0.05" data-p="music"></label>
          <label class="sld"><b>💥 Effects</b><input type="range" min="0" max="1" step="0.05" data-p="sfx"></label>
          <div class="set-note">All sound and music is made live in the browser. M mutes everything.</div>
        </div>
        <div class="set-page hidden" data-page="gfx">
          <div class="row"><button class="chip" data-q="high">✨ High (glow + colour grade)</button><button class="chip" data-q="low">⚡ Fast</button></div>
          <div class="set-note">The game switches to Fast by itself if your computer can't keep up.</div>
        </div>
        <button class="btn" data-act="close">✔ Done</button>
      </div>`;
    parent.appendChild(this.el);

    this.el.querySelectorAll<HTMLButtonElement>('.set-tab').forEach((t) => (t.onclick = () => this.tab(t.dataset.tab!)));
    this.el.querySelectorAll<HTMLButtonElement>('.bind').forEach((b) => (b.onclick = () => this.capture(b)));
    this.q('[data-act=reset]').onclick = () => { this.input.resetBinds(); this.refresh(); };
    this.q('[data-act=close]').onclick = () => this.close();
    this.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => {
      c.onchange = () => { (this.prefs as unknown as Record<string, boolean>)[c.dataset.p!] = c.checked; this.save(); };
    });
    this.el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => {
      r.oninput = () => { (this.prefs as unknown as Record<string, number>)[r.dataset.p!] = Number(r.value); this.save(); };
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => (b.onclick = () => { this.prefs.quality = b.dataset.q as Prefs['quality']; this.save(); this.refresh(); }));
    // keyboard inside settings must not drive / pause the game
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private q(s: string) {
    return this.el.querySelector<HTMLButtonElement>(s)!;
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  open() {
    this.el.classList.remove('hidden');
    this.refresh();
    this.q('[data-act=close]').focus();
  }

  close() {
    this.stopCapture();
    this.el.classList.add('hidden');
    this.onClose();
  }

  private tab(name: string) {
    this.el.querySelectorAll<HTMLElement>('.set-tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    this.el.querySelectorAll<HTMLElement>('.set-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== name));
  }

  private capture(btn: HTMLButtonElement) {
    this.stopCapture();
    const slot = Number(btn.dataset.slot) as 0 | 1;
    const a = btn.dataset.a as DriveAction;
    this.capturing = { slot, a, btn };
    btn.classList.add('wait');
    btn.textContent = 'press a key…';
    this.keyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') this.input.setBind(slot, a, e.code);
      this.stopCapture();
      this.refresh();
    };
    window.addEventListener('keydown', this.keyHandler, true); // capture phase: before the game sees it
  }

  private stopCapture() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
    this.keyHandler = null;
    if (this.capturing) this.capturing.btn.classList.remove('wait');
    this.capturing = null;
  }

  private refresh() {
    this.el.querySelectorAll<HTMLButtonElement>('.bind').forEach((b) => {
      b.textContent = keyLabel(this.input.binds[Number(b.dataset.slot) as 0 | 1][b.dataset.a as DriveAction]);
    });
    this.el.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => (c.checked = !!(this.prefs as unknown as Record<string, boolean>)[c.dataset.p!]));
    this.el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => (r.value = String((this.prefs as unknown as Record<string, number>)[r.dataset.p!])));
    this.el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === this.prefs.quality));
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
    this.onChange(this.prefs);
  }
}
