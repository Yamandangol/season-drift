import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@shared/protocol';
import { DEFAULT_PORT } from '@shared/protocol';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: '*' } });

app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

/** This machine's LAN addresses, so a host browsing on localhost can show a QR code phones can reach. */
function lanUrls(): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/vethernet|virtualbox|vmware|docker|wsl|loopback|tailscale|zerotier/i.test(name)) continue;
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  // prefer the usual home / venue Wi-Fi ranges
  const rank = (u: string) => (/\/\/192\.168\./.test(u) ? 0 : /\/\/10\./.test(u) ? 1 : /\/\/172\./.test(u) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}
/** `npm run share`: a free public https link (Cloudflare quick tunnel) so phones on mobile data can join. */
let publicUrl = '';
app.get('/api/lan', (_req, res) => res.json({ public: publicUrl || null, urls: lanUrls(), port: PORT }));

function startTunnel() {
  console.log('Opening a public link (first time downloads cloudflared, ~20 s)…');
  const cf = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const scan = (buf: Buffer) => {
    const m = buf.toString().match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !publicUrl) {
      publicUrl = m[0];
      const line = '='.repeat(64);
      console.log(`\n${line}\n  PUBLIC LINK (works on mobile data): ${publicUrl}\n  On the laptop open http://localhost:${PORT} > Online > Create room:\n  the QR code uses this link automatically.\n${line}\n`);
    }
  };
  cf.stdout.on('data', scan);
  cf.stderr.on('data', scan);
  cf.on('exit', (code) => { publicUrl = ''; console.log(`[share] tunnel closed (${code}). Run npm run share again.`); });
  const stop = () => { cf.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
} else {
  app.get('/', (_req, res) =>
    res.send('Client not built. Run <code>npm run build</code>, or use <code>npm run dev</code> and open port 5173.'),
  );
}

// ---- Rooms: up to 5 humans per room, identified by a 4-letter code. Every race has 5 cars:
// empty seats are filled with bots (run by the host). The server only relays.
interface Room { code: string; players: { id: string; name: string }[]; hostId: string; racingUntil: number }
const rooms = new Map<string, Room>();
const roomOf = new Map<string, string>(); // socket id -> room code
const MAX_HUMANS = 5;
const GRID = 5;
const BOT_NAMES = ['Blossom', 'Sunny', 'Maple', 'Frost', 'Bramble'];

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
    const room: Room = { code: newCode(), players: [{ id: socket.id, name: cleanName(name) }], hostId: socket.id, racingUntil: 0 };
    rooms.set(room.code, room);
    roomOf.set(socket.id, room.code);
    socket.join(room.code);
    lobby(room);
  });
  socket.on('room:join', (code, name) => {
    const room = rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return void socket.emit('room:error', 'No room with that code');
    if (room.players.some((p) => p.id === socket.id)) return void lobby(room);
    if (room.players.length >= MAX_HUMANS) return void socket.emit('room:error', `That room is full (${MAX_HUMANS} players max)`);
    if (Date.now() < room.racingUntil) return void socket.emit('room:error', 'A race is on in that room. Try again when it ends');
    leave(socket.id);
    // keep names unique so everyone can tell the cars apart
    let nm = cleanName(name);
    const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
    for (let k = 2; taken.has(nm.toLowerCase()); k++) nm = cleanName(name).slice(0, 12) + ' ' + k;
    room.players.push({ id: socket.id, name: nm });
    roomOf.set(socket.id, room.code);
    socket.join(room.code);
    lobby(room);
  });
  socket.on('room:leave', () => leave(socket.id));
  socket.on('race:over', () => {
    const room = rooms.get(roomOf.get(socket.id) ?? '');
    if (room && room.hostId === socket.id) room.racingUntil = 0;
  });
  socket.on('race:request', (difficulty) => {
    const room = rooms.get(roomOf.get(socket.id) ?? '');
    if (!room || room.hostId !== socket.id) return;
    const d = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'normal';
    const humans = room.players.map((p, i) => ({ id: p.id, name: p.name, human: true, color: i }));
    const bots = BOT_NAMES.slice(humans.length, GRID).map((n, i) => ({ id: 'bot' + i, name: n, human: false, color: humans.length + i }));
    // humans and bots mixed on the grid so nobody always starts at the back
    const grid = [...humans, ...bots].map((g) => ({ g, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.g);
    room.racingUntil = Date.now() + 4 * 60_000; // a lap takes ~2 minutes; latecomers wait for the lobby
    io.to(room.code).emit('race:start', { grid, hostId: room.hostId, difficulty: d, delayMs: 600 });
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
  for (const u of lanUrls()) console.log(`  LAN: ${u}   (phones on the same Wi-Fi open this)`);
  if (process.argv.includes('--share')) startTunnel();
});
