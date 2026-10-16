import { inStartZone, type Season } from '@shared/track';
// Season hazard *logic* for every car (players and bots). Visuals live in render/.

import { BOOST, CAR, GUST, HAZARD, HEAT, SAIL, sailFactor, SURFACES, type Surface } from '@shared/constants';
import { HazardMap } from '@shared/hazards';
import { FallingBranches, type CarProbe } from '@shared/fallingBranches';
import { queryTrack, seasonAt, trackPoint, type TrackData } from '@shared/track';
import { LAKE, lakeEdgePush, onLake } from '@shared/lake';
import { Clouds, SUN } from '@shared/clouds';
import { LeafWaves, WAVE } from '@shared/leafwaves';
import { onHeater, SNOWLOAD } from '@shared/winter';
import { PETAL, PETALS, petalBonus, petalT } from '@shared/petals';
import type { InputState } from '../input/Input';
import type { Car } from './Car';

export type HazardEvent = 'petal' | 'chainBreak' | 'leafKick' | 'blinded' | 'heater' | 'boost' | 'lake' | 'crack' | 'iceBreak' | 'mud' | 'splash' | 'hydroplane' | 'branch' | 'snowHit' | 'heatWarn' | 'stall' | 'ice' | 'snow' | 'leaves' | 'leafWave';

export interface Gust {
  /** the wind direction this gust brings (relative to the road, degrees) */
  nextRel: number;
  startAt: number; // race-clock seconds when the push starts (warning is GUST.warn before)
  duration: number;
  dirX: number;
  dirZ: number;
  strength: number;
}

export interface HazardCarState {
  heat: number; // 0..100
  heatWarned: boolean;
  hydroplaning: boolean;
  /** which way the current aquaplane slide pushes (+1/-1) */
  slideSide: number;
  inShade: boolean;
  /** autumn: current sail efficiency 0..~1.1 (for HUD / bots) */
  sail: number;
  /** winter lake: how cracked the ice under you is (0..1); 1 = you fall through */
  crack: number;
  onLake: boolean;
  /** winter: snow piled on the car 0..1 */
  snow: number;
  onHeater: boolean;
  warming: boolean;
  /** spring: current petal chain length and the petals already taken this pass */
  chain: number;
  petalGot: number[];
  chainFade: number;
  lastT: number;
  /** autumn: seconds of leaves still blocking your view (kicked up by the car ahead) */
  blind: number;
  /** seconds of leaf-wave cover left (screen only, doesn't confuse bots) */
  wave: number;
  /** last surface event, so we only fire enter-events once */
  lastSurface: string;
}

export function newHazardState(): HazardCarState {
  return { heat: 0, heatWarned: false, hydroplaning: false, slideSide: 1, inShade: false, sail: 0, crack: 0, onLake: false, snow: 0, onHeater: false, warming: false, chain: 0, petalGot: [], chainFade: 0, lastT: -1, blind: 0, wave: 0, lastSurface: 'road' };
}

/** Autumn sailing was replaced by the leaf-kick; flip to bring it back. */
export const SAIL_ON = false;
/** Autumn wind gusts (sideways shoves + arrow) — removed; flip to bring them back. */
export const GUSTS_ON = false;

export class Hazards {
  map: HazardMap;
  falling: FallingBranches;
  clouds: Clouds;
  waves: LeafWaves;
  gust: Gust | null = null;
  private nextGustAt = 0;
  /** autumn wind: downwind direction relative to the road (degrees) */
  windRel = 90;
  private windIdx = 0;
  onEvent: (car: Car, e: HazardEvent) => void = () => {};
  private now = 0;

  constructor(private track: TrackData, offset = 0) {
    this.map = new HazardMap(track.length, offset);
    this.falling = new FallingBranches(track, offset);
    this.clouds = new Clouds(track, offset);
    this.waves = new LeafWaves(track, offset);
  }

  reset(now: number) {
    this.gust = null;
    this.falling.reset();
    this.windIdx = Math.floor(Math.random() * SAIL.windRel.length);
    this.windRel = SAIL.windRel[this.windIdx];
    this.nextGustAt = now + GUST.minGap;
  }

