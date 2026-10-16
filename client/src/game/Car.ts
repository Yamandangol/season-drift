// Arcade car physics on the XZ plane. Local car only (remote cars are interpolated).
// Heading convention: forward = (sin h, cos h), right = (-cos h, sin h).

import { CAR, SURFACES, TRACK, type Surface, type SurfaceName } from '@shared/constants';
import { queryTrack, trackPoint, type TrackData, type TrackPos } from '@shared/track';
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

  constructor(private track: TrackData) {}

  placeAt(t: number, lateral: number) {
    const p = trackPoint(this.track, t, lateral);
    this.x = this.px = p.x;
    this.z = this.pz = p.z;
    this.heading = this.pheading = p.heading;
    this.vx = this.vz = this.speed = 0;
    this.trackPos = queryTrack(this.track, this.x, this.z);
  }

  respawn() {
    this.placeAt(this.trackPos.t, 0);
  }

  step(input: InputState, dt: number) {
    this.px = this.x;
    this.pz = this.z;
    this.pheading = this.heading;
    this.hitWall = 0;

    // Surface (Phase 1 adds hazards on top of this).
    const halfRoad = TRACK.roadWidth / 2;
    this.surface = Math.abs(this.trackPos.lateral) > halfRoad ? 'grass' : 'road';
    const surf: Surface = SURFACES[this.surface];

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);

    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * rx + this.vz * rz;

    const maxF = CAR.maxSpeed * surf.maxSpeedMult;
    const maxR = -CAR.maxSpeed * CAR.reverseFrac;

    // 1. Throttle / brake / reverse
    if (input.throttle > 0) {
      if (fwd < 0) fwd += CAR.brakeDecel * surf.brakeMult * input.throttle * dt; // braking out of reverse
      else if (fwd < maxF) fwd = Math.min(maxF, fwd + CAR.accel * input.throttle * dt);
    }
    if (input.brake > 0) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - CAR.brakeDecel * surf.brakeMult * input.brake * dt);
      else if (fwd > maxR) fwd = Math.max(maxR, fwd - CAR.accel * 0.6 * input.brake * dt);
    }

    // Pulled down to a lowered max speed (mud, grass, snow).
    if (fwd > maxF) fwd -= (fwd - maxF) * CAR.overSpeedPull * dt;

    // 2. Steering: scales with speed, a bit less at the top end.
    const speedFrac = Math.min(1, Math.abs(fwd) / CAR.maxSpeed);
    const authority =
      Math.min(1, Math.abs(fwd) / CAR.steerFullSpeed) * (1 - CAR.steerHighSpeedLoss * speedFrac) * surf.steerMult;
    this.heading -= input.steer * CAR.steerRate * authority * Math.sign(fwd) * dt;

    // 3. Grip: kill part of the sideways velocity. Low grip = sliding.
    lat *= Math.max(0, 1 - surf.grip * dt * CAR.gripK);

    // 4. Drag
    fwd *= 1 - CAR.drag * surf.dragMult * dt;
    if (input.throttle === 0 && input.brake === 0 && Math.abs(fwd) < 0.3) fwd = 0;

    // Recompose velocity in the (new) heading frame. Lateral velocity carries
    // over from the old frame, which is what makes slides feel right.
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -Math.cos(this.heading), nrz = Math.sin(this.heading);
    this.vx = nfx * fwd + nrx * lat;
    this.vz = nfz * fwd + nrz * lat;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 5. Walls
    this.trackPos = queryTrack(this.track, this.x, this.z, this.trackPos.index);
    const limit = TRACK.wallOffset - CAR.radius;
    const latPos = this.trackPos.lateral;
    if (Math.abs(latPos) > limit) {
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
}
