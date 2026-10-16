// One race: racers, countdown, checkpoints, laps, positions, finish, results.
// Runs every car through the same Car physics + Hazards (players and bots alike).

import * as THREE from 'three';
import { BOT, CAR, RACE, SIM_DT, TRACK, type Difficulty } from '@shared/constants';
import { trackPoint, type TrackData } from '@shared/track';
import type { InputState } from '../input/Input';
import { Car } from './Car';
import { createCarMesh, disposeObject } from './CarMesh';
import { Bot } from './Bots';
import { FallingBranches } from '@shared/fallingBranches';
import { LAKE } from '@shared/lake';
import type { CarSnap } from '@shared/protocol';
import { newHazardState, type HazardCarState, type Hazards } from './Hazards';

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RacerConfig {
  id: string;
  name: string;
  color: number;
  /** local = driven on this device; bot = AI on this device; remote = mirrored from the network */
  kind: 'local' | 'bot' | 'remote';
  /** local players: which input slot (0 = WASD / pad 1, 1 = arrows / pad 2); undefined = all keys */
  slot?: number;
  /** a person (local or remote), not a bot */
  human?: boolean;
}

export interface Racer extends RacerConfig {
  car: Car;
  mesh: THREE.Group;
  hz: HazardCarState;
  bot?: Bot;
  /** laps completed; -1 before first crossing the start line */
  completed: number;
  /** checkpoints passed this lap (0..3) */
  cp: number;
  prevT: number;
  lapStart: number;
  lapTimes: number[];
  finished: boolean;
  finishTime: number;
  frozenUntil: number;
  stuckTime: number;
  place: number;
  /** remote racers: latest network snapshot and when it arrived (race clock) */
  snap?: CarSnap;
  snapAt?: number;
}

export interface Standing {
  id: string;
  name: string;
  color: number;
  place: number;
  finished: boolean;
  totalTime: number;
  lapTimes: number[];
}

/** Autumn leaf-kick tuning. */
export const LEAF_KICK = { minSpeed: 12, range: 32, width: 5.5, seconds: 1.8 } as const;

const NO_INPUT: InputState = { throttle: 0, brake: 0, steer: 0, item: false, respawn: false, pause: false };

export class Race {
  racers: Racer[] = [];
  phase: RacePhase = 'countdown';
  /** race clock in seconds since the race was created */
  now = 0;
  /** race clock time of "GO" */
  readonly startAt = RACE.countdown;
  firstFinishAt = -1;
  standings: Standing[] = [];
  onLap: (r: Racer, lap: number) => void = () => {};
  onFinish: (r: Racer) => void = () => {};
  onResults: (s: Standing[]) => void = () => {};

  constructor(
    private track: TrackData,
    private hazards: Hazards,
    private scene: THREE.Scene,
    configs: RacerConfig[],
    private difficulty: Difficulty,
  ) {
    const len = track.length;
    configs.forEach((cfg, i) => {
      const car = new Car(track);
      const row = Math.floor(i / 2);
      const col = i % 2;
      const t = 1 - (8 + row * 9) / len;
      car.placeAt(t, col === 0 ? 4 : -4);
      const mesh = createCarMesh(cfg.color);
      scene.add(mesh);
      const r: Racer = {
        ...cfg,
        car,
        mesh,
        hz: newHazardState(),
        completed: -1,
        cp: 3,
        prevT: car.trackPos.t,
        lapStart: this.startAt,
        lapTimes: [],
        finished: false,
        finishTime: 0,
        frozenUntil: 0,
        stuckTime: 0,
        place: i + 1,
      };
      if (cfg.kind === 'bot') {
        // small per-bot spread so the pack strings out
        car.maxSpeedMult = BOT.difficulty[difficulty] * (0.97 + Math.random() * 0.06);
        car.userData = { baseMult: car.maxSpeedMult };
        r.bot = new Bot(track, hazards, difficulty, (Math.random() * 2 - 1) * 2.5);
      }
      this.racers.push(r);
    });
    hazards.reset(this.startAt);
  }

  get local(): Racer | undefined {
    return this.racers.find((r) => r.kind === 'local');
  }

  get locals(): Racer[] {
    return this.racers.filter((r) => r.kind === 'local');
  }

