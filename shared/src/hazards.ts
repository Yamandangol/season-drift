// Hazard layout, defined per SEASON in season-local coordinates (s in [0,1)
// within that season's sector). Because hazards belong to the season, not to
// a fixed spot, they move with it when seasons shift around the track.
//
// Shared by client (physics + visuals), bots, and later the server.

import { TRACK, type SurfaceName } from './constants';
import { seasonToT, TRACK_SCALE } from './track';

export type HazardType = 'mud' | 'puddle' | 'shade' | 'leaves' | 'ice' | 'snow' | 'branch';

export interface HazardRect {
  season: 0 | 1 | 2 | 3; // 0 spring, 1 summer, 2 autumn, 3 winter
  type: HazardType;
  s0: number;
  s1: number; // for branches s1 is ignored (thickness comes from constants)
  lat0: number;
  lat1: number;
  /** organic outline inside the rect (spilled water / mud splotch); value = shape seed */
  blob?: number;
}

const H = TRACK.roadWidth / 2; // 9 — three lanes of 6
/** Lane edges (lateral, + = left): right lane [-9,-3], middle [-3,3], left [3,9]. */
export const LANE = { width: TRACK.roadWidth / 3, centers: [-6, 0, 6] } as const;

export const HAZARDS: HazardRect[] = [
  // 🌱 Spring — steering. Mud splotches cover one or two lanes, so there's always a clean line.
  { season: 0, type: 'mud', s0: 0.05, s1: 0.11, lat0: -1.5, lat1: H + 0.5, blob: 1 },
  { season: 0, type: 'mud', s0: 0.17, s1: 0.23, lat0: -H - 0.5, lat1: 1.5, blob: 2 },
  { season: 0, type: 'mud', s0: 0.34, s1: 0.4, lat0: -4, lat1: 4, blob: 3 },
  { season: 0, type: 'mud', s0: 0.53, s1: 0.58, lat0: 1, lat1: H + 0.5, blob: 4 },
  { season: 0, type: 'mud', s0: 0.6, s1: 0.65, lat0: -H - 0.5, lat1: -1, blob: 5 }, // quick chicane
  { season: 0, type: 'mud', s0: 0.84, s1: 0.9, lat0: -3.5, lat1: H + 0.5, blob: 6 },
  // Spilled-water puddles: big irregular spills. Slow down, or thread the gaps.
  { season: 0, type: 'puddle', s0: 0.25, s1: 0.31, lat0: -H, lat1: 4, blob: 11 },
  { season: 0, type: 'puddle', s0: 0.44, s1: 0.5, lat0: -3, lat1: H + 1, blob: 12 },
  { season: 0, type: 'puddle', s0: 0.71, s1: 0.78, lat0: -H - 0.5, lat1: H + 0.5, blob: 13 },
  { season: 0, type: 'puddle', s0: 0.92, s1: 0.97, lat0: -6.5, lat1: 6.5, blob: 14 },

  // ☀️ Summer — shade now comes from moving clouds (see clouds.ts).

  // 🍂 Autumn — reacting. Two fixed fallen logs; the rest fall live (see fallingBranches.ts).
  // Leaf piles, one lane each: drive through one to kick leaves into the face of whoever is behind you.
  { season: 2, type: 'leaves', s0: 0.04, s1: 0.075, lat0: -9, lat1: -3, blob: 121 },
  { season: 2, type: 'leaves', s0: 0.11, s1: 0.145, lat0: 3, lat1: 9, blob: 122 },
  { season: 2, type: 'leaves', s0: 0.18, s1: 0.215, lat0: -3, lat1: 3, blob: 123 },
  { season: 2, type: 'leaves', s0: 0.25, s1: 0.285, lat0: -9, lat1: -3, blob: 124 },
  { season: 2, type: 'leaves', s0: 0.38, s1: 0.415, lat0: 3, lat1: 9, blob: 125 },
  { season: 2, type: 'leaves', s0: 0.45, s1: 0.485, lat0: -3, lat1: 3, blob: 126 },
  { season: 2, type: 'leaves', s0: 0.52, s1: 0.555, lat0: -9, lat1: -3, blob: 127 },
  { season: 2, type: 'leaves', s0: 0.6, s1: 0.635, lat0: 3, lat1: 9, blob: 128 },
  { season: 2, type: 'leaves', s0: 0.77, s1: 0.805, lat0: -3, lat1: 3, blob: 129 },
  { season: 2, type: 'leaves', s0: 0.84, s1: 0.875, lat0: -9, lat1: -3, blob: 130 },
  { season: 2, type: 'leaves', s0: 0.91, s1: 0.945, lat0: 3, lat1: 9, blob: 131 },
  { season: 2, type: 'branch', s0: 0.32, s1: 0.32, lat0: -1, lat1: H + 1 },
  { season: 2, type: 'branch', s0: 0.7, s1: 0.7, lat0: -H - 1, lat1: 1 },

  // ❄️ Winter — braking. Ice sits before corners.
  { season: 3, type: 'ice', s0: 0.26, s1: 0.34, lat0: -H, lat1: H, blob: 105 },
  { season: 3, type: 'ice', s0: 0.58, s1: 0.64, lat0: -H, lat1: 3, blob: 106 },
  { season: 3, type: 'ice', s0: 0.79, s1: 0.86, lat0: -H, lat1: H, blob: 107 },
  { season: 3, type: 'snow', s0: 0.06, s1: 0.2, lat0: 4.5, lat1: H + 2, blob: 108 },
  { season: 3, type: 'snow', s0: 0.06, s1: 0.2, lat0: -H - 2, lat1: -4.5, blob: 109 },
  { season: 3, type: 'snow', s0: 0.42, s1: 0.54, lat0: -H - 2, lat1: 1.5, blob: 110 },
  { season: 3, type: 'snow', s0: 0.68, s1: 0.78, lat0: -H - 2, lat1: -1, blob: 111 }, // outside lanes: keeps the lake exit clear
];

