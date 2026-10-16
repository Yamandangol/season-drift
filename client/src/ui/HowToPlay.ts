// "How to play": a short card deck shown on first launch (and from the menu).
// One card per idea: the game, each season's mechanic, controls & modes. Animated mini-scenes, little text.

interface Card {
  cls: string;
  icon: string;
  title: string;
  tag: string;
  scene: string;
  points: [string, string][];
}

const lanes = (inner: string) => `<div class="road"><i class="ln l1"></i><i class="ln l2"></i>${inner}</div>`;

const CARDS: Card[] = [
  {
    cls: 'c-intro',
    icon: '🏁',
    title: 'Season Drift',
    tag: 'One track. Four seasons. Each one changes how you drive.',
    scene: `<div class="wheel4"><span>🌱</span><span>☀️</span><span>🍂</span><span>❄️</span><b>🏎️</b></div>`,
    points: [
      ['🔁', 'One big lap through Spring → Summer → Autumn → Winter — first to the flag wins'],
      ['🧠', "Every season has its own rule: you can't drive them all the same way"],
      ['🪧', 'Watch for the picture signs before each season: they show its rule'],
      ['🏆', 'Beat the bots — or a friend, on one screen or two devices'],
    ],
  },
  {
    cls: 'c-spring',
    icon: '🌱',
    title: 'Spring · Petal Chain',
    tag: 'Fly through the petals in order. Every link makes you faster.',
    scene: lanes(`<i class="petal p1">🌸</i><i class="petal p2">🌸</i><i class="petal p3">🌸</i><i class="car zig">🏎️</i><i class="chip-chain">x3 ⚡</i>`),
    points: [
      ['🌸', 'Each cluster sits in one lane, in a zig-zag — weave to collect them'],
      ['⚡', 'Every link adds top speed (up to +30%) · miss one and the chain breaks'],
      ['🌊', 'Watch out: puddles make you aquaplane above 60% speed, mud slows you'],
    ],
  },
  {
    cls: 'c-summer',
    icon: '☀️',
    title: 'Summer · Cloud Hopping',
    tag: 'The sun overheats your engine. Clouds are your only shade.',
    scene: lanes(`<i class="cloud k1">☁️</i><i class="cloud k2">☁️</i><i class="shadow s1"></i><i class="shadow s2"></i><i class="car hop">🏎️</i><i class="thermo"><i></i></i>`),
    points: [
      ['🌡️', 'In the sun your heat climbs fast — 100% and your car bursts into flames'],
      ['☁️', 'Small clouds drift in a zig-zag: hop lanes from shadow to shadow'],
      ['🛑', 'In a shadow, brake for a moment — you only cool while you are slow'],
    ],
  },
  {
    cls: 'c-autumn',
    icon: '🍂',
    title: 'Autumn · Leaf Kick',
    tag: 'Tear through a leaf pile to blind whoever is behind you.',
    scene: lanes(`<i class="pile">🍂🍁🍂</i><i class="car lead">🏎️</i><i class="car chase">🚙</i><i class="burst">🍂🍁🍂🍁</i>`),
    points: [
      ['🍁', 'Leaf piles sit in single lanes — drive into one when someone is on your tail'],
      ['🙈', 'Get kicked and your screen fills with leaves: change lanes to dodge'],
      ['🌬️', 'Waves of blown leaves sweep the road — they cover your screen, so slip around them'],
      ['🌳', 'Branches fall from the trees — watch the shadow and swerve'],
    ],
  },
  {
    cls: 'c-winter',
    icon: '❄️',
    title: 'Winter · Snow Load',
    tag: 'Snow piles on your car and slows it. Stop on a heater to melt it off.',
    scene: lanes(`<i class="heater">🔥</i><i class="car park">🏎️</i><i class="snowcap">⛄</i><i class="flake f1">❄</i><i class="flake f2">❄</i><i class="flake f3">❄</i>`),
    points: [
      ['🐢', 'The more snow on your car, the slower and heavier it drives'],
      ['🔥', 'Stop on a glowing heater pad and hold still — driving over it does nothing'],
      ['🧊', 'Ice is glassy and slippery · the frozen lake is a shortcut, but go slow and it cracks'],
    ],
  },
  {
    cls: 'c-controls',
    icon: '🎮',
    title: 'Controls & Modes',
    tag: 'Pick a mode and race!',
    scene: `<div class="keys2"><div class="kg"><b></b><b>W</b><b></b><b>A</b><b>S</b><b>D</b><span>Player 1</span></div><div class="kg"><b></b><b>▲</b><b></b><b>◀</b><b>▼</b><b>▶</b><span>Player 2</span></div></div>`,
    points: [
      ['🏁', 'Solo: you vs 3 bots (Easy / Normal / Hard) · gamepads work too'],
      ['👥', 'One screen: split-screen, P1 on WASD, P2 on the arrow keys'],
      ['🌐', 'Two devices: create a room, share the 4-letter code, race over Wi-Fi'],
      ['📱', 'On a phone or tablet: on-screen GAS, BRAKE and steering buttons · M mutes sound'],
    ],
  },
];