  /** Snapshot of a racer this device simulates (for the network). */
  snapOf(r: Racer): CarSnap {
    const c = r.car;
    return {
      id: r.id, x: c.x, z: c.z, vx: c.vx, vz: c.vz, h: c.heading, sp: c.speed, surf: c.surface,
      lap: r.completed, cp: r.cp, fin: r.finished, ft: r.finishTime, laps: r.lapTimes,
      heat: r.hz.heat, snow: r.hz.snow, chain: r.hz.chain, stall: Math.max(0, c.stalledUntil - this.now), warm: r.hz.warming,
    };
  }

  /** Apply a snapshot from the network to a remote racer. */
  applySnap(s: CarSnap) {
    const r = this.racers.find((x) => x.id === s.id);
    if (!r || r.kind !== 'remote') return;
    if (!r.snap) { r.car.x = s.x; r.car.z = s.z; r.car.heading = s.h; r.car.px = s.x; r.car.pz = s.z; r.car.pheading = s.h; }
    r.snap = s;
    r.snapAt = this.now;
    r.completed = s.lap;
    r.cp = s.cp;
    r.lapTimes = s.laps;
    if (s.fin && !r.finished) {
      r.finished = true;
      r.finishTime = s.ft;
      if (this.firstFinishAt < 0) this.firstFinishAt = this.now;
    }
    r.hz.heat = s.heat;
    r.hz.snow = s.snow;
    r.hz.chain = s.chain;
    r.hz.warming = s.warm;
    r.car.stalledUntil = this.now + s.stall;
    r.car.surface = s.surf as Car['surface'];
  }

  /** Remote cars: glide toward where the latest snapshot says they are now. */
  private stepRemote(r: Racer, dt: number) {
    const c = r.car;
    c.px = c.x; c.pz = c.z; c.pheading = c.heading;
    const s = r.snap;
    if (!s) return;
    const age = Math.min(0.25, this.now - (r.snapAt ?? this.now));
    const tx = s.x + s.vx * age, tz = s.z + s.vz * age;
    c.x += s.vx * dt; c.z += s.vz * dt;
    c.x += (tx - c.x) * 0.25; c.z += (tz - c.z) * 0.25;
    let dh = s.h - c.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.heading += dh * 0.3;
    c.vx = s.vx; c.vz = s.vz; c.speed = s.sp;
    c.syncTrackPos();
  }

  respawn(r: Racer) {
    const fell = r.car.fellThrough;
    r.car.fellThrough = false;
    r.car.respawn(this.clearLane(r.car.trackPos.t));
    if (fell) r.frozenUntil = this.now + LAKE.fallPenalty; // fished out of the lake: extra wait
    r.hz.heat = Math.min(r.hz.heat, 40);
    r.frozenUntil = Math.max(r.frozenUntil, this.now + RACE.respawnPenalty);
    r.stuckTime = 0;
    r.hz.crack = 0;
    r.hz.heat = Math.min(r.hz.heat, 30);
  }

  /** A lane centre with no log lying across it near t (so a respawn never lands in a branch). */
  private clearLane(t: number): number {
    const len = this.track.length;
    const logs: { t: number; lat0: number; lat1: number }[] = [];
    for (const h of this.hazards.map.placed) if (h.type === 'branch') logs.push({ t: (h.t0 + h.t1) / 2, lat0: h.lat0, lat1: h.lat1 });
    const half = FallingBranches.half();
    for (const b of this.hazards.falling.threats()) logs.push({ t: b.t, lat0: b.lat - half, lat1: b.lat + half });
    for (const lane of [0, -6, 6]) {
      const blocked = logs.some((l) => {
        let d = (l.t - t) * len;
        if (d > len / 2) d -= len;
        if (d < -len / 2) d += len;
        return Math.abs(d) < 8 && lane > l.lat0 - 2.5 && lane < l.lat1 + 2.5;
      });
      const snowy = [-8, -4, 0, 4, 8].some((d) => !!this.hazards.map.solidSnowAt((((t + d / len) % 1) + 1) % 1, lane));
      if (!blocked && !snowy) return lane;
    }
    return 0;
  }

