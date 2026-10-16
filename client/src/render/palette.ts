// One shared low-poly palette per season. Everything colour-related reads from here.

import * as THREE from 'three';
import { SEASON_BLEND_UNITS } from '@shared/constants';
import { seasonIndexAt, startZoneK, type TrackData } from '@shared/track';

export interface SeasonPalette {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  verge: number;
  road: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  sunIntensity: number;
  canopy: number[];
  icon: string;
}

export const PALETTES: SeasonPalette[] = [
  {
    // Spring
    sky: 0xb9d4e8, fog: 0xc6d3dc, fogNear: 70, fogFar: 360,
    ground: 0x6fcf5c, verge: 0x5cbf4e, road: 0x40464e,
    hemiSky: 0xe0efff, hemiGround: 0x5d8a50, sun: 0xfff4e0, sunIntensity: 1.7,
    canopy: [0xf4a7c4, 0xf7c1d6, 0xe98fb3], icon: '🌱',
  },
  {
    // Summer
    sky: 0x74cff5, fog: 0xf1e2b6, fogNear: 150, fogFar: 620,
    ground: 0xb7c95a, verge: 0xa6b84d, road: 0x6c6964,
    hemiSky: 0xfff7e0, hemiGround: 0x8a9a40, sun: 0xfff0c2, sunIntensity: 2.8,
    canopy: [0x3f9a3a, 0x4fae45, 0x2f8a35], icon: '☀️',
  },
  {
    // Autumn
    sky: 0xe6c6a3, fog: 0xd8b38e, fogNear: 100, fogFar: 470,
    ground: 0x998a4a, verge: 0x897a40, road: 0x58544f,
    hemiSky: 0xffe2c0, hemiGround: 0x7a6030, sun: 0xffd29a, sunIntensity: 2.0,
    canopy: [0xe0662a, 0xc8402a, 0xf0a030], icon: '🍂',
  },
  {
    // Winter
    sky: 0xdbe4ec, fog: 0xe6edf2, fogNear: 45, fogFar: 250,
    ground: 0xf0f5f9, verge: 0xe1e9f0, road: 0x6d7782,
    hemiSky: 0xeef4ff, hemiGround: 0xb8c4d0, sun: 0xe6efff, sunIntensity: 1.4,
    canopy: [0x2e5a48, 0x355f4c, 0x2a5040], icon: '❄️',
  },
  {
    // No season: the start/finish straight
    sky: 0xcfe3f0, fog: 0xdde9f0, fogNear: 90, fogFar: 420,
    ground: 0x86a56e, verge: 0x759560, road: 0x55585d,
    hemiSky: 0xffffff, hemiGround: 0x6a7a5a, sun: 0xffffff, sunIntensity: 1.8,
    canopy: [0x4f8a4a, 0x5a9450, 0x467e44], icon: '🏁',
  },
];

/**
 * Season weights at t: 1 for the sector's season, cross-fading over `blendUnits`
 * either side of each boundary. Returns 4 weights summing to 1.
 */
export function seasonWeights(
  track: TrackData,
  t: number,
  offset = 0,
  blendUnits: number = SEASON_BLEND_UNITS,
  out: number[] = [0, 0, 0, 0, 0],
): number[] {
  out[0] = out[1] = out[2] = out[3] = out[4] = 0;
  const here = seasonIndexAt(t, offset);
  const q = (((t % 1) + 1) % 1) * 4;
  const frac = q - Math.floor(q); // position within sector 0..1
  const sectorLen = track.length / 4;
  const dStart = frac * sectorLen; // units since sector start
  const dEnd = (1 - frac) * sectorLen;
  const half = blendUnits / 2;
  if (dStart < half) {
    const prev = (here + 3) % 4;
    const w = 0.5 + (dStart / half) * 0.5;
    out[here] = w;
    out[prev] = 1 - w;
  } else if (dEnd < half) {
    const next = (here + 1) % 4;
    const w = 0.5 + (dEnd / half) * 0.5;
    out[here] = w;
    out[next] = 1 - w;
  } else {
    out[here] = 1;
  }
  // the start straight has no season
  const k = startZoneK(t, track.length);
  if (k > 0) {
    for (let i = 0; i < 4; i++) out[i] *= 1 - k;
    out[4] = k;
  }
  return out;
}

const _a = new THREE.Color();
export function mixColor(out: THREE.Color, weights: number[], pick: (p: SeasonPalette) => number): THREE.Color {
  out.setRGB(0, 0, 0);
  for (let i = 0; i < PALETTES.length; i++) {
    if (!(weights[i] > 0)) continue;
    _a.set(pick(PALETTES[i]));
    out.r += _a.r * weights[i];
    out.g += _a.g * weights[i];
    out.b += _a.b * weights[i];
  }
  return out;
}

export function mixNumber(weights: number[], pick: (p: SeasonPalette) => number): number {
  let v = 0;
  for (let i = 0; i < PALETTES.length; i++) v += pick(PALETTES[i]) * (weights[i] ?? 0);
  return v;
}