  /** Client-timed gusts (Phase 2 moves this to the server). */
  updateGusts(now: number) {
    this.clouds.update(now);
    this.waves.update(now);
    if (this.gust && now >= this.gust.startAt) this.windRel = this.gust.nextRel; // the gust brings the new wind
    if (this.gust && now > this.gust.startAt + this.gust.duration) this.gust = null;
    if (GUSTS_ON && !this.gust && now >= this.nextGustAt - GUST.warn) {
      // A gust: 1 s warning showing the NEW wind direction, then a strong blow, then it settles.
      this.windIdx = (this.windIdx + 1 + Math.floor(Math.random() * 3)) % SAIL.windRel.length;
      const autumnMid = this.track.samples[Math.floor(this.track.samples.length * ((2 + this.map.offset) % 4 + 0.5) / 4)];
      const side = Math.random() < 0.5 ? 1 : -1;
      this.gust = {
        nextRel: SAIL.windRel[this.windIdx],
        startAt: this.nextGustAt,
        duration: GUST.duration,
        dirX: autumnMid.nx * side,
        dirZ: autumnMid.nz * side,
        strength: GUST.accel,
      };
      this.nextGustAt += GUST.duration + GUST.minGap + Math.random() * (GUST.maxGap - GUST.minGap);
    }
  }

  /** World-space downwind direction at track position t (wind follows the road's frame). */
  windDir(t: number, rel = this.windRel): { x: number; z: number; heading: number } {
    const s = this.track.samples[Math.floor((((t % 1) + 1) % 1) * this.track.samples.length) % this.track.samples.length];
    const heading = Math.atan2(s.tx, s.tz) + (rel * Math.PI) / 180;
    return { x: Math.sin(heading), z: Math.cos(heading), heading };
  }

  /** 0..1 warning ramp before a gust; 1 while it's blowing. */
  gustPhase(now: number): { warning: number; active: boolean } {
    const g = this.gust;
    if (!g) return { warning: 0, active: false };
    if (now >= g.startAt) return { warning: 1, active: now < g.startAt + g.duration };
    return { warning: Math.max(0, 1 - (g.startAt - now) / GUST.warn), active: false };
  }

