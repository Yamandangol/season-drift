// Spring: the petal chain. Clusters of cherry petals float over the road, one lane each,
// in a zig-zag. Fly through them in order and the chain grows: every link adds top speed.
// Miss one and the chain breaks. Some sit inside puddles or next to mud: is the link worth it?

import { seasonToT } from './track';

export interface Petal {
  /** season-local position in spring */
  s: number;
  lat: number;
}

export const PETALS: Petal[] = [
  { s: 0.08, lat: -6 },
  { s: 0.145, lat: 0 },
  { s: 0.205, lat: 6 },
  { s: 0.27, lat: 6 },
  { s: 0.355, lat: -6 },
  { s: 0.42, lat: 0 },
  { s: 0.475, lat: -6 },
  { s: 0.55, lat: 0 },
  { s: 0.62, lat: 6 },
  { s: 0.68, lat: 0 },
  { s: 0.745, lat: 0 }, // in the big spill: slow down or skip it
  { s: 0.81, lat: -6 },
  { s: 0.87, lat: -6 },
  { s: 0.94, lat: 7.5 },
];

export const PETAL = {
  /** half-width of a cluster you must pass through (units) */
  radius: 2.8,
  /** top-speed (and accel) bonus per link in the chain */
  perLink: 0.025,
  /** links that count toward the bonus */
  maxLinks: 12,
  /** after spring the chain fades: one link lost every this many seconds */
  fadeSeconds: 1.4, // after spring the chain keeps boosting you, losing one link every 1.4 s
} as const;

export function petalT(p: Petal, offset = 0): number {
  return seasonToT(0, p.s, offset);
}

export function petalBonus(chain: number): number {
  return 1 + PETAL.perLink * Math.min(chain, PETAL.maxLinks);
}
