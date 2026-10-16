// Thin Socket.IO wrapper for online races (up to 5 devices in one room).

import { io, type Socket } from 'socket.io-client';
import type { CarSnap, ClientToServer, LobbyPlayer, RaceStart, ServerToClient } from '@shared/protocol';

export class Net {
  private socket: Socket<ServerToClient, ClientToServer> | null = null;
  code = '';
  players: LobbyPlayer[] = [];
  onLobby: (code: string, players: LobbyPlayer[]) => void = () => {};
  onError: (msg: string) => void = () => {};
  onStart: (s: RaceStart) => void = () => {};
  onState: (snaps: CarSnap[]) => void = () => {};
  onLeft: (id: string) => void = () => {};
  onDisconnect: () => void = () => {};

  get id(): string {
    return this.socket?.id ?? '';
  }

  get isHost(): boolean {
    return this.players.some((p) => p.id === this.id && p.host);
  }

  get connected(): boolean {
    return !!this.socket?.connected;
  }

  private ensure(): Socket<ServerToClient, ClientToServer> {
    if (this.socket) return this.socket;
    // Same origin in production (server serves the client); in dev Vite proxies /socket.io.
    const s: Socket<ServerToClient, ClientToServer> = io({ transports: ['websocket', 'polling'] });
    s.on('room:lobby', (code, players) => {
      this.code = code;
      this.players = players;
      this.onLobby(code, players);
    });
    s.on('room:error', (m) => this.onError(m));
    s.on('room:left', (id) => this.onLeft(id));
    s.on('race:start', (st) => this.onStart(st));
    s.on('race:state', (snaps) => this.onState(snaps));
    s.on('connect_error', () => this.onError("Can't reach the game server"));
    s.on('disconnect', () => this.onDisconnect());
    this.socket = s;
    return s;
  }

  create(name: string) {
    this.ensure().emit('room:create', name);
  }

  join(code: string, name: string) {
    this.ensure().emit('room:join', code, name);
  }

  leave() {
    this.socket?.emit('room:leave');
    this.code = '';
    this.players = [];
  }

  requestStart(difficulty: 'easy' | 'normal' | 'hard') {
    this.socket?.emit('race:request', difficulty);
  }

  /** host: results are up, so the room opens for new players again */
  raceOver() {
    this.socket?.emit('race:over');
  }

  send(snaps: CarSnap[]) {
    if (this.socket?.connected) this.socket.volatile.emit('race:state', snaps);
  }
}
