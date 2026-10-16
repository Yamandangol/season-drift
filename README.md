# Four Seasons Racer

Arcade multiplayer racer for **ThunderHacks 2026 — Algoma Game Jam (theme: Four Seasons)**.
One looping track, four sectors (Spring → Summer → Autumn → Winter), and each season changes how you drive.

Built with TypeScript, Three.js (WebGL), Vite, Node.js and Socket.IO.

## Run it

Requires Node 20+ (tested on Node 22).

```bash
npm install

# Development (hot reload): server on :3000, client on :5173
npm run dev
# → open http://localhost:5173

# Production / on-site: one process, one URL
npm run build
npm start
# → open http://localhost:3000  (the server also prints LAN URLs for other devices)
```

Dev utilities:

```bash
npm run typecheck
npx tsx scripts/track-check.ts                                # lap length + overlap check
npx tsx --tsconfig client/tsconfig.json scripts/sim-lap.ts    # headless autopilot lap
```

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A D / ← → | Left stick |
| Use power-up | Shift | A |
| Respawn on track | R | Y |
| Pause | Esc | Start |

## Project layout

```
shared/  track data, tuning constants, network protocol (used by client + server)
server/  Express static host + Socket.IO
client/  Three.js game
scripts/ dev checks
```

## Status

- [x] Phase 0: skeleton, spline track, walls, chase camera, arcade car physics
- [ ] Phase 1: solo race MVP (sectors, hazards, laps, bots, HUD)
- [ ] Phase 2: online multiplayer
- [ ] Phase 3: juice and bonuses
- [ ] Phase 4: lock down

## Credits

| Item | Type | License | Link |
|---|---|---|---|
| Three.js | Library | MIT | https://threejs.org |
| Socket.IO | Library | MIT | https://socket.io |
| Express | Library | MIT | https://expressjs.com |
| Vite | Tool | MIT | https://vitejs.dev |
| tsx | Tool | MIT | https://github.com/privatenumber/tsx |

All art is procedural low-poly geometry made by the team in code.