/**
 * Organic outline radius (normalised, <= 1) for a blob hazard at angle th.
 * Puddles get big lobes like spilled water; mud is rounder and lumpier.
 */
export function blobShape(type: HazardType, seed: number, th: number): number {
  const a = seed * 1.7, b = seed * 2.9, c = seed * 4.3, d = seed * 6.1;
  if (type === 'puddle') {
    return 0.6 + 0.17 * Math.sin(2 * th + a) + 0.12 * Math.sin(3 * th + b) + 0.07 * Math.sin(5 * th + c) + 0.03 * Math.sin(11 * th + d);
  }
  if (type === 'snow') {
    // wind-blown drift: smooth, slightly elongated lobes
    return 0.8 + 0.1 * Math.sin(2 * th + a) + 0.06 * Math.sin(3 * th + b) + 0.03 * Math.sin(7 * th + c);
  }
  if (type === 'leaves') {
    // raked pile: lumpy, ragged edge
    return 0.74 + 0.1 * Math.sin(3 * th + a) + 0.08 * Math.sin(6 * th + b) + 0.06 * Math.sin(11 * th + c) + 0.02 * Math.sin(17 * th + d);
  }
  if (type === 'ice') {
    // frozen puddle: broad, smooth lobes
    return 0.72 + 0.14 * Math.sin(2 * th + a) + 0.09 * Math.sin(4 * th + b) + 0.04 * Math.sin(7 * th + c);
  }
  return 0.76 + 0.11 * Math.sin(3 * th + a) + 0.08 * Math.sin(5 * th + b) + 0.04 * Math.sin(9 * th + c);
}

/** 3D mound settings (visual height of drifts / leaf piles; cars ride up on them). */
export const MOUND: Partial<Record<HazardType, { height: number; hump: number }>> = {
  snow: { height: 1.3, hump: 0.3 },
  leaves: { height: 0.6, hump: 0 },
};

/** Height of a mound at normalised blob coords (u, v); 0 outside. Matches HazardView. */
export function moundHeight(type: HazardType, seed: number, u: number, v: number): number {
  const m = MOUND[type];
  if (!m) return 0;
  const k = Math.hypot(u, v) / blobShape(type, seed, Math.atan2(v, u));
  if (k >= 1) return 0;
  let y = m.height * Math.pow(1 - k * k, 0.65);
  if (m.hump) y *= 1 - m.hump + m.hump * (0.5 + 0.5 * Math.cos(u * Math.PI * 2.2 + seed));
  return y;
}

