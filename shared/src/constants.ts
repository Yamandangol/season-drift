// All tuning numbers live here so feel can be tweaked quickly.

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const TRACK = {
  roadWidth: 14,
  /** distance from centre line to the wall on each side */
  wallOffset: 12,
  wallHeight: 1.2,
  lutSamples: 2000,
  laps: 3,
} as const;

export const CAR = {
  maxSpeed: 38, // u/s
  accel: 22, // u/s^2
  brakeDecel: 45, // u/s^2
  reverseFrac: 0.3, // reverse top speed as fraction of maxSpeed
  steerRate: 2.4, // rad/s at full lock
  /** speed (u/s) at which steering reaches full authority */
  steerFullSpeed: 8,
  /** steering authority lost at top speed (0..1) */
  steerHighSpeedLoss: 0.35,
  /** how fast sideways velocity is killed: lateral *= 1 - grip*dt*gripK */
  gripK: 8,
  /** base rolling/air drag per second */
  drag: 0.12,
  /** how hard the car is pulled down to a lowered max speed (mud, grass) */
  overSpeedPull: 3,
  radius: 1.6,
  wallSpeedLoss: 0.4,
} as const;

export interface Surface {
  grip: number;
  dragMult: number;
  steerMult: number;
  maxSpeedMult: number;
  brakeMult: number;
}

export const SURFACES = {
  road: { grip: 1.0, dragMult: 1.0, steerMult: 1.0, maxSpeedMult: 1.0, brakeMult: 1 },
  grass: { grip: 0.8, dragMult: 2.5, steerMult: 0.9, maxSpeedMult: 0.6, brakeMult: 1 },
  mud: { grip: 0.7, dragMult: 4.0, steerMult: 0.7, maxSpeedMult: 0.45, brakeMult: 1 },
  puddle: { grip: 0.25, dragMult: 1.2, steerMult: 0.6, maxSpeedMult: 1.0, brakeMult: 1 },
  leaves: { grip: 0.35, dragMult: 1.0, steerMult: 0.8, maxSpeedMult: 1.0, brakeMult: 1 },
  ice: { grip: 0.12, dragMult: 0.8, steerMult: 0.4, maxSpeedMult: 1.0, brakeMult: 0.35 },
  snow: { grip: 0.6, dragMult: 3.0, steerMult: 0.8, maxSpeedMult: 0.55, brakeMult: 1 },
} satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof SURFACES;

export const CAMERA = {
  distance: 11,
  height: 4.5,
  lookAhead: 6,
  posLerp: 6, // per second
  baseFov: 68,
  speedFov: 12, // extra FOV at max speed
} as const;
