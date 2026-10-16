// Dev utility: a simple autopilot drives the real Car physics for one lap, headless.
import { buildTrackData, trackPoint } from '../shared/src/track';
import { SIM_DT, TRACK } from '../shared/src/constants';
import { Car } from '../client/src/game/Car';
const track = buildTrackData();
const car = new Car(track);
car.placeAt(0.995, 0);
let time = 0, maxLat = 0, wraps = 0, lastT = car.trackPos.t, wallHits = 0;
while (time < 200 && wraps < 2) {
  const ahead = trackPoint(track, car.trackPos.t + 14 / track.length, 0);
  const want = Math.atan2(ahead.x - car.x, ahead.z - car.z);
  let d = want - car.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  const far = trackPoint(track, car.trackPos.t + 45 / track.length, 0);
  let bend = far.heading - car.heading; bend = Math.abs(Math.atan2(Math.sin(bend), Math.cos(bend)));
  const brake = bend > 0.5 && car.speed > 24 ? 1 : 0;
  car.step({ throttle: brake ? 0 : 1, brake, steer: Math.max(-1, Math.min(1, -d * 3)), item: false, respawn: false, pause: false }, SIM_DT);
  if (car.hitWall > 0) wallHits++;
  maxLat = Math.max(maxLat, Math.abs(car.trackPos.lateral));
  if (lastT > 0.9 && car.trackPos.t < 0.1) { wraps++; console.log('lap', wraps, 'time', time.toFixed(1), 's'); time = 0; }
  lastT = car.trackPos.t;
  time += SIM_DT;
}
console.log('max |lateral|', maxLat.toFixed(1), '(wall at', TRACK.wallOffset, ') wall-contact ticks', wallHits);