/** Summer glare zone (season-local) — the long straight. */
export const GLARE_ZONE = { season: 1, s0: 0.06, s1: 0.36 } as const;
/** Where the sun "sits": we aim it down the straight at this season-local s. */
export const SUN_AT_S = 0.2;

/** One soft heap of a snow drift, in the drift's normalised blob space. */
export interface Heap {
  cu: number;
  cv: number;
  su: number;
  sv: number;
  seed: number;
  /** multiplier on MOUND.snow.height */
  hMul: number;
}

/** Inner fraction of a snow heap that is packed solid (you bounce off it). */
export const SNOW_CORE = 0.6;

function frac(x: number) {
  return x - Math.floor(x);
}

/** Long drifts are several heaps in a row. Deterministic, so physics and visuals agree. */
export function snowHeaps(h: HazardRect, lengthUnits: number): Heap[] {
  const n = Math.max(1, Math.round(lengthUnits / 16));
  const seed = h.blob ?? 0;
  const out: Heap[] = [];
  for (let k = 0; k < n; k++) {
    const r1 = frac(Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453);
    const r2 = frac(Math.sin(seed * 39.3468 + k * 11.135) * 24634.6345);
    out.push({ cu: -1 + (2 * k + 1) / n, cv: (r1 - 0.5) * 0.15, su: 1.45 / n, sv: 1, seed: seed + k * 3, hMul: 0.8 + r2 * 0.4 });
  }
  return out;
}

/** Normalised distance (0 centre .. 1 rim) of (u, v) inside a heap; >= 1 outside. */
export function heapK(hp: Heap, u: number, v: number): number {
  const du = (u - hp.cu) / hp.su, dv = (v - hp.cv) / hp.sv;
  return Math.hypot(du, dv) / blobShape('snow', hp.seed, Math.atan2(dv, du));
}

/** Hazard placed in world t (computed for a given season offset). */
export interface PlacedHazard extends HazardRect {
  t0: number;
  t1: number;
  /** snow drifts only */
  heaps?: Heap[];
  /** index into HAZARDS, stable id for per-lap state like knocked branches */
  id: number;
}

const SURFACE_PRIORITY: Partial<Record<HazardType, number>> = { ice: 5, mud: 4, snow: 3, puddle: 2, leaves: 1 };

export class HazardMap {
  placed: PlacedHazard[] = [];
  constructor(
    private trackLength: number,
    public offset = 0,
  ) {
    this.place(offset);
  }

  place(offset: number) {
    this.offset = offset;
    const branchHalf = TRACK.roadWidth > 0 ? HAZARD_BRANCH_HALF_T(this.trackLength) : 0;
    this.placed = HAZARDS.map((h, id) => {
      // the track was scaled up: keep each patch about its original length in world units
      if (h.type !== 'branch' && h.type !== 'ice') { // black ice keeps its full length: it's meant to be a long slide
        const mid = (h.s0 + h.s1) / 2, half = (h.s1 - h.s0) / 2 / TRACK_SCALE;
        h = { ...h, s0: mid - half, s1: mid + half };
      }
      let t0 = seasonToT(h.season, h.s0, offset);
      let t1 = seasonToT(h.season, h.s1, offset);
      if (h.type === 'branch') {
        t0 = t0 - branchHalf;
        t1 = t0 + branchHalf * 2;
      }
      const placed: PlacedHazard = { ...h, t0, t1, id };
      if (h.type === 'snow') placed.heaps = snowHeaps(h, (((t1 - t0) % 1) + 1) % 1 * this.trackLength);
      return placed;
    });
  }

