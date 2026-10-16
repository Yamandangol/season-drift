// Per-season world dressing: ground colours, trees, sun, sky/fog/light blending, weather particles.

import * as THREE from 'three';
import { TRACK } from '@shared/constants';
import { GLARE_ZONE, SUN_AT_S, type HazardMap } from '@shared/hazards';
import { LAKE } from '@shared/lake';
import { queryTrack, seasonIndexAt, seasonToT, trackPoint, type TrackData } from '@shared/track';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inStartZone, TRACK_SCALE } from '@shared/track';
import { mixColor, mixNumber, PALETTES, seasonWeights } from './palette';

const GROUND_SIZE = 1700 * TRACK_SCALE;
const GROUND_SEGS = Math.round(170 * TRACK_SCALE);
const GROUND_CENTER = { x: 250 * TRACK_SCALE, z: 55 * TRACK_SCALE };

/** Deterministic RNG so the world looks the same for every player. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

let _dot: THREE.Texture | null = null;
/** Soft round sprite so near particles aren't big squares. */
function dotTexture(): THREE.Texture {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

interface Weather {
  points: THREE.Points;
  vel: Float32Array;
  season: number;
}

export class Seasons {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private ground!: THREE.Mesh;
  private groundT!: Float32Array; // nearest track t per ground vertex
  private trees: THREE.InstancedMesh[] = [];
  readonly sunDir = new THREE.Vector3();
  private sunMesh!: THREE.Mesh;
  private weather: Weather[] = [];
  private w = [0, 0, 0, 0];
  private tmp = new THREE.Color();
  /** 0..1 how hard autumn trees sway (set by gusts) */
  sway = 0;
  private swayUniforms = { uSway: { value: 0 }, uTime: { value: 0 } };
  /** wind for leaf particles (set by gusts) */
  windX = 0;
  windZ = 0;

  constructor(
    private track: TrackData,
    private hazards: HazardMap,
    private scene: THREE.Scene,
    private hemi: THREE.HemisphereLight,
    private sun: THREE.DirectionalLight,
  ) {
    this.buildGround();
    this.buildTrees();
    this.buildSun();
    this.buildWeather();
    this.buildRainbow();
    this.buildFlowers();
    this.recolor(hazards.offset);
    scene.add(this.group);
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS).rotateX(-Math.PI / 2);
    geo.translate(GROUND_CENTER.x, -0.05, GROUND_CENTER.z);
    const pos = geo.getAttribute('position');
    this.groundT = new Float32Array(pos.count);
    // Coarse nearest-t lookup (every 5th sample) is plenty for ground colour.
    const s = this.track.samples;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < s.length; i += 5) {
        const d = (s[i].x - x) ** 2 + (s[i].z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      this.groundT[v] = best / s.length;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.disposables.push(geo, mat);
  }

  private buildTrees() {
    const rand = rng(42);
    const spots: { x: number; z: number; t: number; scale: number; near: boolean }[] = [];
    const s = this.track.samples;
    const n = s.length;
    const addSpot = (x: number, z: number, scale: number, near: boolean) => {
      const q = queryTrack(this.track, x, z);
      if (Math.abs(q.lateral) < TRACK.wallOffset + 2.5) return; // keep off the road
      if (Math.hypot(x - LAKE.cx, z - LAKE.cz) < LAKE.r + 6 && x < LAKE.cx + 5 && z > LAKE.cz - 5) return; // keep off the frozen lake
      spots.push({ x, z, t: q.t, scale, near });
    };
    // Rows along both sides
    for (let i = 0; i < n; i += 9) {
      const p = s[i];
      for (const side of [-1, 1]) {
        if (rand() < 0.35) continue;
        const lat = side * (TRACK.wallOffset + 4 + rand() * 30);
        addSpot(p.x + p.nx * lat + (rand() - 0.5) * 6, p.z + p.nz * lat + (rand() - 0.5) * 6, 0.8 + rand() * 0.7, false);
      }
    }
    // Shade trees: big, right next to the road at summer shade zones
    for (const h of this.hazards.placed) {
      if (h.type !== 'shade') continue;
      const i0 = Math.floor(h.t0 * n), i1 = Math.floor(h.t1 * n);
      for (let i = i0; i < i1; i += 7) {
        const p = s[i % n];
        for (const side of [-1, 1]) {
          const lat = side * (TRACK.wallOffset + 4);
          addSpot(p.x + p.nx * lat, p.z + p.nz * lat, 1.6, true);
        }
      }
    }
    // Scatter
    for (let k = 0; k < 500 * TRACK_SCALE * TRACK_SCALE; k++) {
      addSpot(GROUND_CENTER.x + (rand() - 0.5) * 1100 * TRACK_SCALE, GROUND_CENTER.z + (rand() - 0.5) * 1100 * TRACK_SCALE, 0.9 + rand() * 0.8, false);
    }

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0);
    // Cherry blossom: a cluster of soft puffs instead of a cone.
    const puff = (r: number, x: number, y: number, z: number) => {
      const g = new THREE.IcosahedronGeometry(r, 0).translate(x, y, z);
      g.deleteAttribute('uv');
      return g;
    };
    const blossomGeo = mergeGeometries([
      puff(2.2, 0, 5.2, 0), puff(1.6, 1.6, 4.6, 0.4), puff(1.5, -1.5, 4.8, -0.3), puff(1.4, 0.3, 4.4, 1.6), puff(1.4, -0.2, 6.3, -0.9),
    ])!;
    const roundGeo = new THREE.IcosahedronGeometry(2.8, 0).translate(0, 5, 0);
    const pineGeo = new THREE.ConeGeometry(2.4, 7, 7).translate(0, 5.5, 0);
    const capGeo = new THREE.ConeGeometry(1.2, 2.2, 7).translate(0, 8.2, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a33, flatShading: true });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.disposables.push(trunkGeo, blossomGeo, roundGeo, pineGeo, capGeo, mat, trunkMat, snowMat);

    const bySeason: (typeof spots)[] = [[], [], [], [], []];
    for (const sp of spots) bySeason[inStartZone(sp.t, this.track.length) ? 4 : seasonIndexAt(sp.t, this.hazards.offset)].push(sp);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scl = new THREE.Vector3();
    const posv = new THREE.Vector3();
    let ti = 0;
    const canopyGeos = [blossomGeo, roundGeo, roundGeo, pineGeo, roundGeo];
    // Autumn canopies get their own material that sways in the wind (vertex shader tweak).
    const autumnMat = new THREE.MeshLambertMaterial({ flatShading: true });
    this.disposables.push(autumnMat);
    autumnMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSway = this.swayUniforms.uSway;
      shader.uniforms.uTime = this.swayUniforms.uTime;
      shader.vertexShader = 'uniform float uSway;\nuniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float h = max(0.0, position.y - 2.5) / 5.0;
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        transformed.x += uSway * h * (0.7 * sin(uTime * 9.0 + ph) + 0.35);
        transformed.z += uSway * h * 0.4 * cos(uTime * 7.0 + ph);`,
      );
    };
    bySeason.forEach((list, si) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(canopyGeos[si], si === 2 ? autumnMat : mat, list.length);
      const caps = si === 3 ? new THREE.InstancedMesh(capGeo, snowMat, list.length) : null;
      list.forEach((sp, k) => {
        q.setFromAxisAngle(up, rand() * Math.PI * 2);
        scl.setScalar(sp.scale);
        posv.set(sp.x, 0, sp.z);
        m4.compose(posv, q, scl);
        inst.setMatrixAt(k, m4);
        caps?.setMatrixAt(k, m4);
        trunks.setMatrixAt(ti++, m4);
        const pal = PALETTES[si].canopy;
        inst.setColorAt(k, this.tmp.set(pal[Math.floor(rand() * pal.length)]));
      });
      inst.castShadow = true;
      this.group.add(inst);
      this.trees.push(inst);
      if (caps) {
        this.group.add(caps);
        this.trees.push(caps);
      }
    });
    trunks.count = ti;
    trunks.castShadow = true;
    this.group.add(trunks);
    this.trees.push(trunks);
  }

  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private rainbow!: THREE.Mesh;
  private rainbowMat!: THREE.MeshBasicMaterial;
  /** current season weights at the camera (read by main for ripples / lens drops) */
  readonly weights = [0, 0, 0, 0];

  /** Rain as slanted streaks, not dots. */
  private buildRain() {
    const N = 1500;
    this.rainPos = new Float32Array(N * 6);
    const r = rng(99);
    for (let i = 0; i < N; i++) {
      const x = (r() - 0.5) * 120, y = r() * 40, z = (r() - 0.5) * 120;
      this.rainPos.set([x, y, z, x + 0.15, y + 1.4, z + 0.1], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc4d6ec, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.disposables.push(geo, mat);
  }

  /** A soft rainbow over the spring sector. */
  private buildRainbow() {
    const R = 420, tube = 26;
    const geo = new THREE.TorusGeometry(R, tube, 8, 72, Math.PI);
    const pos = geo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const bands = [0x9a5cff, 0x4a7bff, 0x3cc8ff, 0x52d669, 0xffe14a, 0xff9a3c, 0xff4f4f]; // inner -> outer
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getY(i)) - (R - tube); // 0..2*tube
      c.set(bands[Math.max(0, Math.min(bands.length - 1, Math.floor((d / (2 * tube)) * bands.length)))]);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.scale(1, 1, 0.05);
    this.rainbowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide });
    this.rainbow = new THREE.Mesh(geo, this.rainbowMat);
    // stand it up far beyond the middle of the spring sector, facing the track
    const t = seasonToT(0, 0.5, this.hazards.offset);
    const p = trackPoint(this.track, t, 0);
    const out = new THREE.Vector3(p.x, 0, p.z).sub(new THREE.Vector3(GROUND_CENTER.x, 0, GROUND_CENTER.z)).normalize();
    this.rainbow.position.set(p.x + out.x * 700, -60, p.z + out.z * 700);
    this.rainbow.lookAt(GROUND_CENTER.x, -60, GROUND_CENTER.z);
    this.rainbow.renderOrder = -1;
    this.group.add(this.rainbow);
    this.disposables.push(geo, this.rainbowMat);
  }

  /** Clusters of little flowers on the spring verges and meadows. */
  private buildFlowers() {
    const rand = rng(7);
    const s = this.track.samples, n = s.length;
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4).translate(0, 0.25, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
    this.disposables.push(geo, stemGeo, mat, stemMat);
    const colors = [0xffe14a, 0xffffff, 0xff8fc0, 0xb98cff, 0xff6a5a];
    const spots: [number, number, number][] = [];
    for (let i = 0; i < n; i += 3) {
      if (seasonIndexAt(i / n, this.hazards.offset) !== 0) continue;
      const p = s[i];
      for (const side of [-1, 1]) {
        if (rand() < 0.45) continue;
        const lat = side * (TRACK.wallOffset + 1 + rand() * 14);
        const cx = p.x + p.nx * lat, cz = p.z + p.nz * lat;
        if (Math.abs(queryTrack(this.track, cx, cz, i).lateral) < TRACK.wallOffset + 0.6) continue;
        const k = 2 + Math.floor(rand() * 4);
        for (let j = 0; j < k; j++) spots.push([cx + (rand() - 0.5) * 3, cz + (rand() - 0.5) * 3, Math.floor(rand() * colors.length)]);
      }
    }
    const heads = new THREE.InstancedMesh(geo, mat, spots.length);
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, spots.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    spots.forEach(([x, z, ci], i) => {
      m4.makeTranslation(x, 0.55, z);
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, col.set(colors[ci]));
      m4.makeTranslation(x, 0, z);
      stems.setMatrixAt(i, m4);
    });
    this.group.add(heads, stems);
    this.trees.push(heads, stems);
  }

  private buildSun() {
    // Sun sits low, straight down the summer straight.
    const t = seasonToT(GLARE_ZONE.season, SUN_AT_S, this.hazards.offset);
    const p = trackPoint(this.track, t, 0);
    this.sunDir.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    const geo = new THREE.SphereGeometry(40, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6c8).multiplyScalar(3.5), fog: false });
    this.sunMesh = new THREE.Mesh(geo, mat);
    this.sunMesh.position.set(p.x + this.sunDir.x * 1200, 110, p.z + this.sunDir.z * 1200);
    this.group.add(this.sunMesh);
    this.disposables.push(geo, mat);
  }

  private buildWeather() {
    const make = (season: number, count: number, color: number, size: number, fall: number, drift: number) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      const r = rng(season + 7);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (r() - 0.5) * 120;
        pos[i * 3 + 1] = r() * 40;
        pos[i * 3 + 2] = (r() - 0.5) * 120;
        vel[i * 3] = (r() - 0.5) * drift;
        vel[i * 3 + 1] = -fall * (0.7 + r() * 0.6);
        vel[i * 3 + 2] = (r() - 0.5) * drift;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size, map: dotTexture(), alphaTest: 0.05, transparent: true, opacity: 0, depthWrite: false });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.group.add(points);
      this.disposables.push(geo, mat);
      this.weather.push({ points, vel, season });
    };
    this.buildRain();
    make(0, 260, 0xf7b6cf, 0.5, 1.4, 3); // cherry petals drifting down
    make(1, 250, 0xfff2c0, 0.3, 0.3, 2); // dust motes
    make(2, 700, 0xe0702a, 0.55, 2.5, 4); // falling leaves
    make(3, 2000, 0xffffff, 0.35, 4, 2); // snow
  }

  /** Recolour ground for a season offset (Shifting Seasons). */
  recolor(offset: number) {
    const attr = this.ground.geometry.getAttribute('color') as THREE.BufferAttribute;
    const w = [0, 0, 0, 0];
    for (let v = 0; v < attr.count; v++) {
      mixColor(this.tmp, seasonWeights(this.track, this.groundT[v], offset, 30, w), (p) => p.ground);
      attr.setXYZ(v, this.tmp.r, this.tmp.g, this.tmp.b);
    }
    attr.needsUpdate = true;
  }

  /** Per-frame: atmosphere follows the camera's position on the track. */
  update(dt: number, t: number, camPos: THREE.Vector3) {
    this.swayUniforms.uTime.value += dt;
    this.swayUniforms.uSway.value += (this.sway - this.swayUniforms.uSway.value) * Math.min(1, dt * 4);
    const w = seasonWeights(this.track, t, this.hazards.offset, 40, this.w);
    const scene = this.scene;
    (scene.background as THREE.Color).copy(mixColor(this.tmp, w, (p) => p.sky));
    const fog = scene.fog as THREE.Fog;
    mixColor(fog.color, w, (p) => p.fog);
    fog.near = mixNumber(w, (p) => p.fogNear);
    fog.far = mixNumber(w, (p) => p.fogFar);
    mixColor(this.hemi.color, w, (p) => p.hemiSky);
    mixColor(this.hemi.groundColor, w, (p) => p.hemiGround);
    mixColor(this.sun.color, w, (p) => p.sun);
    this.sun.intensity = mixNumber(w, (p) => p.sunIntensity);
    this.sunMesh.visible = w[1] > 0.05;

    for (let i = 0; i < 4; i++) this.weights[i] = w[i];
    // Rain streaks
    {
      const mat = this.rain.material as THREE.LineBasicMaterial;
      mat.opacity += (w[0] * 0.55 - mat.opacity) * Math.min(1, dt * 2);
      this.rain.visible = mat.opacity > 0.01;
      if (this.rain.visible) {
        this.rain.position.set(camPos.x, 0, camPos.z);
        const a = this.rainPos;
        const fall = 34 * dt, slant = 3.5 * dt;
        for (let i = 0; i < a.length; i += 6) {
          a[i] += slant; a[i + 3] += slant;
          a[i + 1] -= fall; a[i + 4] -= fall;
          if (a[i + 1] < 0) { a[i + 1] += 40; a[i + 4] += 40; }
          if (a[i] > 60) { a[i] -= 120; a[i + 3] -= 120; }
        }
        (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    }
    this.rainbowMat.opacity += (w[0] * 0.32 - this.rainbowMat.opacity) * Math.min(1, dt * 1.5);
    this.rainbow.visible = this.rainbowMat.opacity > 0.01;

    for (const wt of this.weather) {
      const mat = wt.points.material as THREE.PointsMaterial;
      const target = w[wt.season];
      mat.opacity += (target * (wt.season === 0 ? 0.6 : 0.9) - mat.opacity) * Math.min(1, dt * 2);
      wt.points.visible = mat.opacity > 0.01;
      if (!wt.points.visible) continue;
      wt.points.position.set(camPos.x, 0, camPos.z);
      const pos = wt.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const wind = wt.season === 2 ? 1 : 0.2;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += (wt.vel[i] + this.windX * wind) * dt;
        arr[i + 1] += wt.vel[i + 1] * dt;
        arr[i + 2] += (wt.vel[i + 2] + this.windZ * wind) * dt;
        if (wt.season === 2) arr[i] += Math.sin(arr[i + 1] * 0.8 + i) * dt; // flutter
        if (arr[i + 1] < 0) arr[i + 1] += 40;
        if (arr[i] > 60) arr[i] -= 120; else if (arr[i] < -60) arr[i] += 120;
        if (arr[i + 2] > 60) arr[i + 2] -= 120; else if (arr[i + 2] < -60) arr[i + 2] += 120;
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const t of this.trees) t.dispose();
    this.group.removeFromParent();
  }
}
