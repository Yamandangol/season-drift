// Main menu + results screen. Real <button>s so keyboard (Tab/Enter) works out of the box.

import type { Difficulty } from '@shared/constants';
import type { Standing } from '../game/Race';
import { resultsHtml } from './HUD';
import { icon } from './icons';
import { qrcode } from '../vendor/qrcode.js';
import { PLAYER_COLORS } from '../game/CarMesh';

/** cars per online race (humans + bots) */
export const MAX_RACERS = 5;
/** bot names by seat, matching the server */
const BOT_SEATS = ['Blossom', 'Sunny', 'Maple', 'Frost', 'Bramble'];
const colorHex = (i: number) => '#' + PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Draw a QR code for text onto a canvas (crisp: whole pixels per module, white quiet zone). */
function drawQr(canvas: HTMLCanvasElement, text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const cell = Math.max(4, Math.floor(600 / (n + quiet * 2)));
  const size = (n + quiet * 2) * cell;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#111622';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
}

export interface MenuHandlers {
  onSolo: (difficulty: Difficulty) => void;
  onSplit: (difficulty: Difficulty) => void;
  onHowTo: () => void;
  onSettings: () => void;
  onOnlineCreate: (name: string) => void;
  onOnlineJoin: (code: string, name: string) => void;
  onOnlineStart: (difficulty: Difficulty) => void;
  onOnlineBack: () => void;
  onRematch: () => void;
  onMenu: () => void;
  onResume: () => void;
}

const DIFF_KEY = 'fsr.difficulty';

export class Menu {
  private main: HTMLDivElement;
  private results: HTMLDivElement;
  private resultsBody: HTMLDivElement;
  private pause!: HTMLDivElement;
  difficulty: Difficulty = 'normal';

