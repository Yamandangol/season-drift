// All tuning numbers live here so feel can be tweaked quickly.

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const TRACK = {
  roadWidth: 18, // three lanes of 6
  /** distance from centre line to the wall on each side */
  wallOffset: 14.5,
  wallHeight: 1.2,
  lutSamples: 2000,
  laps: 1,
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
  overSpeedPull: 4,
  radius: 1.6,
  wallSpeedLoss: 0.4,
} as const;

export interface Surface {
  grip: number;
  dragMult: number;
  steerMult: number;
  maxSpeedMult: number;
  brakeMult: number;
  /** wheelspin: fraction of engine accel that reaches the road */
  accelMult: number;
}

export const SURFACES = {
  road: { grip: 1.0, dragMult: 1.0, steerMult: 1.0, maxSpeedMult: 1.0, brakeMult: 1, accelMult: 1 },
  grass: { grip: 0.8, dragMult: 2.5, steerMult: 0.9, maxSpeedMult: 0.6, brakeMult: 1, accelMult: 0.8 },
  mud: { grip: 0.65, dragMult: 7.0, steerMult: 0.6, maxSpeedMult: 0.3, brakeMult: 1, accelMult: 0.4 }, // thick mud: crawl
  // aquaplaning: the tyres are riding on water — no grip, no steering, no throttle, no brakes
  puddle: { grip: 0.02, dragMult: 0.5, steerMult: 0, maxSpeedMult: 1.0, brakeMult: 0.05, accelMult: 0 },
  leaves: { grip: 0.6, dragMult: 1.2, steerMult: 0.9, maxSpeedMult: 0.92, brakeMult: 0.8, accelMult: 0.9 },
  ice: { grip: 0.02, dragMult: 0.45, steerMult: 0.5, maxSpeedMult: 1.0, brakeMult: 0.1, accelMult: 0.25 }, // black ice: the nose turns, the car keeps sliding
  snow: { grip: 0.6, dragMult: 3.0, steerMult: 0.8, maxSpeedMult: 0.55, brakeMult: 1, accelMult: 0.7 },
  // winter: fresh powder between the packed ruts
  powder: { grip: 0.7, dragMult: 1.8, steerMult: 0.9, maxSpeedMult: 0.8, brakeMult: 0.9, accelMult: 0.75 },
  // the frozen lake: slippery but skate-able (momentum is king)
  lakeIce: { grip: 0.16, dragMult: 0.5, steerMult: 0.55, maxSpeedMult: 1.0, brakeMult: 0.3, accelMult: 0.5 },
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

// ---------------- Phase 1: seasons, hazards, race ----------------

export const HAZARD = {
  /** puddles only hydroplane above this fraction of max speed */
  hydroplaneSpeedFrac: 0.6,
  /** random sideways accel while hydroplaning (u/s^2) */
  hydroplaneNudge: 10,
  /** how fast the car spins while aquaplaning (rad/s) */
  hydroplaneSpin: 1.9,
  /** branch: thickness along the road (units) */
  branchThickness: 1.4,
  branchSpeedLoss: 0.6,
  branchSpinDeg: 25,
  branchBounce: 6, // u/s pushed back
  /** shore snowbank: speed kept when sliding into the lake edge */
  shoreKeep: 0.7,
  /** speed lost slamming into the packed core of a snow drift */
  snowSpeedLoss: 0.45,
} as const;

export const HEAT = {
  gainThrottle: 20, // %/s, summer + throttle
  coolSummer: 10, // %/s, summer + off throttle (it's hot out!)
  coolOff: 60, // %/s outside summer: the heat is gone almost at once (no carrying it into autumn)
  coolShade: 50, // %/s, in shade
  warn: 70,
  stallSeconds: 2.5,
  afterStall: 0,
  /** engine-braking while stalled, as a fraction of full brake */
  stallDrag: 0.18,
} as const;

/** Autumn mechanic: leaves clog the engine, the wind is your power. */
export const SAIL = {
  engineCap: 0.55, // engine alone can only reach this fraction of top speed
  accel: 21, // u/s^2 of sail thrust at perfect angle
  topFrac: 1.06, // sail can push you up to this fraction of top speed
  leeway: 3, // u/s^2 sideways drift downwind
  gustStrength: 1.7, // thrust multiplier while a gust blows
  /** wind directions (downwind heading relative to the road, degrees) the wind cycles through */
  windRel: [20, -35, 90, -90, 160, -160, 45, -110, 120],
} as const;

/** Sail thrust factor for angle a (degrees) between your heading and the downwind direction. */
export function sailFactor(aDeg: number): number {
  const a = Math.abs(aDeg);
  if (a <= 110) return 0.8 + 0.3 * Math.sin((a * Math.PI) / 180);
  if (a <= 150) return 1.08 + ((0.55 - 1.08) * (a - 110)) / 40;
  return Math.max(0, 0.55 * (1 - (a - 150) / 25)); // no-go zone into the wind
}

/** Summer mechanic: stored engine heat is spent as a boost. */
export const BOOST = {
  minHeat: 15, // need at least this much heat to fire
  baseSeconds: 0.6,
  perHeatSeconds: 2.6, // + this * heat/100
  speedMult: 1.32, // top speed during boost
  redLineHeat: 80, // fire above this for the bonus
  redLineBonus: 0.15, // extra top-speed multiplier
  accelMult: 2.0,
} as const;

export const GLARE = {
  dotThreshold: 0.9,
  fadeIn: 0.3, // s
  hold: 1.5, // s max
  fadeOut: 0.6, // s
  maxOpacity: 0.85,
  reducedOpacity: 0.5,
  warnSeconds: 1.0,
} as const;

export const GUST = {
  minGap: 6, // s
  maxGap: 10, // s
  duration: 1.5, // s
  warn: 1.0, // s
  accel: 28, // u/s^2 sideways push (grip fights it)
} as const;

export const RACE = {
  countdown: 3, // s
  graceSeconds: 20,
  respawnPenalty: 1, // s frozen after respawn
  stuckSeconds: 3, // bots auto-respawn when stuck this long
  gridRows: 2,
} as const;

export const BOT = {
  lookAhead: 12,
  difficulty: { easy: 0.85, normal: 0.95, hard: 1.02 },
  heatLift: 65,
} as const;
export type Difficulty = keyof typeof BOT.difficulty;

/** blend zone length (units) at sector boundaries */
export const SEASON_BLEND_UNITS = 10;