export class HowToPlay {
  private el: HTMLDivElement;
  private i = 0;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen howto hidden';
    this.el.innerHTML = `
      <div class="ht-card"></div>
      <div class="ht-dots">${CARDS.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div>
      <div class="row">
        <button class="btn secondary small" data-a="prev">◀ Back</button>
        <button class="btn" data-a="next">Next ▶</button>
      </div>
      <button class="ht-skip" data-a="skip">Skip</button>`;
    parent.appendChild(this.el);
    this.q('[data-a=prev]').onclick = () => this.go(this.i - 1);
    this.q('[data-a=next]').onclick = () => (this.i >= CARDS.length - 1 ? this.close() : this.go(this.i + 1));
    this.q('[data-a=skip]').onclick = () => this.close();
    this.el.querySelectorAll<HTMLElement>('.ht-dots i').forEach((d) => (d.onclick = () => this.go(Number(d.dataset.k))));
    window.addEventListener('keydown', (e) => {
      if (this.el.classList.contains('hidden')) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.go(this.i + 1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.go(this.i - 1);
      else if (e.code === 'Escape') this.close();
      else return;
      e.stopPropagation();
    }, true);
  }

  private q(s: string) {
    return this.el.querySelector<HTMLButtonElement>(s)!;
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  open() {
    this.el.classList.remove('hidden');
    this.go(0);
  }

  close() {
    this.el.classList.add('hidden');
    try { localStorage.setItem('fsr.seenHowTo', '1'); } catch { /* ignore */ }
    this.onClose();
  }

  static seen(): boolean {
    try { return localStorage.getItem('fsr.seenHowTo') === '1'; } catch { return false; }
  }

  private go(k: number) {
    this.i = Math.max(0, Math.min(CARDS.length - 1, k));
    const c = CARDS[this.i];
    const card = this.el.querySelector<HTMLElement>('.ht-card')!;
    card.className = 'ht-card ' + c.cls;
    card.innerHTML = `
      <div class="ht-head"><span class="ht-icon">${c.icon}</span><div><div class="ht-title">${c.title}</div><div class="ht-tag">${c.tag}</div></div></div>
      <div class="ht-scene">${c.scene}</div>
      <ul class="ht-points">${c.points.map(([i, t]) => `<li><span>${i}</span>${t}</li>`).join('')}</ul>`;
    this.el.querySelectorAll<HTMLElement>('.ht-dots i').forEach((d, k2) => d.classList.toggle('on', k2 === this.i));
    this.q('[data-a=prev]').style.visibility = this.i === 0 ? 'hidden' : '';
    this.q('[data-a=next]').textContent = this.i === CARDS.length - 1 ? "🏁 Let's race!" : 'Next ▶';
    this.q('[data-a=next]').focus();
  }
}
