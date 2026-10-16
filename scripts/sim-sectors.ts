// Dev utility: per-season time and average speed for each bot over a full race.
import * as THREE from 'three';
import { buildTrackData, seasonAt, inStartZone } from '../shared/src/track';
import { Race } from '../client/src/game/Race';
import { Hazards } from '../client/src/game/Hazards';
import { SIM_DT } from '../shared/src/constants';
const diff = (process.argv[2] ?? 'normal') as 'easy' | 'normal' | 'hard';
const track = buildTrackData();
const hz = new Hazards(track);
const race = new Race(track, hz, new THREE.Scene(), [0, 1, 2, 3].map((i) => ({ id: 'b' + i, name: 'Bot' + i, color: 0, kind: 'bot' as const })), diff);
const time: Record<string, number> = {}, slow: Record<string, number> = {};
const N = { throttle: 0, brake: 0, steer: 0, item: false, respawn: false, pause: false };
while (race.now < 260) {
  race.step([N]);
  if (race.now < race.startAt) continue;
  for (const r of race.racers) {
    if (r.finished) continue;
    const s = inStartZone(r.car.trackPos.t, track.length) ? 'start' : seasonAt(r.car.trackPos.t, hz.map.offset);
    time[s] = (time[s] ?? 0) + SIM_DT / 4;
    if (r.car.speed < 15) slow[s] = (slow[s] ?? 0) + SIM_DT / 4;
  }
}
const laps = race.racers.map((r) => r.lapTimes.map((t) => t.toFixed(1)).join(','));
console.log('laps', laps);
console.log('sec/bot per season (whole race)', Object.fromEntries(Object.entries(time).map(([k, v]) => [k, v.toFixed(1)])));
console.log('sec below 15u/s', Object.fromEntries(Object.entries(slow).map(([k, v]) => [k, v.toFixed(1)])));
