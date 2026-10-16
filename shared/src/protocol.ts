// Network message types. Filled out in Phase 2.

export const DEFAULT_PORT = 3000;

export interface PingReply {
  serverTime: number;
}

export interface ServerToClient {
  'sys:pong': (reply: PingReply) => void;
}

export interface ClientToServer {
  'sys:ping': (ack: (reply: PingReply) => void) => void;
}
