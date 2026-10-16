// Autumn: waves of blown leaves sweep down the road in a zig-zag. Drive into one and a curtain of
// leaves fills your screen for a moment — read the wave and slip into another lane.
// Positions are a pure function of race time, like the summer clouds.

import { seasonToT, trackPoint, type TrackData } from './track';

export interface WaveDef {
  s0: number;
  speed: number;
  lat: number;
  sway: number;
  swayHz: number;
  r: number;
}

const LANES = [5.5, -5.5, 0, -5.5]; // a few gusts, well spaced
export const WAVES: WaveDef[] = LANES.map((lat, i) => ({
  s0: (i + 0.5) / LANES.length,
  speed: 15, // faster down the road...
  lat,
  sway: 3.8, // ...and weaving hard across the lanes, so you have to read it and time your move
  swayHz: 0.24 + (i % 3) * 0.05,
  r: 4.2,
}));

export const WAVE = {
  /** how long the leaves linger on screen after touching a wave (s) */
  cover: 0.45,
  /** how much of the screen a wave covers (0..1) — less than a leaf-kick */
  opacity: 0.55,
} as const;

export interface WavePos { x: number; z: number; r: number; t: number; lat: number }

export class LeafWaves {
  pos: WavePos[] = [];
  constructor(private track: TrackData, private offset = 0) {
    this.update(0);
  }

  update(now: number) {
    const sectorLen = this.track.length / 4;
    this.pos = WAVES.map((w) => {
      let s = (w.s0 + (w.speed * now) / sectorLen) % 1;
      if (s < 0) s += 1;
      const t = seasonToT(2, s, this.offset);
      const lat = w.lat + Math.sin(now * w.swayHz * Math.PI * 2 + w.s0 * 9) * w.sway;
      const p = trackPoint(this.track, t, lat);
      return { x: p.x, z: p.z, r: w.r, t, lat };
    });
  }

  covers(x: number, z: number): boolean {
    for (const c of this.pos) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }
}
