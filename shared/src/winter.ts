// Winter: snow piles up on your car. The heavier the load, the slower you go.
// STOP on a heater pad to melt it off.

import { seasonToT } from './track';

export const SNOWLOAD = {
  /** load gained per second from falling snow anywhere in winter */
  fall: 0.1, // snow piles on fast: you'll want those heaters
  /** extra per second while ploughing through a snow drift */
  drift: 0.35,
  /** extra per second out on the frozen lake (spray) */
  lake: 0.02,
  /** melt per second outside winter (so some carries into spring) */
  melt: 0.12,
  /** melt per second on a heater pad */
  heater: 0.75,
  /** you must be slower than this (u/s) on the pad for it to melt anything */
  stopSpeed: 5,
  /** at full load: top speed and acceleration multipliers, steering multiplier */
  speedAtFull: 0.35,
  accelAtFull: 0.35,
  steerAtFull: 0.6,
} as const;

export interface Heater {
  /** season-local position in winter */
  s: number;
  /** lateral range */
  lat0: number;
  lat1: number;
}

/** Heater pads on the road: each covers one lane, so you choose to detour for it. */
export const HEATERS: Heater[] = [
  { s: 0.22, lat0: -9, lat1: -3 },
  { s: 0.6, lat0: 3, lat1: 9 }, // inside lane in the corner, next to the ice: lake-cutters skip it
  { s: 0.92, lat0: -3, lat1: 3 },
];

/** Pad length along the road (units). */
export const HEATER_LEN = 16;

export function heaterT(h: Heater, offset = 0): number {
  return seasonToT(3, h.s, offset);
}

/** Is (t, lat) on a heater pad? */
export function onHeater(t: number, lat: number, trackLength: number, offset = 0): boolean {
  for (const h of HEATERS) {
    let d = (t - heaterT(h, offset)) * trackLength;
    if (d > trackLength / 2) d -= trackLength;
    if (d < -trackLength / 2) d += trackLength;
    if (Math.abs(d) < HEATER_LEN / 2 && lat >= h.lat0 && lat <= h.lat1) return true;
  }
  return false;
}