  /**
   * Called every tick before physics. Mutates the input (stall) and returns the
   * surface + external accel for Car.step.
   */
  pre(car: Car, st: HazardCarState, input: InputState, dt: number, now: number): {
    input: InputState;
    surf: Surface;
    ax: number;
    az: number;
  } {
    const { t, lateral } = car.trackPos;
    const season: Season | 'none' = inStartZone(t, this.track.length) ? 'none' : seasonAt(t, this.map.offset);
    let ax = 0, az = 0;

    // ---- Surface
    let name = this.map.surfaceAt(t, lateral);
    const speedFrac = Math.abs(car.speed) / CAR.maxSpeed;
    const wasHydro = st.hydroplaning;
    st.hydroplaning = false;
    if (name === 'puddle') {
      if (speedFrac > HAZARD.hydroplaneSpeedFrac) {
        st.hydroplaning = true;
        // Aquaplane: one consistent sideways slide per puddle, plus a wobble.
        if (!wasHydro) st.slideSide = Math.random() < 0.5 ? -1 : 1;
        const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
        const k = (st.slideSide + (Math.random() - 0.5)) * HAZARD.hydroplaneNudge;
        ax += rx * k;
        az += rz * k;
        // Total loss of control: the car spins on the water and ignores the driver.
        car.heading += st.slideSide * HAZARD.hydroplaneSpin * dt;
        input = { ...input, steer: 0, throttle: 0, brake: 0 };
      } else {
        name = 'road'; // slow = harmless
      }
    }
    // Frozen lake (off the road, inside the winter corner)
    st.onLake = Math.abs(lateral) > 9 && onLake(car.x, car.z);
    if (st.onLake) name = 'lakeIce';
    car.surface = name;
    if (name !== st.lastSurface) {
      if (name === 'lakeIce') this.onEvent(car, 'lake');
      if (name === 'mud') this.onEvent(car, 'mud');
      else if (name === 'puddle') this.onEvent(car, 'hydroplane');
      else if (name === 'ice') this.onEvent(car, 'ice');
      else if (name === 'snow') this.onEvent(car, 'snow');
      else if (name === 'leaves') this.onEvent(car, 'leaves');
      st.lastSurface = name;
    }

    // ---- Heat (summer)
    st.inShade = this.map.inShade(t, lateral) || (season === 'summer' && this.clouds.covers(car.x, car.z));
    const stalled = now < car.stalledUntil;
    if (!stalled) {
      if (season === 'summer' && !st.inShade) st.heat += (SUN.gain + SUN.gainThrottle * input.throttle) * (1 + SUN.chainHeat * Math.min(st.chain, 12)) * dt; // the sun cooks you (a spring petal boost carried into summer runs hotter)
      else if (st.inShade) { if (Math.abs(car.speed) < SUN.coolSpeed) st.heat -= SUN.cool * dt; } // shade only cools you when you slow down
      else st.heat -= HEAT.coolOff * dt;
      st.heat = Math.max(0, st.heat);
      if (st.heat >= HEAT.warn && !st.heatWarned) {
        st.heatWarned = true;
        this.onEvent(car, 'heatWarn');
      }
      if (st.heat < HEAT.warn - 10) st.heatWarned = false;
      if (st.heat >= 100) {
        car.stalledUntil = now + HEAT.stallSeconds;
        st.heat = HEAT.afterStall;
        st.heatWarned = false;
        this.onEvent(car, 'stall');
      }
    }
    // Stalled: no throttle, and the dead engine drags the car down.
    if (now < car.stalledUntil) input = { ...input, throttle: 0, brake: Math.max(input.brake, HEAT.stallDrag) };

    // ---- Heat boost: spend stored heat as speed (hotter = longer; red-line = faster)
    if (false && input.item && now >= car.stalledUntil && now >= car.boostUntil && st.heat >= BOOST.minHeat) { // boost retired: summer is about clouds now
      const red = st.heat >= BOOST.redLineHeat;
      car.boostUntil = now + BOOST.baseSeconds + BOOST.perHeatSeconds * (st.heat / 100);
      car.boostMult = BOOST.speedMult + (red ? BOOST.redLineBonus : 0);
      st.heat = 0;
      st.heatWarned = false;
      this.onEvent(car, 'boost');
    }
    if (now < car.boostUntil && input.brake === 0) input = { ...input, throttle: 1 };
    else car.boostMult = 1;

    // ---- Autumn: sailing. The engine is clogged with leaves; the wind drives you.
    st.sail = 0;
    car.engineCap = 1;
    if (SAIL_ON && season === 'autumn') {
      const boosting = now < car.boostUntil; // carried summer heat powers through
      if (!boosting) car.engineCap = SAIL.engineCap;
      const w = this.windDir(t);
      let a = ((car.heading - w.heading) * 180) / Math.PI;
      a = ((a % 360) + 540) % 360 - 180;
      const gusting = !!this.gust && now >= this.gust.startAt && now < this.gust.startAt + this.gust.duration;
      const strength = gusting ? SAIL.gustStrength : 1;
      st.sail = sailFactor(a) * strength;
      const fwd = Math.max(0, car.speed);
      const thrust = SAIL.accel * st.sail * Math.max(0, 1 - fwd / (CAR.maxSpeed * car.maxSpeedMult * SAIL.topFrac));
      ax += Math.sin(car.heading) * thrust + w.x * SAIL.leeway * strength;
      az += Math.cos(car.heading) * thrust + w.z * SAIL.leeway * strength;
    }

    // ---- Spring: the petal chain
    {
      const len = this.track.length;
      let dT = t - st.lastT;
      if (dT < -0.5) dT += 1;
      if (st.lastT >= 0 && dT > 0 && dT < 0.02) {
        PETALS.forEach((p, i) => {
          const pt = petalT(p, this.map.offset);
          let a = pt - st.lastT;
          if (a < 0) a += 1;
          if (a > dT || a === 0) return; // not crossed this tick
          if (Math.abs(lateral - p.lat) < PETAL.radius) {
            st.chain++;
            st.petalGot.push(i);
            this.onEvent(car, 'petal');
          } else if (st.chain > 0) {
            st.chain = 0;
            this.onEvent(car, 'chainBreak');
          }
        });
      }
      st.lastT = t;
      if (season !== 'spring') {
        st.petalGot.length = 0;
        if (st.chain > 0) {
          st.chainFade += dt;
          if (st.chainFade >= PETAL.fadeSeconds) { st.chain--; st.chainFade = 0; }
        }
      } else st.chainFade = 0;
      car.petalMult = petalBonus(st.chain);
      void len;
    }
    st.blind = Math.max(0, st.blind - dt);
    // Autumn leaf waves: a curtain of leaves over the screen
    st.wave = Math.max(0, st.wave - dt);
    if (season === 'autumn' && this.waves.covers(car.x, car.z)) {
      if (st.wave < 0.1) this.onEvent(car, 'leafWave');
      st.wave = WAVE.cover;
    }

    // ---- Autumn gusts: a real shove in the arrow's direction while a gust blows
    if (!SAIL_ON && season === 'autumn' && this.gust && now >= this.gust.startAt && now < this.gust.startAt + this.gust.duration) {
      const w = this.windDir(t);
      ax += w.x * GUST.accel * 0.6;
      az += w.z * GUST.accel * 0.6;
    }

    // ---- Winter: snow piles up on the car; heater pads melt it off
    st.onHeater = season === 'winter' && onHeater(t, lateral, this.track.length, this.map.offset);
    st.warming = st.onHeater && Math.abs(car.speed) < SNOWLOAD.stopSpeed;
    if (st.onHeater) {
      // driving over a pad does nothing: you have to stop and sit on it
      if (st.warming) {
        if (st.snow > 0.05 && Math.random() < dt * 4) this.onEvent(car, 'heater');
        st.snow -= SNOWLOAD.heater * dt;
      } else st.snow += SNOWLOAD.fall * dt;
    } else if (season === 'winter') {
      st.snow += (SNOWLOAD.fall + (name === 'snow' ? SNOWLOAD.drift : 0) + (st.onLake ? SNOWLOAD.lake : 0)) * dt;
    } else {
      st.snow -= SNOWLOAD.melt * dt;
    }
    st.snow = Math.max(0, Math.min(1, st.snow));
    car.loadSpeed = 1 - (1 - SNOWLOAD.speedAtFull) * st.snow;
    car.loadAccel = 1 - (1 - SNOWLOAD.accelAtFull) * st.snow;
    car.loadSteer = 1 - (1 - SNOWLOAD.steerAtFull) * st.snow;

    // ---- Thin ice: slow cars crack the lake and fall through
    if (st.onLake) {
      const was = st.crack;
      if (Math.abs(car.speed) < LAKE.crackSpeed) st.crack += dt / LAKE.crackSeconds;
      else st.crack = Math.max(0, st.crack - LAKE.healRate * dt);
      if (was < 0.25 && st.crack >= 0.25) this.onEvent(car, 'crack');
      if (st.crack >= 1) {
        st.crack = 0;
        car.needsRescue = true;
        car.fellThrough = true;
        this.onEvent(car, 'iceBreak');
      }
    } else {
      st.crack = Math.max(0, st.crack - 2 * dt);
    }

    return { input, surf: SURFACES[name], ax, az };
  }