  /** Is (t, lat) inside this hazard (rect, then organic outline for blobs)? */
  contains(h: PlacedHazard, t: number, lat: number): boolean {
    if (!(t >= h.t0 && t < h.t1 && lat >= h.lat0 && lat <= h.lat1)) return false;
    if (h.blob === undefined) return true;
    if (h.heaps) {
      const [u, v] = this.uv(h, t, lat);
      return h.heaps.some((hp) => heapK(hp, u, v) < 1);
    }
    const u = (t - (h.t0 + h.t1) / 2) / ((h.t1 - h.t0) / 2);
    const v = (lat - (h.lat0 + h.lat1) / 2) / ((h.lat1 - h.lat0) / 2);
    return Math.hypot(u, v) < blobShape(h.type, h.blob, Math.atan2(v, u));
  }

  /** Normalised blob-space coordinates of (t, lat) inside a hazard's rect. */
  uv(h: PlacedHazard, t: number, lat: number): [number, number] {
    return [(t - (h.t0 + h.t1) / 2) / ((h.t1 - h.t0) / 2), (lat - (h.lat0 + h.lat1) / 2) / ((h.lat1 - h.lat0) / 2)];
  }

  /** The packed-solid snow heap core at (t, lat), if any. */
  solidSnowAt(t: number, lat: number): { h: PlacedHazard; hp: Heap } | undefined {
    for (const h of this.placed) {
      if (!h.heaps) continue;
      if (!(t >= h.t0 && t < h.t1 && lat >= h.lat0 - 1 && lat <= h.lat1 + 1)) continue;
      const [u, v] = this.uv(h, t, lat);
      for (const hp of h.heaps) if (heapK(hp, u, v) < SNOW_CORE) return { h, hp };
    }
    return undefined;
  }

  /** Hazards of a type covering (t, lat). */
  at(t: number, lat: number, type?: HazardType): PlacedHazard | undefined {
    for (const h of this.placed) {
      if (type && h.type !== type) continue;
      if (this.contains(h, t, lat)) return h;
    }
    return undefined;
  }

  /** Ground surface (ignores branches/shade). */
  surfaceAt(t: number, lat: number): SurfaceName {
    let best: HazardType | undefined;
    let bestP = 0;
    for (const h of this.placed) {
      const p = SURFACE_PRIORITY[h.type];
      if (!p || p <= bestP) continue;
      if (this.contains(h, t, lat)) {
        best = h.type;
        bestP = p;
      }
    }
    if (best) return best as SurfaceName; // only surface types have a priority
    return Math.abs(lat) > TRACK.roadWidth / 2 ? 'grass' : 'road';
  }

  /** How high the ground is lifted by drifts / leaf piles at (t, lat). */
  groundHeight(t: number, lat: number): number {
    let y = 0;
    for (const h of this.placed) {
      if (!MOUND[h.type] || h.blob === undefined) continue;
      if (!(t >= h.t0 && t < h.t1 && lat >= h.lat0 && lat <= h.lat1)) continue;
      const [u, v] = this.uv(h, t, lat);
      if (h.heaps) {
        for (const hp of h.heaps) {
          const k = heapK(hp, u, v);
          if (k < 1) y = Math.max(y, MOUND.snow!.height * hp.hMul * Math.pow(1 - k * k, 0.65));
        }
      } else {
        y = Math.max(y, moundHeight(h.type, h.blob, u, v));
      }
    }
    return y;
  }

  inShade(t: number, lat: number): boolean {
    return !!this.at(t, lat, 'shade');
  }

  inGlareZone(t: number): boolean {
    const t0 = seasonToT(GLARE_ZONE.season, GLARE_ZONE.s0, this.offset);
    const t1 = seasonToT(GLARE_ZONE.season, GLARE_ZONE.s1, this.offset);
    return t >= t0 && t < t1;
  }

  /** Hazards whose t-range intersects [tA, tB] (no wrap handling needed for short look-aheads within a lap). */
  between(tA: number, tB: number): PlacedHazard[] {
    const out: PlacedHazard[] = [];
    for (const h of this.placed) {
      if (tB >= tA ? h.t1 >= tA && h.t0 <= tB : h.t1 >= tA || h.t0 <= tB) out.push(h);
    }
    return out;
  }
}

function HAZARD_BRANCH_HALF_T(length: number): number {
  // half-thickness of a branch in t units
  return 0.7 / length;
}
