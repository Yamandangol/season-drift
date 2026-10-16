// Winter: giant snowballs roll down off the hillside and across the road just ahead of
// approaching cars, growing as they roll. Read the path and dodge: a hit spins you out,
// kills your speed and dumps snow on the car. Same trigger pattern as autumn's branches.

import { seasonToT, type TrackData } from './track';

export const SNOWBALL = {
  /** season-local positions in winter where balls come down */
  points: [0.1, 0.32, 0.46, 0.7, 0.84],
  /** trigger when a car is this many seconds from the crossing point */
  triggerSeconds: 1.9,
  minTriggerUnits: 30,
  /** roll speed across the road (units/s) */
  rollSpeed: 9,
  /** starts / finishes this far from the centre line */
  edge: 15,
  /** radius at the start and the far side */
  r0: 0.9,
  r1: 2.3,
  /** after rolling off the road */
  cooldownSeconds: 7,
  /** what a hit does */
  speedKeep: 0.45,
  spin: 1.3,
  snow: 0.35,
} as const;

export type BallPhase = 'idle' | 'rolling' | 'cooldown';

export interface Snowball {
  id: number;
  t: number;
  phase: BallPhase;
  startAt: number;
  until: number;
  /** +1 rolls from the right edge to the left, -1 the other way */
  dir: number;
  lat: number;
  r: number;
  /** cars it already hit (one hit per car per ball) */
  hit: Set<unknown>;
}

export interface BallProbe {
  t: number;
  lateral: number;
  speed: number;
}

export class Snowballs {
  balls: Snowball[];
  onStart: (b: Snowball) => void = () => {};

  constructor(private track: TrackData, offset = 0, private rand: () => number = Math.random) {
    this.balls = SNOWBALL.points.map((s, id) => ({ id, t: seasonToT(3, s, offset), phase: 'idle' as BallPhase, startAt: 0, until: 0, dir: 1, lat: 0, r: SNOWBALL.r0, hit: new Set() }));
  }

  setOffset(offset: number) {
    SNOWBALL.points.forEach((s, i) => (this.balls[i].t = seasonToT(3, s, offset)));
  }

  reset() {
    for (const b of this.balls) { b.phase = 'idle'; b.hit.clear(); }
  }

  update(now: number, cars: BallProbe[]) {
    const len = this.track.length;
    const cross = (SNOWBALL.edge * 2) / SNOWBALL.rollSpeed;
    for (const b of this.balls) {
      if (b.phase === 'idle') {
        for (const c of cars) {
          let ahead = (b.t - c.t) * len;
          if (ahead < -len / 2) ahead += len;
          const reach = Math.max(SNOWBALL.minTriggerUnits, Math.abs(c.speed) * SNOWBALL.triggerSeconds);
          if (ahead > 6 && ahead < reach) {
            b.phase = 'rolling';
            b.startAt = now;
            b.until = now + cross;
            b.dir = this.rand() < 0.5 ? 1 : -1;
            b.hit.clear();
            this.onStart(b);
            break;
          }
        }
      } else if (b.phase === 'rolling') {
        const k = Math.min(1, (now - b.startAt) / cross);
        b.lat = b.dir * SNOWBALL.edge * (1 - 2 * k);
        b.r = SNOWBALL.r0 + (SNOWBALL.r1 - SNOWBALL.r0) * k;
        if (now >= b.until) { b.phase = 'cooldown'; b.until = now + SNOWBALL.cooldownSeconds; }
      } else if (now >= b.until) b.phase = 'idle';
    }
  }

  rolling(): Snowball[] {
    return this.balls.filter((b) => b.phase === 'rolling');
  }
}