  /** Falling branches (call once per tick with every car). */
  updateFalling(now: number, cars: CarProbe[]) {
    this.falling.update(now, cars);
  }

  /** last branch hit per car: after a hit you only get pushed out, no repeat bounce */
  private lastHit = new WeakMap<Car, number>();
  private hitLog = new WeakMap<Car, number[]>();

  /** Remember a solid hit; 3 hits in 4 s means the car is pinned and needs rescuing. */
  private noteHit(car: Car) {
    const log = (this.hitLog.get(car) ?? []).filter((t) => this.now - t < 4);
    log.push(this.now);
    this.hitLog.set(car, log);
    if (log.length >= 3) {
      car.needsRescue = true;
      this.hitLog.set(car, []);
    }
  }

  /** After physics: solid obstacles (fixed logs + fallen branches). */
  post(car: Car, now = 0) {
    this.now = now;
    for (const h of this.map.placed) {
      if (h.type === 'branch') this.collideLog(car, (h.t0 + h.t1) / 2, h.lat0, h.lat1);
    }
    const half = FallingBranches.half();
    for (const b of this.falling.solid()) this.collideLog(car, b.t, b.lat - half, b.lat + half);
    this.collideSnow(car);
    this.collideLakeEdge(car);
  }

  /** Snowbanks along the lake's straight edges keep you out of the woods. */
  private collideLakeEdge(car: Car) {
    if (car.trackPos.lateral < 9) return;
    const p = lakeEdgePush(car.x, car.z);
    if (!p) return;
    car.x += p.dx;
    car.z += p.dz;
    const out = car.vx * p.nx + car.vz * p.nz;
    if (out > 0) {
      car.vx -= p.nx * out * 1.3;
      car.vz -= p.nz * out * 1.3;
      car.vx *= HAZARD.shoreKeep;
      car.vz *= HAZARD.shoreKeep;
      car.hitWall = Math.max(car.hitWall, out);
    }
    car.trackPos = queryTrack(this.track, car.x, car.z, car.trackPos.index);
  }

