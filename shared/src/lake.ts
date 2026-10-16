// Winter's frozen lake: the inside of the big winter corner is a frozen lake with an
// open shore (no wall). Cut straight across it — but the ice cracks under slow cars.
//
// Geometry: the corner (t ≈ 0.85 → 0.95) is close to a quarter circle of radius ~120
// around LAKE.cx/cz. The lake is the quarter disc inside it, up to the inner wall.

import { TRACK } from './constants';
import { TRACK_SCALE } from './track';

export const LAKE = {
  cx: 124 * TRACK_SCALE,
  cz: 188 * TRACK_SCALE,
  /** lake radius: right up to the inner wall line of the corner */
  r: 120 * TRACK_SCALE - TRACK.wallOffset - 0.5,
  /** angular range (radians, Math.atan2(z - cz, x - cx)) */
  a0: Math.PI / 2,
  a1: Math.PI,
  /** ice cracks while you're slower than this (u/s) */
  crackSpeed: 17,
  /** seconds of slow driving until the ice gives way */
  crackSeconds: 1.1,
  /** crack heals this fast when you're quick again (per s) */
  healRate: 0.6,
  /** extra frozen time after falling through (on top of the respawn penalty) */
  fallPenalty: 1.5,
} as const;

function polar(x: number, z: number) {
  return { d: Math.hypot(x - LAKE.cx, z - LAKE.cz), a: Math.atan2(z - LAKE.cz, x - LAKE.cx) };
}

/** On the ice surface itself. */
export function onLake(x: number, z: number): boolean {
  const { d, a } = polar(x, z);
  return d < LAKE.r && a >= LAKE.a0 && a <= LAKE.a1;
}

/** Where the inner wall is open (the lake shore), with a small margin. */
export function lakeShoreOpen(x: number, z: number): boolean {
  const { d, a } = polar(x, z);
  return d < LAKE.r + TRACK.wallOffset && a >= LAKE.a0 + 0.02 && a <= LAKE.a1 - 0.02;
}

/**
 * Keep cars on the lake from driving off its straight edges into the woods.
 * Returns a push-back (dx, dz) and the outward normal, or null when fine.
 */
export function lakeEdgePush(x: number, z: number): { dx: number; dz: number; nx: number; nz: number } | null {
  const { d, a } = polar(x, z);
  if (d > LAKE.r + 2) return null; // not in the lake zone (on the road / elsewhere)
  // edge 1: a = a0 (pointing +z from the centre: the line x = cx, lake side x < cx)
  if (a < LAKE.a0 + 0.001 && a > -Math.PI / 2 + 0.001 && x > LAKE.cx - 1.5) {
    const push = x - (LAKE.cx - 1.5);
    return { dx: -push, dz: 0, nx: 1, nz: 0 };
  }
  // edge 2: a = a1 (pointing -x: the line z = cz, lake side z > cz)
  if ((a > LAKE.a1 - 0.001 || a < -Math.PI / 2) && z < LAKE.cz + 1.5) {
    const push = LAKE.cz + 1.5 - z;
    return { dx: 0, dz: push, nx: 0, nz: -1 };
  }
  return null;
}
