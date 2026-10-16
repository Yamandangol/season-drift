// Summer: the sun is deadly, clouds are life. Small clouds drift along the summer sector and
// throw moving shadows on the road. Out in the sun your engine overheats in seconds;
// inside a shadow it cools. Positions are a pure function of race time, so every
// player (and the server, later) sees the same clouds.

import { seasonToT, trackPoint, type TrackData } from './track';

export interface CloudDef {
  /** season-local start position (0..1 in summer) */
  s0: number;
  /** drift speed along the road (units / s, + = with the race) */
  speed: number;
  /** lateral centre and how far it sways side to side */
  lat: number;
  sway: number;
  swayHz: number;
  /** shadow radius (units) */
  r: number;
}

/**
 * Small, one-lane clouds in a zig-zag chain. They are too small and too far apart to
 * hit by holding a lane: you have to read the chain and hop lanes from cloud to cloud,
 * or the sun burns your engine out. All drift at the same pace so the chain keeps its shape.
 */
const CHAIN_LANES = [-6.5, 0, 6.5, 0, -6.5, 0, 6.5, 0, -6.5, 0, 6.5, 0, -6.5, 0, 6.5, 0, -6.5, 0]; // left, centre, right, centre... a clean zig-zag
export const CLOUDS: CloudDef[] = CHAIN_LANES.map((lat, i) => ({
  s0: i / CHAIN_LANES.length,
  speed: 6,
  lat,
  sway: 0.8,
  swayHz: 0.07 + (i % 3) * 0.02,
  r: 4.8,
}));

export const SUN = {
  /** heat gained per second in direct summer sun (+ extra with throttle): ~2.4 s to burn out */
  gain: 26,
  gainThrottle: 16,
  /** cooling per second inside a cloud shadow (a clean pass nearly cancels the gap before it, but one missed cloud means you must linger to cool) */
  cool: 100,
  /** you only cool down in a shadow while slower than this (u/s): brake for a moment under the cloud */
  coolSpeed: 14,
  /** each petal-chain link still active from spring makes the engine heat this much faster */
  chainHeat: 0.05,
} as const;

export interface CloudPos {
  x: number;
  z: number;
  r: number;
  t: number;
  lat: number;
}

export class Clouds {
  pos: CloudPos[] = [];
  constructor(private track: TrackData, private offset = 0) {
    this.update(0);
  }

  setOffset(o: number) {
    this.offset = o;
  }

  /** Recompute cloud positions for race time `now`. */
  update(now: number) {
    const sectorLen = this.track.length / 4;
    this.pos = CLOUDS.map((c) => {
      let s = (c.s0 + (c.speed * now) / sectorLen) % 1; // wraps within the summer sector
      if (s < 0) s += 1;
      const t = seasonToT(1, s, this.offset);
      const lat = c.lat + Math.sin(now * c.swayHz * Math.PI * 2 + c.s0 * 10) * c.sway;
      const p = trackPoint(this.track, t, lat);
      return { x: p.x, z: p.z, r: c.r, t, lat };
    });
  }

  /** Is world point (x, z) inside any cloud shadow? */
  covers(x: number, z: number): boolean {
    for (const c of this.pos) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }
}
