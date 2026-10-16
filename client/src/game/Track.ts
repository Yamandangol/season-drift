// Builds the track meshes (road ribbon, verges, kerbs, walls, start line) from shared track data.
// Road + verge are vertex-coloured per season so the track itself changes with the seasons.

import * as THREE from 'three';
import { TRACK } from '@shared/constants';
import type { TrackData } from '@shared/track';
import { lakeShoreOpen } from '@shared/lake';
import { mixColor, seasonWeights } from '../render/palette';

/**
 * Ribbon between two lateral offsets over sample range [i0, i1), at height y.
 * Each segment gets its own 4 vertices so vertex colours stay crisp.
 */
export function ribbon(
  data: TrackData,
  latA: number,
  latB: number,
  y: number,
  colorAt?: (i: number, out: THREE.Color) => void,
  step = 2,
  i0 = 0,
  i1 = data.samples.length,
): THREE.BufferGeometry {
  const s = data.samples;
  const n = s.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  let v = 0;
  for (let i = i0; i < i1; i += step) {
    const p = s[((i % n) + n) % n], q = s[(((Math.min(i + step, i1)) % n) + n) % n];
    pos.push(
      p.x + p.nx * latA, y, p.z + p.nz * latA,
      p.x + p.nx * latB, y, p.z + p.nz * latB,
      q.x + q.nx * latA, y, q.z + q.nz * latA,
      q.x + q.nx * latB, y, q.z + q.nz * latB,
    );
    if (colorAt) {
      colorAt(((i % n) + n) % n, c);
      for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
    }
    // wound so the face points up (+Y) when latA < latB
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical wall strip at a lateral offset; `skip(x, z)` opens gaps (e.g. the lake shore). */
function wall(data: TrackData, lat: number, height: number, step = 4, skip?: (x: number, z: number) => boolean): THREE.BufferGeometry {
  const s = data.samples;
  const n = s.length;
  const pos: number[] = [];
  const idx: number[] = [];
  let v = 0;
  let prevOk = false;
  for (let i = 0; i <= n; i += step) {
    const p = s[i % n];
    const x = p.x + p.nx * lat, z = p.z + p.nz * lat;
    const ok = !skip || !skip(x, z);
    pos.push(x, 0, z, x, height, z);
    if (i > 0 && ok && prevOk) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
    prevOk = ok;
    v += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class TrackView {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private coloured: { geo: THREE.BufferGeometry; pick: 'road' | 'verge'; step: number }[] = [];

  constructor(private data: TrackData, offset = 0) {
    const half = TRACK.roadWidth / 2;
    const flat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
      const m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, ...extra });
      this.disposables.push(m);
      return m;
    };
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
      this.disposables.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const w = [0, 0, 0, 0];
    const seasonal = (pick: 'road' | 'verge', step: number) => (i: number, out: THREE.Color) =>
      mixColor(out, seasonWeights(data, i / data.samples.length, offset, undefined, w), (p) => p[pick]);

    // Verges (between road edge and wall)
    const vertexMat = flat(0xffffff, { vertexColors: true });
    for (const [a, b] of [[half, TRACK.wallOffset + 0.5], [-TRACK.wallOffset - 0.5, -half]]) {
      const g = ribbon(data, a, b, 0.01, seasonal('verge', 2), 2);
      add(g, vertexMat);
      this.coloured.push({ geo: g, pick: 'verge', step: 2 });
    }

    // Road
    const road = ribbon(data, -half, half, 0.02, seasonal('road', 2), 2);
    add(road, vertexMat);
    this.coloured.push({ geo: road, pick: 'road', step: 2 });

    // Lane dividers: two dashed lines -> three lanes
    const dashOnly = new THREE.BufferGeometry();
    {
      const s = data.samples, n = s.length, pos: number[] = [], idx: number[] = [];
      const laneW = TRACK.roadWidth / 3;
      let v = 0;
      for (const c of [-laneW / 2, laneW / 2]) {
        for (let i = 0; i < n; i += 12) {
          const p = s[i], q = s[(i + 6) % n];
          const a = c - 0.2, b = c + 0.2;
          pos.push(p.x + p.nx * a, 0.03, p.z + p.nz * a, p.x + p.nx * b, 0.03, p.z + p.nz * b,
            q.x + q.nx * a, 0.03, q.z + q.nz * a, q.x + q.nx * b, 0.03, q.z + q.nz * b);
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
          v += 4;
        }
      }
      dashOnly.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      dashOnly.setIndex(idx);
      dashOnly.computeVertexNormals();
    }
    add(dashOnly, flat(0xe8e4d8));

    // Kerbs (red/white blocks)
    const kerbColor = (i: number, out: THREE.Color) => out.set(Math.floor(i / 8) % 2 ? 0xd8423a : 0xf2f2f2);
    add(ribbon(data, half - 0.6, half + 0.4, 0.04, kerbColor, 4), vertexMat);
    add(ribbon(data, -half - 0.4, -half + 0.6, 0.04, kerbColor, 4), vertexMat);

    // Walls
    const wallMat = flat(0xd9d2c3);
    add(wall(data, TRACK.wallOffset, TRACK.wallHeight, 4, (x, z) => lakeShoreOpen(x, z)), wallMat).castShadow = true; // open lake shore
    add(wall(data, -TRACK.wallOffset, TRACK.wallHeight), wallMat).castShadow = true;

    // Start / finish line (checkered) at t = 0
    const s0 = data.samples[0];
    const cols = 14, rows = 2;
    const tile = TRACK.roadWidth / cols;
    const white = flat(0xffffff), black = flat(0x222222);
    const tileGeo = new THREE.PlaneGeometry(tile, tile).rotateX(-Math.PI / 2);
    this.disposables.push(tileGeo);
    const heading = Math.atan2(s0.tx, s0.tz);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = new THREE.Mesh(tileGeo, (r + c) % 2 ? white : black);
        const lat = -TRACK.roadWidth / 2 + tile * (c + 0.5);
        const along = (r - 0.5) * tile;
        m.position.set(s0.x + s0.nx * lat + s0.tx * along, 0.035, s0.z + s0.nz * lat + s0.tz * along);
        m.rotation.y = heading;
        this.group.add(m);
      }
    }
    // Start gantry posts
    const postGeo = new THREE.BoxGeometry(0.6, 6, 0.6);
    const barGeo = new THREE.BoxGeometry(TRACK.wallOffset * 2, 1, 0.8);
    this.disposables.push(postGeo, barGeo);
    const postMat = flat(0x333840);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(s0.x + s0.nx * TRACK.wallOffset * side, 3, s0.z + s0.nz * TRACK.wallOffset * side);
      this.group.add(p);
    }
    const bar = new THREE.Mesh(barGeo, black);
    bar.position.set(s0.x, 6, s0.z);
    bar.rotation.y = heading;
    this.group.add(bar);
  }

  /** Re-tint road + verges for a new season offset (Shifting Seasons). */
  recolor(offset: number) {
    const w = [0, 0, 0, 0];
    const c = new THREE.Color();
    const n = this.data.samples.length;
    for (const { geo, pick, step } of this.coloured) {
      const attr = geo.getAttribute('color') as THREE.BufferAttribute;
      let seg = 0;
      for (let i = 0; i < n; i += step, seg++) {
        mixColor(c, seasonWeights(this.data, i / n, offset, undefined, w), (p) => p[pick]);
        for (let k = 0; k < 4; k++) attr.setXYZ(seg * 4 + k, c.r, c.g, c.b);
      }
      attr.needsUpdate = true;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.removeFromParent();
  }
}
