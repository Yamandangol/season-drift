// Network message types (Socket.IO). Two devices, one room: each device simulates its own car
// (the host also simulates the bots) and streams snapshots; the server just relays.

export const DEFAULT_PORT = 3000;

export interface PingReply {
  serverTime: number;
}

/** One car's state, sent ~20x a second by whoever simulates it. */
export interface CarSnap {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  h: number; // heading
  sp: number; // signed forward speed
  surf: string;
  // race progress (the owner is authoritative for its own laps)
  lap: number; // completed
  cp: number;
  fin: boolean;
  ft: number; // finish time
  laps: number[];
  // visible state
  heat: number;
  snow: number;
  chain: number;
  stall: number; // seconds of stall left
  warm: boolean;
}

export interface LobbyPlayer {
  id: string; // socket id
  name: string;
  host: boolean;
}

export interface RaceStart {
  /** ordered grid: the room's humans then bots */
  grid: { id: string; name: string; human: boolean }[];
  hostId: string;
  difficulty: 'easy' | 'normal' | 'hard';
  /** ms from now until both devices create the race */
  delayMs: number;
}

export interface ServerToClient {
  'sys:pong': (reply: PingReply) => void;
  'room:lobby': (code: string, players: LobbyPlayer[]) => void;
  'room:error': (msg: string) => void;
  'room:left': (id: string) => void;
  'race:start': (start: RaceStart) => void;
  'race:state': (snaps: CarSnap[]) => void;
}

export interface ClientToServer {
  'sys:ping': (ack: (reply: PingReply) => void) => void;
  'room:create': (name: string) => void;
  'room:join': (code: string, name: string) => void;
  'room:leave': () => void;
  'race:request': (difficulty: 'easy' | 'normal' | 'hard') => void;
  'race:state': (snaps: CarSnap[]) => void;
}
