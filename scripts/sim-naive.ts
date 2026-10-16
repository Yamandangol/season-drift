// Dev utility: a "naive" player who floors it everywhere — should hit stalls/hydroplaning.
import * as THREE from 'three';
import { buildTrackData } from '../shared/src/track';
import { Race } from '../client/src/game/Race';
import { Hazards } from '../client/src/game/Hazards';
import { Bot } from '../client/src/game/Bots';
const track = buildTrackData();
const hz = new Hazards(track);
const ev: Record<string, number> = {};
hz.onEvent = (_c, e) => (ev[e] = (ev[e] ?? 0) + 1);
const race = new Race(track, hz, new THREE.Scene(), [{ id: 'me', name: 'Naive', color: 0, kind: 'local' }], 'normal');
const pilot = new Bot(track, hz, 'normal', 0);
const me = race.racers[0];
race.onLap = (r, l) => console.log('lap', l, r.lapTimes.at(-1)!.toFixed(1));
while (race.phase !== 'finished' && race.now < 400) {
  const i = pilot.input(me.car, me.hz, 1 / 60);
  // naive: floor it, never lift for heat or puddles, drive centre line
  race.step({ ...i, throttle: i.brake ? 0 : 1 });
}
console.log('naive events', ev, 'finished', me.finished, me.finishTime.toFixed(1));
