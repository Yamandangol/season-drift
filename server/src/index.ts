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

io.on('connection', (socket) => {
  console.log(`[io] connected ${socket.id}`);
  socket.on('sys:ping', (ack) => {
    if (typeof ack === 'function') ack({ serverTime: Date.now() });
  });
  socket.on('disconnect', () => console.log(`[io] disconnected ${socket.id}`));
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Four Seasons Racer server on http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  LAN: http://${a.address}:${PORT}`);
    }
  }
});
