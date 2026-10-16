import { PETALS, petalT } from '@shared/petals';
import { inStartZone, type Season } from '@shared/track';
// Dumb, reliable bots that follow the spline and show off the seasonal mechanics.

import { BOT, CAR, HEAT, type Difficulty } from '@shared/constants';
import type { HazardType } from '@shared/hazards';
import { FallingBranches } from '@shared/fallingBranches';
import { HEATERS, heaterT } from '@shared/winter';
import { seasonAt, trackPoint, type TrackData } from '@shared/track';
import type { InputState } from '../input/Input';
import type { Car } from './Car';
import type { Hazards, HazardCarState } from './Hazards';

const AVOID: Partial<Record<HazardType, number>> = { branch: 100, mud: 12, snow: 40, leaves: -4, ice: 1 }; // leaves: bots like a kick
const LANES = [-6, -3, 0, 3, 6]; // three lane centres plus the lines between them

export class Bot {
  lat: number;
  private targetLat: number;
  constructor(
    private track: TrackData,
    private hazards: Hazards,
    public difficulty: Difficulty,
    private personal: number,
  ) {
    this.lat = personal;
    this.targetLat = personal;
  }

  input(car: Car, st: HazardCarState, dt: number): InputState {
    const len = this.track.length;
    const t = car.trackPos.t;
    const curLat = car.trackPos.lateral;
    const season: Season | 'none' = inStartZone(t, len) ? 'none' : seasonAt(t, this.hazards.map.offset);

    // ---- Choose a lane that avoids hazards in the next ~45 units
    const ahead = this.hazards.map.between(t, (t + 45 / len) % 1);
    let nextCloud: { lat: number; t: number } | undefined;
    let nd = 1e9;
    for (const c of this.hazards.clouds.pos) {
      let d = (c.t - t) * len;
      if (d < -len / 2) d += len;
      if (d > -2 && d < 80 && d < nd) { nd = d; nextCloud = c; }
    }
    let nextPetal: { lat: number } | undefined;
    if (season === 'spring') {
      let pd = 1e9;
      const skip = { easy: 0.45, normal: 0.22, hard: 0.08 }[this.difficulty];
      for (const [i, p] of PETALS.entries()) {
        // each bot "doesn't see" some links (a fixed pick per bot), so chains get broken
        if (((Math.sin((i + 1) * 12.9898 + this.personal * 78.233) * 43758.5453) % 1 + 1) % 1 < skip) continue;
        let d = (petalT(p, this.hazards.map.offset) - t) * len;
        if (d < -len / 2) d += len;
        if (d > 1 && d < 70 && d < pd) { pd = d; nextPetal = p; }
      }
    }
    let best = this.targetLat;
    let bestCost = Infinity;
    for (const lane of LANES) {
      let cost = Math.abs(lane - this.personal) * 0.15 + Math.abs(lane - curLat) * 0.08;
      for (const h of ahead) {
        const w = AVOID[h.type];
        if (!w) continue;
        const m = h.blob !== undefined ? 1.2 : 2.2; // blobs don't fill their box
        if (lane >= h.lat0 - m && lane <= h.lat1 + m) cost += w;
      }
      // React to branches that are falling or already down just ahead.
      for (const b of this.hazards.falling.threats()) {
        let d = (b.t - t) * len;
        if (d < -len / 2) d += len;
        if (d < -3 || d > 55) continue;
        const half = FallingBranches.half();
        if (lane >= b.lat - half - 1.3 && lane <= b.lat + half + 1.3) cost += b.phase === 'down' ? 100 : 70;
      }
      // Winter: detour over a heater pad when loaded with snow.
      if (season === 'winter' && st.snow > 0.35) {
        for (const h of HEATERS) {
          let d = (heaterT(h, this.hazards.map.offset) - t) * len;
          if (d < -len / 2) d += len;
          if (d > 0 && d < 60 && lane >= h.lat0 && lane <= h.lat1) cost -= 30 * st.snow;
        }
      }
      // Spring: thread the petal chain.
      if (nextPetal && Math.abs(lane - nextPetal.lat) < 2.5) cost -= 45 + st.chain * 2;
      // Summer: hop to the lane of the next cloud in the chain.
      if (season === 'summer' && nextCloud && Math.abs(lane - nextCloud.lat) < 3) cost -= 60 * Math.max(0, Math.min(1, (st.heat - 25) / 30)); // only chase shade once warm
      // Autumn: stay out of the leaf waves
      if (season === 'autumn') for (const w of this.hazards.waves.pos) {
        let d = (w.t - t) * len;
        if (d < -len / 2) d += len;
        if (d > -4 && d < 85 && Math.abs(lane - w.lat) < 5.5) cost += 70;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = lane;
      }
    }
    if (st.blind <= 0) this.targetLat = best; // blinded by leaves: can't see to pick a line
    this.lat += (this.targetLat - this.lat) * Math.min(1, dt * (season === 'summer' ? 5 : 2.5));

    // ---- Steering toward a point ahead on the chosen lane
    const p = trackPoint(this.track, t + BOT.lookAhead / len, this.lat);
    const want = Math.atan2(p.x - car.x, p.z - car.z);
    let err = want - car.heading;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const wobble = st.blind > 0 ? Math.sin(t * 900 + this.personal) * 0.5 : 0;
    const steer = Math.max(-1, Math.min(1, -err * 2.6 + wobble));

    // ---- Target speed from upcoming bend + seasonal caution
    const now = trackPoint(this.track, t, 0).heading;
    const far = trackPoint(this.track, t + 38 / len, 0).heading;
    let bend = far - now;
    bend = Math.abs(Math.atan2(Math.sin(bend), Math.cos(bend)));
    let target = CAR.maxSpeed * car.maxSpeedMult * (1 - Math.min(0.55, bend * 0.75));

    for (const h of ahead) {
      if (h.type === 'ice' && h.lat0 <= curLat && h.lat1 >= curLat) target = Math.min(target, 24); // brake before ice
      if (h.type === 'puddle' && h.lat0 - 2 <= curLat && h.lat1 + 2 >= curLat) target = Math.min(target, CAR.maxSpeed * 0.5); // no hydroplaning
    }
    if (car.surface === 'ice') target = Math.min(target, 24);

    // Bots floor it like players do (so summer heat builds up visibly).
    // Summer: ride inside cloud shadows when hot (match the cloud's pace).
    if (season === 'summer' && st.inShade && st.heat > 30) target = Math.min(target, 9);
    // ...and ease off before reaching the cloud we're hopping to, so there's time to brake inside it
    if (season === 'summer' && !st.inShade && st.heat > 45 && nextCloud && Math.abs(curLat - nextCloud.lat) < 6) {
      let d = (nextCloud.t - t) * len;
      if (d < -len / 2) d += len;
      if (d > 0 && d < 38) target = Math.min(target, 12 + d * 0.5);
    }
    // Winter: park on a heater pad to defrost
    if (season === 'winter' && st.snow > 0.08 && st.onHeater) target = 0;
    else if (season === 'winter' && st.snow > 0.3 && this.lat >= -9 && this.padAhead(t, len, car.speed)) target = Math.min(target, 18);
    if (st.blind > 0) target *= 0.72;
    let throttle = car.speed < target + 1 ? 1 : 0;
    const brake = car.speed > target + (target === 0 ? 0.5 : 3) ? 1 : 0;

    // Summer: lift when hot unless in shade.
    if (season === 'summer' && st.heat > 92 && !st.inShade) throttle = 0;
    if (st.heat > HEAT.warn + 15) throttle = 0;

    // Heat boost: fire near the red line, or spend leftover heat on a straight.
    const straight = bend < 0.25;
    const item = false && st.heat >= 85 || (st.heat >= 40 && straight && season === "summer") || (season !== 'summer' && st.heat > 30 && straight);

    return { throttle, brake, steer, item, respawn: false, pause: false };
  }

  /** a pad in our lane is within braking distance */
  private padAhead(t: number, len: number, speed: number): boolean {
    for (const h of HEATERS) {
      let d = (heaterT(h, this.hazards.map.offset) - t) * len;
      if (d < -len / 2) d += len;
      if (d > 0 && d < 30 && this.targetLat >= h.lat0 && this.targetLat <= h.lat1) return true;
    }
    return false;
  }
}