  constructor(parent: HTMLElement, private h: MenuHandlers) {
    try {
      const d = localStorage.getItem(DIFF_KEY);
      if (d === 'easy' || d === 'normal' || d === 'hard') this.difficulty = d;
    } catch { /* ignore */ }

    this.main = document.createElement('div');
    this.main.className = 'screen main-menu';
    this.main.innerHTML = `
      <div class="mm-left">
        <div class="title"><span class="tt">Season<br>Drift</span><span class="seasons"><span class="c-s0">${icon('petal')}</span><span class="c-s1">${icon('sun')}</span><span class="c-s2">${icon('leaf')}</span><span class="c-s3">${icon('snow')}</span></span></div>
        <div class="mm-tag">One lap. Four seasons. Every season changes how you drive.</div>
        <button class="btn mm-btn" data-a="solo"><i>${icon('flag')}</i><span>Play Solo<small>you vs 3 bots</small></span></button>
        <button class="btn mm-btn" data-a="split"><i>${icon('users')}</i><span>2 Players · one screen<small>split screen · WASD + arrows</small></span></button>
        <button class="btn secondary mm-btn" data-a="online"><i>${icon('globe')}</i><span>Online · up to 5 players<small>scan a QR code to join · bots fill empty seats</small></span></button>
        <div class="row menu-row"><button class="btn secondary small" data-a="howto">${icon('book')} How to play</button><button class="btn secondary small" data-a="settings">${icon('gear')} Settings</button></div>
        <div class="mm-diff"><span class="label">Bots</span>
          <div class="row" data-a="diff">
            <button class="chip" data-d="easy">Easy</button>
            <button class="chip" data-d="normal">Normal</button>
            <button class="chip" data-d="hard">Hard</button>
          </div>
        </div>
      </div>
      <div class="mm-right">
        <div class="mm-card s0"><i>${icon('petal')}</i><div><b>Spring · Petal Chain</b><span>Weave through the petals in order — every link is more speed.</span></div></div>
        <div class="mm-card s1"><i>${icon('cloud')}</i><div><b>Summer · Cloud Hopping</b><span>The sun cooks your engine. Brake in a cloud's shadow to cool.</span></div></div>
        <div class="mm-card s2"><i>${icon('leaf')}</i><div><b>Autumn · Leaf Kick</b><span>Rip through leaf piles to blind whoever is behind you.</span></div></div>
        <div class="mm-card s3"><i>${icon('snow')}</i><div><b>Winter · Snow Load</b><span>Snow piles on and slows you. Jump a ramp to shake it off; stay in the ruts.</span></div></div>
        <div class="mm-foot">ThunderHacks 2026 · Algoma Game Jam</div>
      </div>`;
    parent.appendChild(this.main);
    this.main.querySelector<HTMLButtonElement>('[data-a=solo]')!.onclick = () => this.h.onSolo(this.difficulty);
    this.main.querySelector<HTMLButtonElement>('[data-a=split]')!.onclick = () => this.h.onSplit(this.difficulty);
    this.main.querySelector<HTMLButtonElement>('[data-a=online]')!.onclick = () => this.showOnline();
    this.main.querySelector<HTMLButtonElement>('[data-a=howto]')!.onclick = () => this.h.onHowTo();
    this.main.querySelector<HTMLButtonElement>('[data-a=settings]')!.onclick = () => this.h.onSettings();
    this.main.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
      b.onclick = () => this.setDifficulty(b.dataset.d as Difficulty);
    });
    this.setDifficulty(this.difficulty);

    this.results = document.createElement('div');
    this.results.className = 'screen hidden';
    this.results.innerHTML = `
      <div class="title res-title">Results</div>
      <div class="results"></div>
      <div class="row">
        <button class="btn" data-a="rematch">Rematch</button>
        <button class="btn secondary" data-a="menu">Menu</button>
      </div>`;
    parent.appendChild(this.results);
    this.resultsBody = this.results.querySelector('.results')!;
    this.results.querySelector<HTMLButtonElement>('[data-a=rematch]')!.onclick = () => this.h.onRematch();
    this.results.querySelector<HTMLButtonElement>('[data-a=menu]')!.onclick = () => this.h.onMenu();
    this.buildPause(parent);
    this.buildOnline(parent);
  }

  private online!: HTMLDivElement;
  private qrBig!: HTMLDivElement;
  private joinUrl = '';
  private buildOnline(parent: HTMLElement) {
    this.online = document.createElement('div');
    this.online.className = 'screen online hidden';
    this.online.innerHTML = `
      <div class="title online-title">${icon('globe')} Online race</div>
      <div class="online-sub">Up to 5 players on their own phones or laptops. Empty seats are filled with bots.</div>
      <div class="online-form">
        <input class="field" data-f="name" maxlength="14" placeholder="Your name" autocomplete="nickname">
        <button class="btn" data-a="create">${icon('plus')} Create room</button>
        <div class="or">or join one</div>
        <div class="row join-row"><input class="field code" data-f="code" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off"><button class="btn secondary small" data-a="join">${icon('play')} Join</button></div>
      </div>
      <div class="lobby hidden">
        <div class="qr-box" data-a="qr" title="Show big for the room">
          <canvas class="qr"></canvas>
          <div class="qr-cap">${icon('phone')} Scan to join</div>
          <div class="qr-url"></div>
          <div class="qr-note"></div>
        </div>
        <div class="lobby-side">
          <div class="label">Room code</div>
          <div class="room-code"></div>
          <div class="lobby-count"></div>
          <div class="lobby-players"></div>
          <div class="lobby-diff"><span class="label">Bots</span>
            <div class="row">
              <button class="chip" data-d="easy">Easy</button>
              <button class="chip" data-d="normal">Normal</button>
              <button class="chip" data-d="hard">Hard</button>
            </div>
          </div>
          <button class="btn" data-a="start">${icon('flag')} Start race</button>
          <div class="lobby-wait">Waiting for the host to start…</div>
        </div>
      </div>
      <div class="online-msg"></div>
      <button class="btn secondary small" data-a="back">${icon('back')} Leave</button>`;
    parent.appendChild(this.online);

    // full-screen QR for the projector: click the small one to open, click anywhere to close
    this.qrBig = document.createElement('div');
    this.qrBig.className = 'qr-big hidden';
    this.qrBig.innerHTML = `<div class="qb-card"><div class="qb-title">${icon('phone')} Scan to race</div><canvas class="qr"></canvas><div class="qb-code"></div><div class="qb-url"></div><div class="qb-hint">click anywhere to close</div></div>`;
    this.qrBig.onclick = () => this.qrBig.classList.add('hidden');
    parent.appendChild(this.qrBig);

    const q = <T extends HTMLElement>(s: string) => this.online.querySelector<T>(s)!;
    const name = () => q<HTMLInputElement>('[data-f=name]').value.trim() || 'Player';
    try { q<HTMLInputElement>('[data-f=name]').value = localStorage.getItem('fsr.name') ?? ''; } catch { /* ignore */ }
    const saveName = () => { try { localStorage.setItem('fsr.name', name()); } catch { /* ignore */ } };
    q<HTMLButtonElement>('[data-a=create]').onclick = () => { saveName(); this.onlineMsg('Creating room…'); this.h.onOnlineCreate(name()); };
    const join = () => {
      const code = q<HTMLInputElement>('[data-f=code]').value.trim().toUpperCase();
      if (code.length !== 4) return this.onlineMsg('Enter the 4-letter room code');
      saveName();
      this.onlineMsg('Joining…');
      this.h.onOnlineJoin(code, name());
    };
    q<HTMLButtonElement>('[data-a=join]').onclick = join;
    q<HTMLInputElement>('[data-f=code]').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    q<HTMLInputElement>('[data-f=name]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.online.classList.contains('joining') ? join() : q<HTMLButtonElement>('[data-a=create]').click());
    });
    q<HTMLButtonElement>('[data-a=start]').onclick = () => this.h.onOnlineStart(this.difficulty);
    q<HTMLButtonElement>('[data-a=back]').onclick = () => this.h.onOnlineBack();
    q<HTMLElement>('[data-a=qr]').onclick = () => this.showBigQr();
    this.online.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => (b.onclick = () => this.setDifficulty(b.dataset.d as Difficulty)));
    this.setDifficulty(this.difficulty);
    // typing in the fields must not drive the car / pause
    this.online.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  /** @param joinCode prefilled from a scanned QR link: the form becomes a one-tap "join this room" */
  showOnline(joinCode?: string) {
    this.hideAll();
    this.online.classList.remove('hidden');
    this.online.classList.toggle('joining', !!joinCode);
    this.online.querySelector<HTMLElement>('.online-form')!.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.lobby')!.classList.add('hidden');
    const codeEl = this.online.querySelector<HTMLInputElement>('[data-f=code]')!;
    if (joinCode) codeEl.value = joinCode.toUpperCase().slice(0, 4);
    this.onlineMsg(joinCode ? `Type your name and tap Join to enter room ${codeEl.value}.` : 'Create a room, then everyone scans its QR code or types the code.');
    const nameEl = this.online.querySelector<HTMLInputElement>('[data-f=name]')!;
    if (!nameEl.value) nameEl.focus();
  }

  onlineMsg(text: string) {
    this.online.querySelector<HTMLElement>('.online-msg')!.textContent = text;
  }

  /** the address phones should open to join (drawn as a QR code in the lobby) */
  setJoinUrl(url: string) {
    this.joinUrl = url;
    for (const c of [this.online.querySelector<HTMLCanvasElement>('canvas.qr')!, this.qrBig.querySelector<HTMLCanvasElement>('canvas.qr')!]) drawQr(c, url);
    const pretty = url.replace(/^https?:\/\//, '');
    this.online.querySelector<HTMLElement>('.qr-url')!.textContent = pretty;
    this.qrBig.querySelector<HTMLElement>('.qb-url')!.textContent = pretty;
    // a private Wi-Fi address only works for phones on the same Wi-Fi
    const lan = /^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(url);
    this.online.querySelector<HTMLElement>('.qr-note')!.textContent = lan ? 'Same Wi-Fi only. For mobile data, start the game with npm run share' : '';
  }

  showBigQr() {
    if (!this.joinUrl) return;
    this.qrBig.classList.remove('hidden');
  }

  showLobby(code: string, players: { name: string; host: boolean; me: boolean }[], amHost: boolean) {
    this.hideAll();
    this.online.classList.remove('hidden', 'joining');
    this.online.querySelector<HTMLElement>('.online-form')!.classList.add('hidden');
    this.online.querySelector<HTMLElement>('.lobby')!.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.room-code')!.textContent = code;
    this.qrBig.querySelector<HTMLElement>('.qb-code')!.textContent = code;
    const seats = Array.from({ length: MAX_RACERS }, (_, i) => {
      const p = players[i];
      const dot = `<b class="dot" style="background:${p ? colorHex(i) : 'transparent'};border-color:${colorHex(i)}"></b>`;
      return p
        ? `<div class="lobby-p${p.me ? ' me' : ''}">${dot}<span>${esc(p.name)}${p.me ? ' <em>you</em>' : ''}</span>${p.host ? icon('crown') : ''}</div>`
        : `<div class="lobby-p dim">${dot}<span>${BOT_SEATS[i]} <em>bot</em></span></div>`;
    }).join('');
    this.online.querySelector<HTMLElement>('.lobby-players')!.innerHTML = seats;
    const bots = Math.max(0, MAX_RACERS - players.length);
    this.online.querySelector<HTMLElement>('.lobby-count')!.textContent =
      `${players.length} / ${MAX_RACERS} players` + (bots ? ` · ${bots} bot${bots > 1 ? 's fill' : ' fills'} the rest` : ' · full grid');
    const start = this.online.querySelector<HTMLButtonElement>('[data-a=start]')!;
    start.classList.toggle('hidden', !amHost);
    this.online.querySelector<HTMLElement>('.lobby-diff')!.classList.toggle('hidden', !amHost || bots === 0);
    this.online.querySelector<HTMLElement>('.lobby-wait')!.classList.toggle('hidden', amHost);
    this.online.querySelector<HTMLElement>('.qr-box')!.classList.toggle('hidden', players.length >= MAX_RACERS || !this.joinUrl);
    this.online.classList.toggle('host', amHost);
    this.onlineMsg(amHost ? (players.length < 2 ? 'Get everyone to scan the QR code, or start now against bots.' : 'Start when everyone is in.') : '');
  }

  private buildPause(parent: HTMLElement) {
    this.pause = document.createElement('div');
    this.pause.className = 'screen hidden';
    this.pause.innerHTML = `
      <div class="title" style="font-size:56px">Paused</div>
      <button class="btn" data-a="resume">Resume</button>
      <button class="btn secondary" data-a="settings">Settings</button>
      <button class="btn secondary" data-a="quit">Menu</button>`;
    parent.appendChild(this.pause);
    this.pause.querySelector<HTMLButtonElement>('[data-a=resume]')!.onclick = () => this.h.onResume();
    this.pause.querySelector<HTMLButtonElement>('[data-a=quit]')!.onclick = () => this.h.onMenu();
    this.pause.querySelector<HTMLButtonElement>('[data-a=settings]')!.onclick = () => { this.pause.classList.add('hidden'); this.h.onSettings(); };
  }

  showPause(on: boolean) {
    this.pause.classList.toggle('hidden', !on);
    if (on) this.pause.querySelector<HTMLButtonElement>('[data-a=resume]')!.focus();
  }

  private setDifficulty(d: Difficulty) {
    this.difficulty = d;
    for (const el of [this.main, this.online]) el?.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
    try { localStorage.setItem(DIFF_KEY, d); } catch { /* ignore */ }
  }

  showMain() {
    this.results.classList.add('hidden');
    this.main.classList.remove('hidden');
    this.main.querySelector<HTMLButtonElement>('[data-a=solo]')!.focus();
  }

  hideAll() {
    this.online?.classList.add('hidden');
    this.qrBig?.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.main.classList.add('hidden');
    this.results.classList.add('hidden');
  }

  showResults(standings: Standing[], meId?: string, online = false) {
    this.resultsBody.innerHTML = resultsHtml(standings, meId);
    this.results.querySelector<HTMLButtonElement>('[data-a=rematch]')!.textContent = online ? 'Back to lobby' : 'Rematch';
    this.main.classList.add('hidden');
    this.results.classList.remove('hidden');
    this.results.querySelector<HTMLButtonElement>('[data-a=rematch]')!.focus();
  }
}
