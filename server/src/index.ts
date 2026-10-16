import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@shared/protocol';
import { DEFAULT_PORT } from '@shared/protocol';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: '*' } });

app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
} else {
  app.get('/', (_req, res) =>
    res.send('Client not built. Run <code>npm run build</code>, or use <code>npm run dev</code> and open port 5173.'),
  );
}

// ---- Rooms: up to 2 humans per room, identified by a 4-letter code. The server only relays.
interface Room { code: string; players: { id: string; name: string }[]; hostId: string }
const rooms = new Map<string, Room>();
const roomOf = new Map<string, string>(); // socket id -> room code
const MAX_HUMANS = 2;
const BOT_NAMES = ['Blossom', 'Sunny', 'Maple', 'Frost'];

function newCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}

function lobby(room: Room) {
  io.to(room.code).emit('room:lobby', room.code, room.players.map((p) => ({ id: p.id, name: p.name, host: p.id === room.hostId })));
}

function leave(socketId: string) {
  const code = roomOf.get(socketId);
  if (!code) return;
  roomOf.delete(socketId);
  const room = rooms.get(code);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== socketId);
  io.sockets.sockets.get(socketId)?.leave(code);
  if (!room.players.length) { rooms.delete(code); return; }
  if (room.hostId === socketId) room.hostId = room.players[0].id;
  io.to(code).emit('room:left', socketId);
  lobby(room);
}

const cleanName = (n: unknown) => String(n ?? '').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Player';

io.on('connection', (socket) => {
  console.log(`[io] connected ${socket.id}`);
  socket.on('sys:ping', (ack) => {
    if (typeof ack === 'function') ack({ serverTime: Date.now() });
  });
  socket.on('room:create', (name) => {
    leave(socket.id);
    const room: Room = { code: newCode(), players: [{ id: socket.id, name: cleanName(name) }], hostId: socket.id };
    rooms.set(room.code, room);
    roomOf.set(socket.id, room.code);
    socket.join(room.code);
    lobby(room);
  });
  socket.on('room:join', (code, name) => {
    const room = rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return void socket.emit('room:error', 'No room with that code');
    if (room.players.length >= MAX_HUMANS) return void socket.emit('room:error', 'That room is full');
    leave(socket.id);
    room.players.push({ id: socket.id, name: cleanName(name) });
    roomOf.set(socket.id, room.code);
    socket.join(room.code);
    lobby(room);
  });
  socket.on('room:leave', () => leave(socket.id));
  socket.on('race:request', (difficulty) => {
    const room = rooms.get(roomOf.get(socket.id) ?? '');
    if (!room || room.hostId !== socket.id) return;
    const d = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'normal';
    const humans = room.players.map((p) => ({ id: p.id, name: p.name, human: true }));
    const bots = BOT_NAMES.slice(0, 4 - humans.length).map((n, i) => ({ id: 'bot' + i, name: n, human: false }));
    io.to(room.code).emit('race:start', { grid: [...humans, ...bots], hostId: room.hostId, difficulty: d, delayMs: 600 });
  });
  socket.on('race:state', (snaps) => {
    const code = roomOf.get(socket.id);
    if (code && Array.isArray(snaps)) socket.to(code).volatile.emit('race:state', snaps);
  });
  socket.on('disconnect', () => {
    leave(socket.id);
    console.log(`[io] disconnected ${socket.id}`);
  });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Season Drift server on http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  LAN: http://${a.address}:${PORT}`);
    }
  }
});