  /** Snow drifts: the packed core of each heap is solid; the soft rim just slows you (surface). */
  private collideSnow(car: Car) {
    const hit = this.map.solidSnowAt(car.trackPos.t, car.trackPos.lateral);
    if (!hit) return;
    const { h, hp } = hit;
    const tc = (h.t0 + h.t1) / 2 + hp.cu * (h.t1 - h.t0) / 2;
    const lc = (h.lat0 + h.lat1) / 2 + hp.cv * (h.lat1 - h.lat0) / 2;
    const c = trackPoint(this.track, tc, lc);
    let nx = car.x - c.x, nz = car.z - c.z;
    const d = Math.hypot(nx, nz) || 1;
    nx /= d; nz /= d;
    // Step out of the core along the outward direction.
    for (let i = 0; i < 40; i++) {
      car.x += nx * 0.25;
      car.z += nz * 0.25;
      car.trackPos = queryTrack(this.track, car.x, car.z, car.trackPos.index);
      if (!this.map.solidSnowAt(car.trackPos.t, car.trackPos.lateral)) break;
    }
    const into = -(car.vx * nx + car.vz * nz);
    if (into <= 0) return;
    car.vx += nx * into; // kill the motion into the drift
    car.vz += nz * into;
    if (into > 4 && this.now - (this.lastHit.get(car) ?? -9) > 0.6) {
      this.lastHit.set(car, this.now);
      this.noteHit(car);
      const keep = 1 - HAZARD.snowSpeedLoss;
      car.vx *= keep;
      car.vz *= keep;
      car.vx += nx * Math.min(6, into * 0.25); // small bounce back out
      car.vz += nz * Math.min(6, into * 0.25);
      car.hitWall = Math.max(car.hitWall, into);
      this.onEvent(car, 'snowHit');
    }
  }

  private collideLog(car: Car, tc: number, lat0: number, lat1: number) {
    const { t, lateral } = car.trackPos;
    let dt = t - tc;
    if (dt > 0.5) dt -= 1;
    if (dt < -0.5) dt += 1;
    const along = dt * this.track.length; // + = past the branch
    const reach = CAR.radius + HAZARD.branchThickness / 2;
    if (Math.abs(along) > reach) return;
    if (lateral < lat0 - CAR.radius * 0.6 || lateral > lat1 + CAR.radius * 0.6) return;
    this.hitBranch(car, along, reach);
  }

  private hitBranch(car: Car, along: number, reach: number) {
    const s = this.track.samples[car.trackPos.index];
    // Which side did we come from? Use velocity along the tangent.
    const vAlong = car.vx * s.tx + car.vz * s.tz;
    const fromBehind = vAlong >= 0 ? -1 : 1;
    // Push out of the log.
    const pushTo = fromBehind * reach;
    const push = pushTo - along;
    car.x += s.tx * push;
    car.z += s.tz * push;
    if (Math.abs(vAlong) < 2) return; // resting against it, no new hit
    if (this.now - (this.lastHit.get(car) ?? -9) < 0.7) {
      // still scraping along the same log: just stop the forward motion into it
      car.vx -= s.tx * vAlong * 0.9;
      car.vz -= s.tz * vAlong * 0.9;
      return;
    }
    this.lastHit.set(car, this.now);
    this.noteHit(car);
    // Bounce back, lose speed, short spin.
    const keep = 1 - HAZARD.branchSpeedLoss;
    car.vx = car.vx * keep - s.tx * Math.sign(vAlong) * HAZARD.branchBounce;
    car.vz = car.vz * keep - s.tz * Math.sign(vAlong) * HAZARD.branchBounce;
    car.heading += ((Math.random() < 0.5 ? -1 : 1) * HAZARD.branchSpinDeg * Math.PI) / 180;
    car.hitWall = Math.max(car.hitWall, 8);
    this.onEvent(car, 'branch');
  }
}
