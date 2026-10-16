// Arcade car physics on the XZ plane. Local car only (remote cars are interpolated).
// Heading convention: forward = (sin h, cos h), right = (-cos h, sin h).

import { BOOST, CAR, SURFACES, TRACK, type Surface, type SurfaceName } from '@shared/constants';
import { queryTrack, trackPoint, type TrackData, type TrackPos } from '@shared/track';
import { lakeShoreOpen } from '@shared/lake';
import type { InputState } from '../input/Input';

export class Car {
  x = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  /** signed forward speed */
  speed = 0;
  heat = 0;
  stalledUntil = 0;

  // previous tick state for render interpolation
  px = 0;
  pz = 0;
  pheading = 0;

  trackPos: TrackPos = { t: 0, lateral: 0, index: 0 };
  surface: SurfaceName = 'road';
  /** set when the car hit a wall this tick (for camera shake / SFX) */
  hitWall = 0;
  /** bots use this for difficulty; players stay at 1 */
  maxSpeedMult = 1;
  userData: Record<string, unknown> = {};
  /** summer heat boost: active until this race time, with this top-speed multiplier */
  boostUntil = 0;
  /** set by Hazards when the car keeps slamming into the same obstacle */
  needsRescue = false;
  /** set when the car fell through the lake ice (extra penalty on rescue) */
  fellThrough = false;
  boostMult = 1;
  /** spring petal-chain bonus (set by Hazards) */
  petalMult = 1;
  /** fraction of top speed the engine alone can reach (autumn clogs it) */
  engineCap = 1;
  /** winter snow load 0..1 multipliers (set by Hazards) */
  loadSpeed = 1;
  loadAccel = 1;
  loadSteer = 1;

  constructor(private track: TrackData) {}

  placeAt(t: number, lateral: number) {
    const p = trackPoint(this.track, t, lateral);
    this.x = this.px = p.x;
    this.z = this.pz = p.z;
    this.heading = this.pheading = p.heading;
    this.vx = this.vz = this.speed = 0;
    this.trackPos = queryTrack(this.track, this.x, this.z);
  }

  respawn(lateral = 0) {
    this.needsRescue = false;
    this.placeAt(this.trackPos.t, lateral);
  }

  /**
   * @param surf ground surface under the car (decided by Hazards)
   * @param ax,az extra world-space acceleration (wind gusts, hydroplane nudge)
   */
  step(input: InputState, dt: number, surf: Surface = SURFACES.road, ax = 0, az = 0) {
    this.px = this.x;
    this.pz = this.z;
    this.pheading = this.heading;
    this.hitWall = 0;

    // 1. Steering first (authority from the current forward speed).
    const fwd0 = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    const speedFrac = Math.min(1, Math.abs(fwd0) / CAR.maxSpeed);
    const authority =
      Math.min(1, Math.abs(fwd0) / CAR.steerFullSpeed) * (1 - CAR.steerHighSpeedLoss * speedFrac) * surf.steerMult * this.loadSteer;
    this.heading -= input.steer * CAR.steerRate * authority * Math.sign(fwd0) * dt;

    // 2. Split the (unchanged) world velocity into the NEW heading frame.
    // Whatever doesn't line up with the nose becomes sideways velocity, and grip
    // decides how fast that is killed: high grip = car follows its nose,
    // low grip (ice, leaves, water) = car keeps sliding the old way.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);
    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * rx + this.vz * rz;

    const maxF = CAR.maxSpeed * surf.maxSpeedMult * this.maxSpeedMult * this.boostMult * this.petalMult * this.loadSpeed;
    const maxR = -CAR.maxSpeed * CAR.reverseFrac;

    // 3. Throttle / brake / reverse
    if (input.throttle > 0) {
      if (fwd < 0) fwd += CAR.brakeDecel * surf.brakeMult * input.throttle * dt; // braking out of reverse
      else if (fwd < maxF * this.engineCap) fwd = Math.min(maxF * this.engineCap, fwd + CAR.accel * surf.accelMult * this.loadAccel * this.petalMult * (this.boostMult > 1 ? BOOST.accelMult : 1) * input.throttle * dt);
    }
    if (input.brake > 0) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - CAR.brakeDecel * surf.brakeMult * input.brake * dt);
      else if (fwd > maxR) fwd = Math.max(maxR, fwd - CAR.accel * 0.6 * input.brake * dt);
    }

    // Pulled down to a lowered max speed (mud, grass, snow).
    if (fwd > maxF) fwd -= (fwd - maxF) * CAR.overSpeedPull * dt;

    // 4. Grip: turn part of the sideways velocity back into the nose direction
    // (tyres redirect momentum), the rest scrubs off.
    // Speed is preserved (minus a little scrub), never gained.
    const kill = Math.min(1, surf.grip * dt * CAR.gripK);
    if (kill > 0 && lat !== 0) {
      const total = Math.hypot(fwd, lat) * (1 - 0.15 * kill * Math.min(1, Math.abs(lat) / (Math.abs(fwd) + 1)));
      lat *= 1 - kill;
      const f = Math.sqrt(Math.max(0, total * total - lat * lat));
      fwd = fwd >= 0 ? Math.min(Math.max(fwd, 0) + (f - Math.abs(fwd)), f) : -f;
    }

    // 5. Drag
    fwd *= 1 - CAR.drag * surf.dragMult * dt;
    if (input.throttle === 0 && input.brake === 0 && Math.abs(fwd) < 0.3 && Math.abs(lat) < 0.3) fwd = lat = 0;

    const nfx = fx, nfz = fz;
    this.vx = fx * fwd + rx * lat + ax * dt;
    this.vz = fz * fwd + rz * lat + az * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 5. Walls
    this.trackPos = queryTrack(this.track, this.x, this.z, this.trackPos.index);
    const limit = TRACK.wallOffset - CAR.radius;
    const latPos = this.trackPos.lateral;
    // The frozen lake's shore has no wall: you can drive straight out onto the ice.
    if (Math.abs(latPos) > limit && !(latPos > 0 && lakeShoreOpen(this.x, this.z))) {
      const s = this.track.samples[this.trackPos.index];
      const push = Math.abs(latPos) - limit;
      const sign = Math.sign(latPos); // + = left side
      this.x -= s.nx * sign * push;
      this.z -= s.nz * sign * push;
      // Remove velocity going into the wall, then lose speed.
      const into = (this.vx * s.nx + this.vz * s.nz) * sign;
      if (into > 0) {
        this.vx -= s.nx * sign * into;
        this.vz -= s.nz * sign * into;
      }
      // A real hit costs 40%; scraping along the wall is just friction.
      const keep = into > 3 ? 1 - CAR.wallSpeedLoss : 1 - 1.5 * dt;
      // Nudge the nose back along the wall so the car never sticks nose-first.
      const dir = Math.cos(this.heading - Math.atan2(s.tx, s.tz)) >= 0 ? 0 : Math.PI;
      let d = Math.atan2(s.tx, s.tz) + dir - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, (into > 3 ? 0.35 : 4 * dt));
      this.vx *= keep;
      this.vz *= keep;
      this.hitWall = into;
      this.trackPos = queryTrack(this.track, this.x, this.z, this.trackPos.index);
    }

    this.speed = this.vx * nfx + this.vz * nfz;
  }

  /** Recompute track position after the car was moved from outside (network). */
  syncTrackPos() {
    this.trackPos = queryTrack(this.track, this.x, this.z, this.trackPos.index);
  }
}