  /** One fixed sim tick. */
  /** @param localInput input for the local player, or one per input slot (split-screen) */
  step(localInput: InputState | InputState[]) {
    const inputs = Array.isArray(localInput) ? localInput : [localInput];
    const dt = SIM_DT;
    this.now += dt;
    if (this.phase === 'countdown' && this.now >= this.startAt) this.phase = 'racing';
    const go = this.now >= this.startAt;
    this.hazards.updateGusts(this.now);
    this.hazards.updateFalling(
      this.now,
      this.racers.map((r) => ({ t: r.car.trackPos.t, lateral: r.car.trackPos.lateral, speed: r.car.speed })),
    );

    this.rubberBand();
    for (const r of this.racers) {
      if (r.kind === 'remote') { this.stepRemote(r, dt); continue; }
      let inp: InputState = NO_INPUT;
      if (go && !r.finished && this.now >= r.frozenUntil) {
        inp = r.kind === 'local' ? (inputs[r.slot ?? 0] ?? NO_INPUT) : r.bot!.input(r.car, r.hz, dt);
      }
      if (r.finished && r.bot === undefined) {
        // Finished players coast to a stop.
        inp = { ...NO_INPUT, brake: r.car.speed > 0.5 ? 1 : 0 }; // stop on the line (and don't start reversing): the race is over, don't roll on into spring
      }

      const env = this.hazards.pre(r.car, r.hz, inp, dt, this.now);
      if (this.now < r.frozenUntil) {
        r.car.vx = r.car.vz = 0;
      }
      r.car.step(env.input, dt, env.surf, env.ax, env.az);
      this.hazards.post(r.car, this.now);

      // Auto-recover anyone who is stuck: barely moving while trying to drive
      // (or, for bots, at all), or crawling the wrong way. No button needed.
      if (go && !r.finished && this.now >= r.frozenUntil) {
        const s = this.track.samples[r.car.trackPos.index];
        const facing = Math.sin(r.car.heading) * s.tx + Math.cos(r.car.heading) * s.tz;
        const trying = r.kind === 'bot' || inp.throttle > 0 || inp.brake > 0;
        const stuck = (Math.abs(r.car.speed) < 4 && trying) || (facing < -0.3 && Math.abs(r.car.speed) < 8);
        r.stuckTime = stuck ? r.stuckTime + dt : 0;
        if (r.stuckTime > RACE.stuckSeconds || r.car.needsRescue) this.respawn(r);
      }
    }

    this.collideCars();
    this.leafKick();
    for (const r of this.racers) if (r.kind !== 'remote') this.updateLap(r); else r.prevT = r.car.trackPos.t;
    this.updatePlaces();
    this.updateFinish();
  }

  /**
   * Autumn leaf-kick: tearing through a leaf pile throws a cloud of leaves out behind you.
   * Anyone following close in your lane can't see for a moment.
   */
  private leafKick() {
    const len = this.track.length;
    for (const r of this.racers) {
      if (r.car.surface !== 'leaves' || r.car.speed < LEAF_KICK.minSpeed) continue;
      for (const o of this.racers) {
        if (o === r || o.finished || o.kind === 'remote') continue; // the remote device works out its own blinding
        let d = (r.car.trackPos.t - o.car.trackPos.t) * len;
        if (d < -len / 2) d += len;
        if (d > len / 2) d -= len;
        if (d < 1 || d > LEAF_KICK.range) continue;
        if (Math.abs(r.car.trackPos.lateral - o.car.trackPos.lateral) > LEAF_KICK.width) continue;
        if (o.hz.blind < 0.4) {
          this.hazards.onEvent(o.car, 'blinded');
          this.hazards.onEvent(r.car, 'leafKick');
        }
        o.hz.blind = LEAF_KICK.seconds;
      }
    }
  }

