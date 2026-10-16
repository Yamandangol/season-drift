// Autumn's reflex test: branches fall from the trees just ahead of approaching cars.
// A growing shadow on the road warns where it will land (~1.1 s), then it lies on
// the road as a solid obstacle for a while and is cleared.
//
// Pure logic, shared so the server can run the same thing in Phase 2.

import { CAR } from './constants';
import { seasonToT, type TrackData } from './track';

export const FALL = {
  /** season-local positions in autumn where trees can drop branches */
  dropPoints: [0.16, 0.45, 0.58, 0.84, 0.95],
  /** trigger when a car is this many seconds from the drop point */
  triggerSeconds: 1.6,
  minTriggerUnits: 22,
  /** warning (shadow) time before impact */
  warnSeconds: 1.1,
  /** how long it lies on the road */
  downSeconds: 9,
  /** re-arm delay after it's cleared */
  cooldownSeconds: 6,
  /** branch length across the road (units) */
  length: 7,
  /** branch lands centred this close to the triggering car's line */
  aimJitter: 1.8,
  maxCentre: 5.5,
} as const;

export type FallPhase = 'idle' | 'falling' | 'down' | 'cooldown';

export interface FallingBranch {
  id: number;
  /** world t of the drop point (recomputed when seasons shift) */
  t: number;
  phase: FallPhase;
  /** lateral centre where it lands */
  lat: number;
  /** race-clock times */
  startAt: number;
  landAt: number;
  clearAt: number;
  /** random yaw wobble for visuals */
  spin: number;
}

export interface CarProbe {
  t: number;
  lateral: number;
  speed: number;
}

export class FallingBranches {
  branches: FallingBranch[];
  onLand: (b: FallingBranch) => void = () => {};
  onStart: (b: FallingBranch) => void = () => {};

  constructor(private track: TrackData, offset = 0, private rand: () => number = Math.random) {
    this.branches = FALL.dropPoints.map((s, id) => ({
      id,
      t: seasonToT(2, s, offset),
      phase: 'idle' as FallPhase,
      lat: 0,
      startAt: 0,
      landAt: 0,
      clearAt: 0,
      spin: 0,
    }));
  }

  setOffset(offset: number) {
    FALL.dropPoints.forEach((s, i) => (this.branches[i].t = seasonToT(2, s, offset)));
  }

  reset() {
    for (const b of this.branches) b.phase = 'idle';
  }

  /** Lateral half-extent of a landed branch. */
  static half(): number {
    return FALL.length / 2;
  }

  update(now: number, cars: CarProbe[]) {
    const len = this.track.length;
    for (const b of this.branches) {
      switch (b.phase) {
        case 'idle': {
          for (const c of cars) {
            let ahead = (b.t - c.t) * len; // units until the drop point
            if (ahead < -len / 2) ahead += len;
            const reach = Math.max(FALL.minTriggerUnits, Math.abs(c.speed) * FALL.triggerSeconds);
            if (ahead > 4 && ahead < reach) {
              b.phase = 'falling';
              b.startAt = now;
              b.landAt = now + FALL.warnSeconds;
              const aim = c.lateral + (this.rand() * 2 - 1) * FALL.aimJitter;
              b.lat = Math.max(-FALL.maxCentre, Math.min(FALL.maxCentre, aim));
              b.spin = (this.rand() * 2 - 1) * 0.5;
              this.onStart(b);
              break;
            }
          }
          break;
        }
        case 'falling':
          if (now >= b.landAt) {
            b.phase = 'down';
            b.clearAt = now + FALL.downSeconds;
            this.onLand(b);
          }
          break;
        case 'down':
          if (now >= b.clearAt) {
            b.phase = 'cooldown';
            b.clearAt = now + FALL.cooldownSeconds;
          }
          break;
        case 'cooldown':
          if (now >= b.clearAt) b.phase = 'idle';
          break;
      }
    }
  }

  /** Solid branches right now (for collisions + bot avoidance). */
  solid(): FallingBranch[] {
    return this.branches.filter((b) => b.phase === 'down');
  }

  /** Branches that are down or about to land (bots plan around both). */
  threats(): FallingBranch[] {
    return this.branches.filter((b) => b.phase === 'down' || b.phase === 'falling');
  }
}

/** Collision reach along the road for a branch (units). */
export const BRANCH_REACH = CAR.radius + 0.7;
