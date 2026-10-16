// Winter: snow piles up on your car. The heavier the load, the slower you go.
// STOP on a heater pad to melt it off.

import { seasonToT } from './track';

export const SNOWLOAD = {
  /** load gained per second from falling snow anywhere in winter */
  fall: 0.055, // snow piles on steadily: the ramps shake it off
  /** extra per second while ploughing through a snow drift */
  drift: 0.35,
  /** extra per second out on the frozen lake (spray) */
  lake: 0.02,
  /** melt per second outside winter (so some carries into spring) */
  melt: 0.12,
  /** melt per second on a heater pad */
  heater: 1.1,
  /** you must be slower than this (u/s) on the pad for it to melt anything */
  stopSpeed: 5,
  /** at full load: top speed and acceleration multipliers, steering multiplier */
  speedAtFull: 0.55, // even fully loaded you can still get up to ramp speed
  accelAtFull: 0.5,
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

/** Heaters have limited fuel: whoever parks first gets it, then it burns out and relights later. */
export const HEATER_FUEL = {
  /** off: heaters are unlimited (the fuel race wasn't fun) */
  on: false,
  /** seconds of melting before a pad burns out (shared by every car on it) */
  seconds: 1.6,
  /** seconds until a burnt-out pad relights */
  relight: 12,
} as const;

/** Snow ramps (they sit where the heaters used to be): hit one fast and the landing shakes the snow off. */
export const RAMP = {
  /** below this speed (u/s) a ramp is just a bump */
  minSpeed: 14,
  /** airtime (s) at top speed */
  air: 0.8,
  /** snow knocked off by a landing */
  shake: 0.8,
  /** jump height at top speed (visual) */
  height: 2.2,
} as const;

/** Packed ruts down each lane stay fast; the fresh powder between them slows you and loads snow on. */
export const RUTS = {
  lanes: [-6.5, 0, 6.5],
  /** half-width of a packed rut (units) */
  half: 1.7,
  /** extra snow load per second in powder */
  powderLoad: 0.04,
  /** how long a car's own tracks stay packed (s) */
  trackLife: 25,
} as const;

/** Is this lateral position on one of the packed lane ruts? */
export function onRut(lat: number): boolean {
  return RUTS.lanes.some((c) => Math.abs(lat - c) < RUTS.half);
}

/** Blizzard gusts: whiteouts sweep through winter (visual only). */
export const BLIZZARD = { period: 10, duration: 2.8 } as const;
/** 0..1 whiteout strength at race time t (deterministic, same for everyone) */
export function blizzardAt(t: number): number {
  const p = ((t % BLIZZARD.period) + BLIZZARD.period) % BLIZZARD.period;
  if (p > BLIZZARD.duration) return 0;
  const k = p / BLIZZARD.duration;
  return Math.sin(k * Math.PI) ** 0.7;
}

/** Snow is heavy but grippy: extra grip on black ice at full load. */
export const SNOW_ICE_GRIP = 0.14;

/** Which heater pad (index) is at (t, lat), or -1. */
export function heaterAt(t: number, lat: number, trackLength: number, offset = 0): number {
  for (let i = 0; i < HEATERS.length; i++) {
    const h = HEATERS[i];
    let d = (t - heaterT(h, offset)) * trackLength;
    if (d > trackLength / 2) d -= trackLength;
    if (d < -trackLength / 2) d += trackLength;
    if (Math.abs(d) < HEATER_LEN / 2 && lat >= h.lat0 && lat <= h.lat1) return i;
  }
  return -1;
}

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