  private collideCars() {
    const R2 = CAR.radius * 2;
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i].car, b = this.racers[j].car;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= R2 || d === 0) continue;
        const nx = dx / d, nz = dz / d;
        // remote cars are moved by their own device: only push the local side (all of it)
        const ra = this.racers[i].kind === 'remote', rb = this.racers[j].kind === 'remote';
        if (ra && rb) continue;
        const ka = ra ? 0 : rb ? 2 : 1, kb = rb ? 0 : ra ? 2 : 1;
        const push = (R2 - d) / 2;
        a.x -= nx * push * ka; a.z -= nz * push * ka;
        b.x += nx * push * kb; b.z += nz * push * kb;
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const j2 = -rel * 0.6;
          a.vx -= nx * j2 * ka; a.vz -= nz * j2 * ka;
          b.vx += nx * j2 * kb; b.vz += nz * j2 * kb;
          a.hitWall = Math.max(a.hitWall, -rel);
          b.hitWall = Math.max(b.hitWall, -rel);
        }
      }
    }
  }

  private updateLap(r: Racer) {
    const t = r.car.trackPos.t;
    const prev = r.prevT;
    r.prevT = t;
    if (r.finished) return;

    // Checkpoints at t = 0.25, 0.5, 0.75, passed in order.
    if (r.cp < 3) {
      const cpT = (r.cp + 1) * 0.25;
      if (t >= cpT && t < cpT + 0.1) r.cp++;
    }

    if (prev > 0.9 && t < 0.1) {
      // Forward across the line.
      if (r.cp === 3) {
        r.completed++;
        r.cp = 0;
        if (r.completed > 0) {
          r.lapTimes.push(this.now - r.lapStart);
          this.onLap(r, r.completed);
        }
        r.lapStart = this.now;
        if (r.completed >= TRACK.laps) {
          r.finished = true;
          r.finishTime = this.now - this.startAt;
          if (this.firstFinishAt < 0) this.firstFinishAt = this.now;
          this.onFinish(r);
        }
      }
    } else if (prev < 0.1 && t > 0.9) {
      // Reversed back across the line: undo.
      if (r.cp === 0) {
        r.completed--;
        r.cp = 3;
      }
    }
  }

  /** Keep races close: bots well behind the leading human speed up a little, bots far ahead ease off. */
  private rubberBand() {
    const humans = this.racers.filter((r) => r.kind === 'local' || r.human);
    if (!humans.length) return;
    const lead = Math.max(...humans.map((h) => this.progress(h)));
    const k = { easy: 0.6, normal: 1, hard: 1.3 }[this.difficulty];
    for (const r of this.racers) {
      if (r.kind !== 'bot' || r.human || r.finished) continue;
      const base = (r.car.userData?.baseMult as number | undefined) ?? r.car.maxSpeedMult;
      const gap = (lead - this.progress(r)) * this.track.length; // + = bot is behind the human
      const adj = gap > 0 ? Math.min(0.14, (gap / 500) * 0.14) * k : Math.max(-0.08, (gap / 400) * 0.08) / k;
      r.car.maxSpeedMult = base * (1 + adj);
    }
  }

  progress(r: Racer): number {
    if (r.finished) return 1000 - r.finishTime / 1000;
    return r.completed + r.car.trackPos.t;
  }

  private updatePlaces() {
    const sorted = [...this.racers].sort((a, b) => this.progress(b) - this.progress(a));
    sorted.forEach((r, i) => (r.place = i + 1));
  }

  private updateFinish() {
    if (this.phase !== 'racing' || this.firstFinishAt < 0) return;
    const allDone = this.racers.every((r) => r.finished);
    const localDone = this.local ? this.local.finished : true;
    const graceOver = this.now - this.firstFinishAt >= RACE.graceSeconds;
    // In solo, don't make the player wait for slow bots once they're done.
    const humansDone = this.racers.filter((r) => r.kind === 'local' || r.human).every((r) => r.finished);
    if (allDone || graceOver || (localDone && humansDone && this.now - this.firstFinishAt > 3)) {
      this.phase = 'finished';
      this.standings = [...this.racers]
        .sort((a, b) => a.place - b.place)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          place: r.place,
          finished: r.finished,
          totalTime: r.finished ? r.finishTime : 0,
          lapTimes: r.lapTimes,
        }));
      this.onResults(this.standings);
    }
  }

  /** Remaining grace seconds after the first finisher, or -1. */
  graceLeft(): number {
    if (this.firstFinishAt < 0 || this.phase !== 'racing') return -1;
    return Math.max(0, RACE.graceSeconds - (this.now - this.firstFinishAt));
  }

  dispose() {
    for (const r of this.racers) {
      disposeObject(r.mesh);
      r.mesh.removeFromParent();
    }
    this.racers = [];
  }

  /** Interpolated render pose. */
  static pose(car: Car, a: number) {
    let dh = car.heading - car.pheading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return {
      x: car.px + (car.x - car.px) * a,
      z: car.pz + (car.z - car.pz) * a,
      heading: car.pheading + dh * a,
    };
  }

  /** Start grid position for a slot (used for tutorial ghost later). */
  gridPoint(i: number) {
    const row = Math.floor(i / 2);
    return trackPoint(this.track, 1 - (8 + row * 9) / this.track.length, i % 2 === 0 ? 4 : -4);
  }
}
