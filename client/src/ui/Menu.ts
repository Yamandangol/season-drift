// Main menu + results screen. Real <button>s so keyboard (Tab/Enter) works out of the box.

import type { Difficulty } from '@shared/constants';
import type { Standing } from '../game/Race';
import { resultsHtml } from './HUD';

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
        <div class="title"><span class="tt">Season<br>Drift</span><span class="seasons"><span>🌱</span><span>☀️</span><span>🍂</span><span>❄️</span></span></div>
        <div class="mm-tag">One lap. Four seasons. Every season changes how you drive.</div>
        <button class="btn mm-btn" data-a="solo"><i>🏁</i><span>Play Solo<small>you vs 3 bots</small></span></button>
        <button class="btn mm-btn" data-a="split"><i>👥</i><span>2 Players · one screen<small>split screen · WASD + arrows</small></span></button>
        <button class="btn secondary mm-btn" data-a="online"><i>🌐</i><span>2 Players · two devices<small>share a 4-letter room code</small></span></button>
        <div class="row menu-row"><button class="btn secondary small" data-a="howto">📖 How to play</button><button class="btn secondary small" data-a="settings">⚙️ Settings</button></div>
        <div class="mm-diff"><span class="label">Bots</span>
          <div class="row" data-a="diff">
            <button class="chip" data-d="easy">Easy</button>
            <button class="chip" data-d="normal">Normal</button>
            <button class="chip" data-d="hard">Hard</button>
          </div>
        </div>
      </div>
      <div class="mm-right">
        <div class="mm-card s0"><i>🌸</i><div><b>Spring · Petal Chain</b><span>Weave through the petals in order — every link is more speed.</span></div></div>
        <div class="mm-card s1"><i>☁️</i><div><b>Summer · Cloud Hopping</b><span>The sun cooks your engine. Brake in a cloud's shadow to cool.</span></div></div>
        <div class="mm-card s2"><i>🍂</i><div><b>Autumn · Leaf Kick</b><span>Rip through leaf piles to blind whoever is behind you.</span></div></div>
        <div class="mm-card s3"><i>🔥</i><div><b>Winter · Snow Load</b><span>Snow piles on and slows you. Stop on a heater to melt it.</span></div></div>
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
      <div class="title" style="font-size:52px">🏆</div>
      <div class="results"></div>
      <div class="row">
        <button class="btn" data-a="rematch">🔁 Rematch</button>
        <button class="btn secondary" data-a="menu">🏠 Menu</button>
      </div>`;
    parent.appendChild(this.results);
    this.resultsBody = this.results.querySelector('.results')!;
    this.results.querySelector<HTMLButtonElement>('[data-a=rematch]')!.onclick = () => this.h.onRematch();
    this.results.querySelector<HTMLButtonElement>('[data-a=menu]')!.onclick = () => this.h.onMenu();
    this.buildPause(parent);
    this.buildOnline(parent);
  }

  private online!: HTMLDivElement;
  private buildOnline(parent: HTMLElement) {
    this.online = document.createElement('div');
    this.online.className = 'screen hidden';
    this.online.innerHTML = `
      <div class="title" style="font-size:44px">🌐 Two devices</div>
      <div class="online-form">
        <input class="field" data-f="name" maxlength="14" placeholder="Your name">
        <button class="btn" data-a="create">➕ Create room</button>
        <div class="row"><input class="field code" data-f="code" maxlength="4" placeholder="CODE"><button class="btn secondary small" data-a="join">Join</button></div>
      </div>
      <div class="lobby hidden">
        <div class="label">Room code</div>
        <div class="room-code"></div>
        <div class="lobby-players"></div>
        <button class="btn" data-a="start">🏁 Start race</button>
        <div class="lobby-wait">Waiting for the host to start…</div>
      </div>
      <div class="online-msg"></div>
      <button class="btn secondary" data-a="back">⬅ Back</button>`;
    parent.appendChild(this.online);
    const q = <T extends HTMLElement>(s: string) => this.online.querySelector<T>(s)!;
    const name = () => q<HTMLInputElement>('[data-f=name]').value.trim() || 'Player';
    try { q<HTMLInputElement>('[data-f=name]').value = localStorage.getItem('fsr.name') ?? ''; } catch { /* ignore */ }
    const saveName = () => { try { localStorage.setItem('fsr.name', name()); } catch { /* ignore */ } };
    q<HTMLButtonElement>('[data-a=create]').onclick = () => { saveName(); this.onlineMsg('Creating room…'); this.h.onOnlineCreate(name()); };
    q<HTMLButtonElement>('[data-a=join]').onclick = () => {
      const code = q<HTMLInputElement>('[data-f=code]').value.trim().toUpperCase();
      if (code.length !== 4) return this.onlineMsg('Enter the 4-letter room code');
      saveName();
      this.onlineMsg('Joining…');
      this.h.onOnlineJoin(code, name());
    };
    q<HTMLButtonElement>('[data-a=start]').onclick = () => this.h.onOnlineStart(this.difficulty);
    q<HTMLButtonElement>('[data-a=back]').onclick = () => this.h.onOnlineBack();
    // typing in the fields must not drive the car / pause
    this.online.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  showOnline() {
    this.hideAll();
    this.online.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.online-form')!.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.lobby')!.classList.add('hidden');
    this.onlineMsg('Both devices must open this same address (same Wi-Fi / LAN).');
  }

  onlineMsg(text: string) {
    this.online.querySelector<HTMLElement>('.online-msg')!.textContent = text;
  }

  showLobby(code: string, players: { name: string; host: boolean; me: boolean }[], amHost: boolean) {
    this.hideAll();
    this.online.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.online-form')!.classList.add('hidden');
    this.online.querySelector<HTMLElement>('.lobby')!.classList.remove('hidden');
    this.online.querySelector<HTMLElement>('.room-code')!.textContent = code;
    this.online.querySelector<HTMLElement>('.lobby-players')!.innerHTML = players
      .map((p) => `<div class="lobby-p">${p.host ? '👑' : '🎮'} ${p.name}${p.me ? ' (you)' : ''}</div>`).join('') +
      (players.length < 2 ? '<div class="lobby-p dim">waiting for player 2…</div>' : '');
    const start = this.online.querySelector<HTMLButtonElement>('[data-a=start]')!;
    start.classList.toggle('hidden', !amHost);
    start.disabled = players.length < 2;
    this.online.querySelector<HTMLElement>('.lobby-wait')!.classList.toggle('hidden', amHost);
    this.onlineMsg(amHost ? (players.length < 2 ? 'Tell player 2 the code.' : 'Ready!') : '');
  }

  private buildPause(parent: HTMLElement) {
    this.pause = document.createElement('div');
    this.pause.className = 'screen hidden';
    this.pause.innerHTML = `
      <div class="title" style="font-size:64px">⏸</div>
      <button class="btn" data-a="resume">▶ Resume</button>
      <button class="btn secondary" data-a="settings">⚙️ Settings</button>
      <button class="btn secondary" data-a="quit">🏠 Menu</button>`;
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
    this.main.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
    try { localStorage.setItem(DIFF_KEY, d); } catch { /* ignore */ }
  }

  showMain() {
    this.results.classList.add('hidden');
    this.main.classList.remove('hidden');
    this.main.querySelector<HTMLButtonElement>('[data-a=solo]')!.focus();
  }

  hideAll() {
    this.online?.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.main.classList.add('hidden');
    this.results.classList.add('hidden');
  }

  showResults(standings: Standing[], meId?: string) {
    this.resultsBody.innerHTML = resultsHtml(standings, meId);
    this.main.classList.add('hidden');
    this.results.classList.remove('hidden');
    this.results.querySelector<HTMLButtonElement>('[data-a=rematch]')!.focus();
  }
}
