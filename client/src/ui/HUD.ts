import { SUN } from '@shared/clouds';
// Minimal, icon-based HUD. Plain DOM — cheap and crisp.

import { CAR, HEAT, TRACK } from '@shared/constants';
import type { Standing } from '../game/Race';
import { PALETTES } from '../render/palette';

const ORD = ['th', 'st', 'nd', 'rd'];
export function ordinal(n: number) {
  const v = n % 100;
  return n + (ORD[(v - 20) % 10] || ORD[v] || ORD[0]);
}
export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export class HUD {
  readonly root: HTMLDivElement;
  private pos: HTMLElement;
  private lap: HTMLElement;
  private time: HTMLElement;
  private speedNum: HTMLElement;
  private speedBar: HTMLElement;
  private heat: HTMLElement;
  private heatBar: HTMLElement;
  private heatHint!: HTMLElement;
  private heatRead!: HTMLElement;
  private strip!: HTMLElement;
  private stripDots!: HTMLElement;
  private dotEls: HTMLElement[] = [];
  private sailBox!: HTMLElement;
  private chainBox!: HTMLElement;
  private chainNum!: HTMLElement;
  private chainPct!: HTMLElement;
  private lastChain = 0;
  private toastEl!: HTMLElement;
  private snowBox!: HTMLElement;
  private snowBar!: HTMLElement;
  private snowPct!: HTMLElement;
  private sailBar!: HTMLElement;
  private boostKey!: HTMLElement;
  private season: HTMLElement;
  private count: HTMLElement;
  private gust: HTMLElement;
  private gustArrow: HTMLElement;
  private keys: HTMLElement;
  private grace: HTMLElement;
  private stall: HTMLElement;
  private aqua: HTMLElement;
  private crackEl!: HTMLElement;
  private lastCount = '';
  private lastPlace = 0;
  private lastSeason = -1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    // Season strip: the race as four coloured seasons, with every car as a dot
    this.strip = el('div', 'hud-strip', this.root);
    this.strip.innerHTML = `<div class="st-track">${['🌱', '☀️', '🍂', '❄️'].map((ic, i) => `<div class="st-seg s${i}"><span>${ic}</span></div>`).join('')}</div><div class="st-flag">🏁</div><div class="st-dots"></div>`;
    this.stripDots = this.strip.querySelector('.st-dots')!;
    const tl = el('div', 'hud-box hud-tl', this.root);
    this.pos = el('div', 'hud-pos', tl);
    const lapWrap = el('div', '', tl);
    this.lap = el('div', 'hud-lap', lapWrap);
    this.time = el('div', 'hud-time', lapWrap);

    const sp = el('div', 'hud-box hud-speed', this.root);
    // Round speedometer: an arc gauge with a pulsing engine in the middle.
    sp.classList.add('gauge');
    const gid = 'gGrad' + Math.random().toString(36).slice(2, 8); // unique: several HUDs exist (split-screen)
    sp.innerHTML = `
      <svg class="g-svg" viewBox="0 0 120 120">
        <defs><linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff5a36"/><stop offset=".45" stop-color="#ffd34d"/><stop offset="1" stop-color="#6ee7a8"/></linearGradient></defs>
        <circle class="g-track" cx="60" cy="60" r="50" pathLength="100"/>
        <circle class="g-arc" cx="60" cy="60" r="50" pathLength="100" stroke="url(#${gid})"/>
        ${Array.from({ length: 11 }, (_, k) => { const a = (135 + k * 27) * Math.PI / 180; return `<line class="g-tick" x1="${60 + Math.cos(a) * 40}" y1="${60 + Math.sin(a) * 40}" x2="${60 + Math.cos(a) * 44}" y2="${60 + Math.sin(a) * 44}"/>`; }).join('')}
        <line class="g-needle" x1="60" y1="60" x2="60" y2="22"/>
        <circle class="g-hub" cx="60" cy="60" r="4"/>
      </svg>
      <div class="g-center">
        <svg class="g-engine" viewBox="0 0 64 40"><path d="M10 14h6v-4h18v4h8l4 4h6v-4h6v18h-6v-4h-6l-4 4H18l-4-4h-4v4H4V14h6z" /></svg>
        <div class="num">0</div><div class="g-unit">km/h</div>
      </div>`;
    this.speedNum = sp.querySelector('.num')!;
    this.speedBar = sp;

    this.heat = el('div', 'hud-box hud-heat', this.root);
    // a glass thermometer: bulb + tube with ticks, mercury coloured by temperature, °C readout
    this.heat.insertAdjacentHTML('beforeend', `
      <div class="hud-thermo">
        <div class="th-bulb"><i></i><span class="th-flame">🔥</span></div>
        <div class="th-tube"><i class="th-merc"></i><div class="th-ticks">${'<b></b>'.repeat(9)}</div><div class="th-red"></div></div>
      </div>
      <div class="th-read"><span>20</span><small>°C</small></div>`);
    this.heatBar = this.heat.querySelector('.th-merc')!;
    this.heatRead = this.heat.querySelector('.th-read span')!;
    this.boostKey = el('div', 'boost-key hidden', this.heat, 'SPACE'); // boost retired
    this.heatHint = el('div', 'heat-hint', this.heat, '');

    this.sailBox = el('div', 'hud-box hud-sail', this.root);
    el('div', 'icon', this.sailBox, '⛵');
    this.sailBar = el('i', '', el('div', 'bar', this.sailBox));
    this.chainBox = el('div', 'hud-box hud-chain', this.root);
    el('div', 'icon', this.chainBox, '🌸');
    this.chainNum = el('div', 'chain-num', this.chainBox, 'x0');
    this.chainPct = el('div', 'chain-pct', this.chainBox, '');
    this.toastEl = el('div', 'hud-toast', this.root);
    this.snowBox = el('div', 'hud-box hud-snow', this.root);
    el('div', 'icon', this.snowBox, '❄️');
    this.snowBar = el('i', '', el('div', 'bar', this.snowBox));
    this.snowPct = el('div', 'snow-pct', this.snowBox, '');
    this.season = el('div', 'hud-season', this.root);
    this.count = el('div', 'hud-count hidden', this.root);
    this.gust = el('div', 'hud-gust', this.root);
    el('span', 'wind', this.gust, '🌬️');
    this.gustArrow = el('span', 'arrow', this.gust, '➜');
    this.grace = el('div', 'hud-box hud-grace hidden', this.root);
    this.stall = el('div', 'hud-stall hidden', this.root, '💨🔥');
    this.aqua = el('div', 'hud-aqua hidden', this.root, '🌊');
    this.crackEl = el('div', 'hud-crack', this.root);

    // Key prompts — icons only, first seconds of a race.
    this.keys = el('div', 'hud-keys', this.root);
    const drive = el('div', 'keygroup', this.keys);
    for (const k of ['', 'W', '', 'A', 'S', 'D']) el('div', k ? 'key' : 'key empty', drive, k);
    const arrows = el('div', 'keygroup', this.keys);
    for (const k of ['', '▲', '', '◀', '▼', '▶']) el('div', k ? 'key' : 'key empty', arrows, k);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setCountdown(secondsToGo: number) {
    let text = '';
    if (secondsToGo > 0) text = String(Math.ceil(secondsToGo));
    else if (secondsToGo > -0.8) text = 'GO';
    if (text !== this.lastCount) {
      this.lastCount = text;
      this.count.textContent = text;
      this.count.classList.toggle('hidden', !text);
      this.count.classList.toggle('go', text === 'GO');
      this.count.dataset.n = text;
      this.count.classList.remove('tick');
      void this.count.offsetWidth; // restart the pop animation
      this.count.classList.add('tick');
    }
  }

  /** which key prompts to show: both (solo), WASD only (P1) or arrows only (P2) */
  /** show the player's current key bindings on the key prompts */
  setKeyLabels(binds: { accel: string; brake: string; left: string; right: string }[], label: (c: string) => string) {
    (Array.from(this.keys.children) as HTMLElement[]).forEach((g, i) => {
      const b = binds[i];
      if (!b) return;
      const k = g.children as HTMLCollectionOf<HTMLElement>;
      k[1].textContent = label(b.accel);
      k[3].textContent = label(b.left);
      k[4].textContent = label(b.brake);
      k[5].textContent = label(b.right);
    });
  }

  setKeySet(set: 'both' | 'wasd' | 'arrows') {
    const [a, b] = Array.from(this.keys.children) as HTMLElement[];
    a.style.display = set === 'arrows' ? 'none' : '';
    b.style.display = set === 'wasd' ? 'none' : '';
  }

  /** small player tag (P1 / P2) in the top-right corner; '' hides it */
  setTag(text: string, color = '#000') {
    this.tag ??= el('div', 'hud-tag', this.root);
    this.tag.textContent = text;
    this.tag.style.display = text ? '' : 'none';
    this.tag.style.background = color;
  }
  private tag?: HTMLElement;

  /** dots on the season strip: p = 0..1 race progress, offset = sector of spring (seasons may rotate) */
  setStrip(items: { p: number; color: string; me: boolean }[], season: number) {
    while (this.dotEls.length < items.length) this.dotEls.push(el('i', 'st-dot', this.stripDots));
    this.dotEls.forEach((d, i) => {
      const it = items[i];
      d.style.display = it ? '' : 'none';
      if (!it) return;
      d.style.left = `${(Math.max(0, Math.min(1, it.p)) * 100).toFixed(2)}%`;
      d.style.background = it.color;
      d.classList.toggle('me', it.me);
    });
    this.strip.querySelectorAll('.st-seg').forEach((s, i) => s.classList.toggle('now', i === season));
  }

  showKeys(on: boolean) {
    this.keys.style.opacity = on ? '1' : '0';
  }

  popSeason(idx: number) {
    if (idx === this.lastSeason) return;
    this.lastSeason = idx;
    const NAMES = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'START'];
    const TIPS = ['🌸 chain the petals', '☁️ brake in a cloud to cool', '🍂 kick leaves back', '🔥 stop on heaters', ''];
    this.season.innerHTML = `<span class="s-icon">${PALETTES[idx].icon}</span><span class="s-name s${idx}">${NAMES[idx]}</span><span class="s-tip">${TIPS[idx]}</span>`;
    this.season.classList.remove('pop');
    void this.season.offsetWidth; // restart animation
    this.season.classList.add('pop');
  }

  /** short centre-screen message (e.g. "🍂 BLINDED!") */
  toast(text: string, cls = '') {
    this.toastEl.textContent = text;
    this.toastEl.className = 'hud-toast show ' + cls;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 900);
  }
  private toastTimer = 0;

  resetSeason(idx: number) {
    this.lastSeason = idx;
  }

  update(o: {
    place: number;
    total: number;
    lap: number;
    lapTime: number;
    /** 0..1 of the race distance */
    progress?: number;
    speed: number;
    heat: number;
    showHeat: boolean;
    stalled: boolean;
    aquaplaning: boolean;
    boosting: boolean;
    crack: number;
    snow: number;
    pad?: number;
    shaded: boolean;
    gustWarn: number;
    gustActive: boolean;
    gustAngle: number;
    sail: number;
    chain?: number;
    showChain?: boolean;
    grace: number;
  }) {
    if (o.place !== this.lastPlace) {
      if (this.lastPlace > 0) {
        this.pos.classList.remove('up', 'down');
        void this.pos.offsetWidth;
        this.pos.classList.add(o.place < this.lastPlace ? 'up' : 'down');
      }
      this.lastPlace = o.place;
    }
    this.pos.innerHTML = `${ordinal(o.place).replace(/(\d+)(\D+)/, '$1<small>$2</small>')}<small>/${o.total}</small>`;
    this.lap.innerHTML = TRACK.laps === 1
      ? `<span class="flag">🏁</span>${Math.round(Math.max(0, Math.min(1, o.progress ?? 0)) * 100)}%`
      : `<span class="flag">🏁</span>${Math.max(1, Math.min(TRACK.laps, o.lap))}/${TRACK.laps}`;
    this.time.textContent = fmtTime(Math.max(0, o.lapTime));
    const sp = Math.abs(o.speed);
    this.speedNum.textContent = String(Math.round(sp * 3.6)); // "km/h"-ish
    {
      const f = Math.min(1.25, sp / CAR.maxSpeed);
      const g = Math.min(1, f / 1.25);
      this.speedBar.style.setProperty('--f', String(g));
      (this.speedBar.querySelector('.g-arc') as SVGElement).style.strokeDasharray = `${(g * 75).toFixed(2)} 100`;
      this.speedBar.classList.toggle('redline', f > 1.02);
    }

    this.heat.style.opacity = o.showHeat || o.stalled ? '1' : '0';
    // heat is ammo: show the boost key once there's enough to spend; glow at the red line
    this.boostKey.classList.toggle('ready', o.heat >= 15 && !o.stalled && !o.boosting);
    this.boostKey.classList.toggle('red', o.heat >= 80 && !o.stalled && !o.boosting);
    this.heat.classList.toggle('boosting', o.boosting);
    {
      const h = Math.max(0, Math.min(100, o.heat));
      this.heatBar.style.width = `${h}%`;
      // blue (cool) → yellow → orange → red (about to blow)
      const hue = h < 50 ? 200 - h * 3.0 : 50 - (h - 50);
      const cb = document.body.classList.contains('cb'); // colour-blind safe: blue → orange → white-hot
      const tc = o.stalled ? 'hsl(8 95% 52%)' : cb ? (h < 50 ? `hsl(${215 - h * 0.4} 85% ${55 + h * 0.2}%)` : `hsl(30 100% ${55 + Math.max(0, h - 75) * 1.6}%)`) : `hsl(${Math.max(0, hue)} 90% ${h < 50 ? 60 : 55}%)`;
      this.heat.style.setProperty('--tc', tc);
      this.heat.style.setProperty('--th', String(h / 100));
      this.heatRead.textContent = o.stalled ? '🔥' : String(Math.round(20 + h));
    }
    this.heat.classList.toggle('warn', o.heat >= HEAT.warn && !o.stalled);
    this.heat.classList.toggle('stalled', o.stalled);
    this.stall.classList.toggle('hidden', !o.stalled);
    this.aqua.classList.toggle('hidden', !o.aquaplaning);
    // thin ice: cracks creep in from the screen edges as the ice gives way
    this.crackEl.style.opacity = String(Math.min(1, o.crack * 1.3));
    this.crackEl.classList.toggle('bad', o.crack > 0.6);

    this.gust.style.opacity = String(o.gustActive ? 1 : o.gustWarn);
    this.sailBox.style.opacity = o.sail >= 0 ? '1' : '0';
    this.snowBox.style.opacity = o.snow >= 0 ? '1' : '0';
    if (o.snow >= 0) {
      this.snowBar.style.width = `${o.snow * 100}%`;
      this.snowPct.textContent = o.pad === 2 ? '🔥 HOLD STILL' : o.pad === 1 ? '🔥 STOP HERE!' : o.snow > 0.02 ? `-${Math.round(o.snow * 65)}% 🐢` : '';
    }
    this.snowBox.classList.toggle('heavy', o.snow > 0.6);
    this.heat.classList.toggle('shaded', o.shaded);
    // summer coaching: shade only cools you while you're slow
    const hint = o.stalled ? '🔥 BURNT OUT' : o.shaded && o.heat > 3 ? (Math.abs(o.speed) < SUN.coolSpeed ? '❄️ cooling' : '🛑 brake to cool') : o.heat >= HEAT.warn ? '☁️ find a cloud!' : '';
    if (this.heatHint.textContent !== hint) {
      this.heatHint.textContent = hint;
      this.heatHint.className = 'heat-hint' + (hint ? ' on' : '') + (hint.includes('brake') ? ' brake' : hint.includes('cooling') ? ' cool' : '');
    }
    if (o.sail >= 0) {
      const f = Math.min(1, o.sail / 1.1);
      this.sailBar.style.width = `${f * 100}%`;
      this.sailBar.style.background = f > 0.75 ? '#6ee7a8' : f > 0.4 ? '#ffd34d' : '#ff6a4a';
      this.sailBox.classList.toggle('luff', f < 0.25);
    }
    {
      const c = o.chain ?? 0;
      this.chainBox.style.opacity = o.showChain || c > 0 ? '1' : '0';
      this.chainNum.textContent = `x${c}`;
      this.chainPct.textContent = c > 0 ? `+${Math.round(Math.min(c, 12) * 2.5)}% ⚡${o.showHeat ? ' · 🔥 runs hot' : ''}` : '';
      this.chainBox.classList.toggle('carry', !!o.showHeat);
      if (c > this.lastChain) { this.chainBox.classList.remove('pop'); void this.chainBox.offsetWidth; this.chainBox.classList.add('pop'); }
      this.chainBox.classList.toggle('broken', c === 0 && this.lastChain > 1);
      this.lastChain = c;
    }
    this.gust.classList.toggle('active', o.gustActive);
    this.gustArrow.style.transform = `rotate(${o.gustAngle}rad)`;

    this.grace.classList.toggle('hidden', o.grace < 0);
    if (o.grace >= 0) this.grace.textContent = `⏱ ${Math.ceil(o.grace)}`;
  }
}

/** Results table HTML. */
export function resultsHtml(standings: Standing[], meId?: string) {
  const rows = standings
    .map((s) => {
      const color = '#' + s.color.toString(16).padStart(6, '0');
      const best = s.lapTimes.length ? Math.min(...s.lapTimes) : 0;
      const medal = ['🥇', '🥈', '🥉'][s.place - 1] ?? ordinal(s.place);
      return `<tr class="${s.id === meId ? 'me' : ''}" style="animation-delay:${0.15 + s.place * 0.12}s">
        <td class="place">${medal}</td>
        <td><span class="swatch" style="background:${color}"></span>${s.name}</td>
        <td class="t">${s.finished ? fmtTime(s.totalTime) : '—'}</td>
        <td class="t" title="best lap">${best ? '⚡ ' + fmtTime(best) : ''}</td>
      </tr>`;
    })
    .join('');
  return `<table>${rows}</table>`;
}
