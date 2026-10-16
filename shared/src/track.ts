// Track data shared by client, server and bots.
// Pure math (no three.js) so the server can use it too.

import { TRACK } from './constants';

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Closed-loop control points (x, z). Driven in this order.
 * Rough lap ≈ 1.9k units ≈ 60–70 s at average speed.
 * Shape: long start straight, sweepers, a hairpin, and a long back straight
 * (planned summer sun-glare straight).
 */
export const CONTROL_POINTS: Vec2[] = [
  { x: 0, z: 0 },
  { x: 0, z: 120 },
  { x: 10, z: 220 },
  { x: 60, z: 290 },
  { x: 140, z: 310 },
  { x: 210, z: 280 },
  { x: 240, z: 210 },
  { x: 300, z: 170 },
  { x: 370, z: 190 },
  { x: 420, z: 250 },
  { x: 480, z: 250 },
  { x: 510, z: 190 },
  { x: 500, z: 100 },
  { x: 500, z: 0 },
  { x: 490, z: -100 },
  { x: 440, z: -160 },
  { x: 360, z: -170 },
  { x: 290, z: -130 },
  { x: 220, z: -170 },
  { x: 140, z: -200 },
  { x: 60, z: -170 },
  { x: 10, z: -100 },
];

/** Sector boundaries in t. Spring, Summer, Autumn, Winter. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export function seasonAt(t: number, offset = 0): Season {
  const idx = Math.floor(((t + 1) % 1) * 4);
  return SEASONS[(idx - offset + 4 * 100) % 4];
}

// ---------- Centripetal-free uniform Catmull-Rom (closed) ----------

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function rawPoint(s: number): Vec2 {
  // s in [0, 1) over control points (not arc-length uniform)
  const n = CONTROL_POINTS.length;
  const f = s * n;
  const i = Math.floor(f);
  const u = f - i;
  const p = (k: number) => CONTROL_POINTS[(((i + k) % n) + n) % n];
  const a = p(-1), b = p(0), c = p(1), d = p(2);
  return { x: catmull(a.x, b.x, c.x, d.x, u), z: catmull(a.z, b.z, c.z, d.z, u) };
}

export interface TrackSample {
  x: number;
  z: number;
  /** unit tangent */
  tx: number;
  tz: number;
  /** unit left normal (tangent rotated +90° about +Y) */
  nx: number;
  nz: number;
}

export interface TrackData {
  samples: TrackSample[];
  length: number;
}

/** Build an arc-length-uniform lookup table. Call once at load. */
export function buildTrackData(count: number = TRACK.lutSamples): TrackData {
  // Dense raw sampling -> cumulative lengths -> resample uniformly.
  const dense = count * 8;
  const pts: Vec2[] = [];
  const cum: number[] = [0];
  for (let i = 0; i <= dense; i++) pts.push(rawPoint(i / dense));
  for (let i = 1; i <= dense; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const length = cum[dense];
  const samples: TrackSample[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * length;
    while (j < dense - 1 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const u = (target - cum[j]) / seg;
    const x = pts[j].x + (pts[j + 1].x - pts[j].x) * u;
    const z = pts[j].z + (pts[j + 1].z - pts[j].z) * u;
    samples.push({ x, z, tx: 0, tz: 0, nx: 0, nz: 0 });
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 1 + count) % count];
    const b = samples[(i + 1) % count];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const s = samples[i];
    s.tx = tx; s.tz = tz;
    // left normal for heading convention forward=(sin h, cos h): left = (tz, -tx)
    s.nx = tz; s.nz = -tx;
  }
  return { samples, length };
}

export interface TrackPos {
  /** progress around the loop in [0, 1) */
  t: number;
  /** signed distance from centre line (+ = left) */
  lateral: number;
  index: number;
}

/**
 * Nearest point on the centre line. Pass `hint` (last index) for a fast local
 * search; without a hint it does a full scan.
 */
export function queryTrack(data: TrackData, x: number, z: number, hint = -1): TrackPos {
  const s = data.samples;
  const n = s.length;
  let best = -1;
  let bestD = Infinity;
  const scan = (i: number) => {
    const p = s[((i % n) + n) % n];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = ((i % n) + n) % n; }
  };
  if (hint >= 0) {
    for (let k = -60; k <= 60; k++) scan(hint + k);
    // If we're far from the track (respawn glitch etc.) fall back to a full scan.
    if (bestD > (TRACK.wallOffset * 3) ** 2) for (let i = 0; i < n; i++) scan(i);
  } else {
    for (let i = 0; i < n; i++) scan(i);
  }
  // Refine between neighbours by projecting onto the tangent.
  const p = s[best];
  const dx = x - p.x, dz = z - p.z;
  const along = dx * p.tx + dz * p.tz;
  const lateral = dx * p.nx + dz * p.nz;
  const step = data.length / n;
  let t = (best + along / step) / n;
  t = ((t % 1) + 1) % 1;
  return { t, lateral, index: best };
}

/** World position + heading at a given t and lateral offset. */
export function trackPoint(data: TrackData, t: number, lateral = 0): { x: number; z: number; heading: number } {
  const n = data.samples.length;
  const s = data.samples[Math.floor((((t % 1) + 1) % 1) * n) % n];
  return { x: s.x + s.nx * lateral, z: s.z + s.nz * lateral, heading: Math.atan2(s.tx, s.tz) };
}
