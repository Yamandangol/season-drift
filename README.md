# Season Drift

Arcade multiplayer racer for **ThunderHacks 2026 — Algoma Game Jam (theme: Four Seasons)**.
One big lap of a looping track, four sectors (Spring → Summer → Autumn → Winter), and each season changes how you drive.

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
npx tsx --tsconfig client/tsconfig.json scripts/sim-race.ts   # headless 4-bot race (arg: easy|normal|hard)
npx tsx --tsconfig client/tsconfig.json scripts/sim-naive.ts  # flat-out driver: should stall in summer
```

Add `?debug` to the URL for an FPS / track-position / draw-call overlay.

## How this meets the Game Jam brief

| Rubric / bonus | Where it is in the game |
|---|---|
| **Theme (25)**: seasons drive the gameplay | Every season has its own rule: Spring petal chain (speed), Summer heat + cloud shade (stop-and-go), Autumn leaf-kick + leaf waves (visibility), Winter snow load + heaters (weight, stopping). |
| **Gameplay & Fun (30)**: clear goal, playable loop | One lap race vs 3 bots or a friend. A season strip at the top shows every car's progress through Spring → Winter. Bots catch up gently so races stay close; Easy / Normal / Hard. |
| **Art & Audio (20)**: one consistent style | Low-poly geometry + one palette per season, gradient sky, glow on lights and fire; all sound and music synthesised live (engine, tyres, ambience, per-season music). |
| **Playable Build (15)** | `npm start` (one process) or the Render blueprint; auto-recovers stuck cars; drops post-effects on slow GPUs; works on phones with touch buttons. |
| **Originality (10)** | Seasons as *driving rules*: braking into a moving cloud's shadow to cool, kicking leaves into a rival's face, parking on a heater to shed snow. |
| Bonus: all four seasons play differently | ✅ see above |
| Bonus: season change is part of the play | ✅ your spring petal chain carries into summer (still faster, but the engine runs hotter); the strip shows the next season coming |
| Bonus: art / audio made during the event | ✅ all models are built in code, all audio is synthesised (no asset files) |
| Bonus: accessibility | ✅ Settings: remap keys for both players, colour-blind helpers (icon markers on hazards, blue→orange heat scale, name tags), reduce flashes & shake, music / effects volume, graphics quality; adjustable bot difficulty |
| Bonus: teaches without text | ✅ roadside picture signs before each season (🌸➜⚡, ☀️🌡️➜☁️🛑➜❄️, 🍂🚗➜💨🙈, ❄️🐢➜🔥🛑) plus the animated How to play cards |

## Play with a friend on another device

Only one person runs the game; everyone else just opens a link in a browser (phone or laptop).

- **Same Wi-Fi:** `npm run build && npm start`, then your friend opens the `LAN: http://192.168.x.x:3000` address the server prints. (On Windows, allow Node.js through the firewall when asked.)
- **Anywhere (temporary link):** keep `npm start` running and in a second terminal run `npx cloudflared tunnel --url http://localhost:3000`; share the `https://….trycloudflare.com` link it prints.
- **Permanent link (best for judging):** deploy to [Render](https://render.com) — *New → Blueprint*, pick this repo; `render.yaml` sets everything up (build `npm install --include=dev && npm run build`, start `npm start`). Free instances sleep when idle, so open the link a minute before you demo.

Then: *2 Players · two devices* → one player creates a room, the other joins with the 4-letter code.

## Game modes

| Mode | How |
|---|---|
| 🏁 Solo | You vs 3 bots. |
| 👥 2 Players · one screen | Split screen on one computer: **P1 = W A S D** (left half), **P2 = arrow keys** (right half), plus 2 bots. Two gamepads also work (pad 1 = P1, pad 2 = P2). |
| 🌐 2 Players · two devices | One player clicks *Create room* and reads out the 4-letter code; the other enters it and clicks *Join*. The host starts the race. Both devices must open the same server address (run `npm start` on one laptop and open the LAN URL it prints on the other). Each device drives its own car; the host also runs the bots. |

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A D / ← → | Left stick |
| Pause | Esc | Start |
| Settings (remap keys, accessibility, volume) | Menu → ⚙️ Settings | — |
| Mute sound | M | — |

## How each season changes the way you drive

| Season | Mechanic |
|---|---|
| 🌱 Spring | Petal chain: swirling clusters of cherry petals (pink light columns) float over one lane each in a zig-zag. Fly through them in order — every link adds top speed (up to +30%); miss one and the chain breaks. Some links sit in the water spills (aquaplane above 60% speed) or next to mud: is the link worth it? |
| ☀️ Summer | Cloud hopping: the sun overheats your engine in a few seconds. Small one-lane clouds drift down the road in a zig-zag and throw cloud-shaped shadows. A shadow blocks the sun, but it only **cools** you while you're slow: hop into a shadow, brake for a moment, then go. Get it wrong and your car bursts into flames and stalls. |
| 🍂 Autumn | Leaf-kick: tear through a leaf pile and you throw a cloud of leaves out behind you — whoever follows close in your lane is blinded for a moment (bots lose their line). Drive into piles when someone's on your tail; change lanes to dodge a kick. A few waves of blown leaves sweep down the road and briefly cover your screen. Branches fall from the trees. |
| ❄️ Winter | Frozen lake: the inside of the big corner is an open frozen lake — cut straight across it, but if you slow down the ice cracks and you fall through. Snow piles up on your car (heavier = slower, wider turns); **stop** on a glowing heater pad and sit still to melt it off (driving over it does nothing). Packed snow drifts block lanes. |

## Project layout

```
shared/  track data, tuning constants, network protocol (used by client + server)
server/  Express static host + Socket.IO
client/  Three.js game
scripts/ dev checks
```

## Status

- [x] Phase 0: skeleton, spline track, walls, chase camera, arcade car physics
- [x] Phase 1: solo race MVP (sectors, hazards, laps, bots, HUD)
- [x] Phase 2: two players — split screen on one computer, or two devices over LAN
- [x] Phase 3: juice — synthesised sound and music, particles, How to play cards, polished UI
- [x] Phase 4: lock down — deploy config, README

## Credits

| Item | Type | License | Link |
|---|---|---|---|
| Three.js | Library | MIT | https://threejs.org |
| Socket.IO | Library | MIT | https://socket.io |
| Express | Library | MIT | https://expressjs.com |
| Vite | Tool | MIT | https://vitejs.dev |
| tsx | Tool | MIT | https://github.com/privatenumber/tsx |

All art is procedural low-poly geometry made by the team in code. All sound effects and music are synthesised live in the browser with the Web Audio API (no audio files). Press **M** or the 🔊 button to mute.
