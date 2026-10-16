// Dev utility: hold one lane flat-out through summer — should burn out (stall) against the cloud chain.
import * as THREE from 'three';
import { buildTrackData, trackPoint } from '../shared/src/track';
import { Race } from '../client/src/game/Race';
import { Hazards } from '../client/src/game/Hazards';
const lane = Number(process.argv[2] ?? 0);
const track = buildTrackData();
const hz = new Hazards(track);
const ev: Record<string, number> = {};
hz.onEvent = (_c, e) => (ev[e] = (ev[e] ?? 0) + 1);
const race = new Race(track, hz, new THREE.Scene(), [{ id: 'me', name: 'Lane', color: 0, kind: 'local' }], 'normal');
const me = race.racers[0];
let maxHeat = 0;
while (race.phase !== 'finished' && race.now < 300) {
  const c = me.car;
  const p = trackPoint(track, c.trackPos.t + 12 / track.length, lane);
  let err = Math.atan2(p.x - c.x, p.z - c.z) - c.heading;
  err = Math.atan2(Math.sin(err), Math.cos(err));
  race.step({ throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.6)), item: false, respawn: false, pause: false });
  maxHeat = Math.max(maxHeat, me.hz.heat);
}
console.log('lane', lane, JSON.stringify(ev), 'maxHeat', maxHeat.toFixed(0));
