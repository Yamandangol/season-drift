// Dev utility: 4-bot race, counts spring petal links / chain breaks and autumn leaf hits per bot.
import * as THREE from 'three';
import { buildTrackData } from '../shared/src/track';
import { Race } from '../client/src/game/Race';
import { Hazards } from '../client/src/game/Hazards';
const track = buildTrackData();
const hz = new Hazards(track);
const per: Record<string, Record<string, number>> = {};
const race = new Race(track, hz, new THREE.Scene(), [0, 1, 2, 3].map((i) => ({ id: 'b' + i, name: 'Bot' + i, color: 0, kind: 'bot' as const })), (process.argv[2] as 'normal') ?? 'normal');
hz.onEvent = (c, e) => {
  const r = race.racers.find((x) => x.car === c)!;
  (per[r.name] ??= {})[e] = (per[r.name][e] ?? 0) + 1;
};
let maxChain = 0;
while (race.phase !== 'finished' && race.now < 600) {
  race.step({ throttle: 0, brake: 0, steer: 0, item: false, respawn: false, pause: false });
  for (const r of race.racers) maxChain = Math.max(maxChain, r.hz.chain);
}
for (const [n, e] of Object.entries(per)) console.log(n, 'petal', e.petal ?? 0, 'break', e.chainBreak ?? 0, 'kick', e.leafKick ?? 0, 'blinded', e.blinded ?? 0);
console.log('maxChain', maxChain, race.standings.map((s) => `${s.place}. ${s.name} ${s.finished ? s.totalTime.toFixed(1) : 'DNF'}`).join(' | '));
