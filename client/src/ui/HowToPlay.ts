import { icon } from './icons';
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
    icon: icon('flag'),
    title: 'Season Drift',
    tag: 'One track. Four seasons. Each one changes how you drive.',
    scene: `<div class="wheel4"><span class="c-s0">${icon('petal')}</span><span class="c-s1">${icon('sun')}</span><span class="c-s2">${icon('leaf')}</span><span class="c-s3">${icon('snow')}</span><b>${icon('car')}</b></div>`,
    points: [
      [icon('again'), 'One lap around a loop split into Spring → Summer → Autumn → Winter'],
      [icon('sparkle'), "Every season has its own rule: you can't drive them all the same way"],
      [icon('trophy'), 'Beat the bots, a friend on one screen, or up to 5 players online'],
    ],
  },
  {
    cls: 'c-spring',
    icon: icon('petal'),
    title: 'Spring · Petal Chain',
    tag: 'Fly through the petals in order. Every link makes you faster.',
    scene: lanes(`<i class="petal p1 c-s0">${icon('petal')}</i><i class="petal p2 c-s0">${icon('petal')}</i><i class="petal p3 c-s0">${icon('petal')}</i><i class="car zig">${icon('car')}</i><i class="chip-chain">x3 ${icon('bolt')}</i>`),
    points: [
      [icon('petal'), 'Each cluster sits in one lane, in a zig-zag: weave to collect them'],
      [icon('bolt'), 'Every link adds top speed (up to +30%) · miss one and the chain breaks'],
      [icon('drop'), 'Watch out: puddles make you aquaplane above 60% speed, mud slows you'],
    ],
  },
  {
    cls: 'c-summer',
    icon: icon('sun'),
    title: 'Summer · Cloud Hopping',
    tag: 'The sun overheats your engine. Clouds are your only shade.',
    scene: lanes(`<i class="cloud k1">${icon('cloud')}</i><i class="cloud k2">${icon('cloud')}</i><i class="shadow s1"></i><i class="shadow s2"></i><i class="car hop">${icon('car')}</i><i class="thermo"><i></i></i>`),
    points: [
      [icon('thermo'), 'In the sun your heat climbs fast: at 100% your car bursts into flames'],
      [icon('cloud'), 'Small clouds drift in a zig-zag: hop lanes from shadow to shadow'],
      [icon('stop'), 'In a shadow, brake for a moment: you only cool down while you are slow'],
    ],
  },
  {
    cls: 'c-autumn',
    icon: icon('leaf'),
    title: 'Autumn · Leaf Kick',
    tag: 'Tear through a leaf pile to blind whoever is behind you.',
    scene: lanes(`<i class="pile c-s2">${icon('leaf')}${icon('leaf')}${icon('leaf')}</i><i class="car lead">${icon('car')}</i><i class="car chase">${icon('car')}</i><i class="burst c-s2">${icon('leaf')}${icon('leaf')}${icon('leaf')}${icon('leaf')}</i>`),
    points: [
      [icon('leaf'), 'Leaf piles sit in single lanes: drive into one when someone is on your tail'],
      [icon('eyeOff'), 'Get kicked and your screen fills with leaves: change lanes to dodge'],
      [icon('wind'), 'Whirlwinds of leaves sweep the road and cover your screen: slip around them'],
      [icon('alert'), 'Branches fall from the trees: watch for the shadow and swerve'],
    ],
  },
  {
    cls: 'c-winter',
    icon: icon('snow'),
    title: 'Winter · Snow Load',
    tag: 'Snow piles on your car and slows it. Hit a ramp fast to jump and shake it off.',
    scene: lanes(`<i class="ramp-s"></i><i class="car jumper">${icon('car')}</i><i class="ball-s"></i><i class="flake f1">${icon('snow')}</i><i class="flake f2">${icon('snow')}</i><i class="flake f3">${icon('snow')}</i>`),
    points: [
      [icon('weight'), 'The more snow on your car, the slower and heavier it drives'],
      [icon('bolt'), 'Hit a snow ramp fast: the landing shakes the snow off. Too slow and it is just a bump'],
      [icon('snow'), 'Stay in the packed ruts down each lane: the fresh powder between them slows you down'],
      [icon('alert'), 'Giant snowballs roll across the road and blizzards cut your view · black ice slides'],
    ],
  },
  {
    cls: 'c-controls',
    icon: icon('pad'),
    title: 'Controls & Modes',
    tag: 'Pick a mode and race!',
    scene: `<div class="keys2"><div class="kg"><b></b><b>W</b><b></b><b>A</b><b>S</b><b>D</b><span>Player 1</span></div><div class="kg"><b></b><b>▲</b><b></b><b>◀</b><b>▼</b><b>▶</b><span>Player 2</span></div></div>`,
    points: [
      [icon('flag'), 'Solo: you vs 3 bots (Easy / Normal / Hard) · gamepads work too'],
      [icon('users'), 'One screen: split-screen, P1 on WASD, P2 on the arrow keys'],
      [icon('globe'), 'Online: create a room, everyone scans the QR code, up to 5 racers'],
      [icon('phone'), 'On a phone or tablet: on-screen gas, brake and steering · Settings lets you remap keys'],
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
        <button class="btn secondary small" data-a="prev">${icon('left')} Back</button>
        <button class="btn" data-a="next">Next ${icon('right')}</button>
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
    this.q('[data-a=next]').innerHTML = this.i === CARDS.length - 1 ? `${icon('flag')} Let's race!` : `Next ${icon('right')}`;
    this.q('[data-a=next]').focus();
  }
}
