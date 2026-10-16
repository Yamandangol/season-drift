// Dev utility: run a full 4-bot race headless and report times + hazard events.
import * as THREE from 'three';
import { buildTrackData, seasonAt } from '../shared/src/track';
import { Race } from '../client/src/game/Race';
import { Hazards } from '../client/src/game/Hazards';
const diff = (process.argv[2] ?? 'normal') as 'easy' | 'normal' | 'hard';
const track = buildTrackData();
const hz = new Hazards(track);
const events: Record<string, number> = {};
hz.onEvent = (_c, e) => (events[e] = (events[e] ?? 0) + 1);
const race = new Race(track, hz, new THREE.Scene(), [0, 1, 2, 3].map((i) => ({ id: 'b' + i, name: 'Bot' + i, color: 0, kind: 'bot' as const })), diff);
race.onLap = (r, l) => console.log(`${r.name} lap ${l} ${r.lapTimes.at(-1)!.toFixed(1)}s`);
const respawns: Record<string, number> = {};
const orig = race.respawn.bind(race);
race.respawn = (r) => { respawns[r.name + '@' + seasonAt(r.car.trackPos.t) + ':' + r.car.trackPos.t.toFixed(3)] = 1; orig(r); };
let maxHeat = 0, stalls = 0;
while (race.phase !== 'finished' && race.now < 600) {
  race.step({ throttle: 0, brake: 0, steer: 0, item: false, respawn: false, pause: false });
  for (const r of race.racers) maxHeat = Math.max(maxHeat, r.hz.heat);
}
console.log(race.standings.map((s) => `${s.place}. ${s.name} ${s.finished ? s.totalTime.toFixed(1) + 's' : 'DNF'}`).join(' | '));
console.log('events', events, 'maxHeat', maxHeat.toFixed(0));
console.log('respawns', Object.keys(respawns));
