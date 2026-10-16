// Builds the track meshes (road ribbon, kerbs, walls, start line) from shared track data.

import * as THREE from 'three';
import { TRACK } from '@shared/constants';
import type { TrackData } from '@shared/track';

/** Ribbon between two lateral offsets, at height y. Vertex colours optional. */
function ribbon(
  data: TrackData,
  latA: number,
  latB: number,
  y: number,
  colorAt?: (i: number, out: THREE.Color) => void,
  step = 2,
): THREE.BufferGeometry {
  const s = data.samples;
  const n = s.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  // Each segment gets its own 4 vertices so vertex colours stay crisp (no gradients).
  let v = 0;
  for (let i = 0; i < n; i += step) {
    const p = s[i], q = s[(i + step) % n];
    pos.push(
      p.x + p.nx * latA, y, p.z + p.nz * latA,
      p.x + p.nx * latB, y, p.z + p.nz * latB,
      q.x + q.nx * latA, y, q.z + q.nz * latA,
      q.x + q.nx * latB, y, q.z + q.nz * latB,
    );
    if (colorAt) {
      colorAt(i, c);
      for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
    }
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical wall strip at a lateral offset. */
function wall(data: TrackData, lat: number, height: number, step = 4): THREE.BufferGeometry {
  const s = data.samples;
  const n = s.length;
  const pos: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (let i = 0; i <= n; i += step) {
    const p = s[i % n];
    const x = p.x + p.nx * lat, z = p.z + p.nz * lat;
    pos.push(x, 0, z, x, height, z);
    if (i > 0) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
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

  constructor(data: TrackData) {
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

    // Ground
    add(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2).translate(250, -0.05, 60), flat(0x7fb26a));

    // Verge (strip between road edge and wall) — slightly darker so off-road reads.
    add(ribbon(data, half, TRACK.wallOffset, 0.01), flat(0x6a9a58));
    add(ribbon(data, -TRACK.wallOffset, -half, 0.01), flat(0x6a9a58));

    // Road
    add(ribbon(data, -half, half, 0.02), flat(0x55585e));

    // Centre dashes
    const dash = new THREE.Color();
    const dashes = ribbon(
      data,
      -0.25,
      0.25,
      0.03,
      (i, out) => out.copy(Math.floor(i / 6) % 2 ? dash.set(0x55585e) : dash.set(0xe8e4d8)),
      3,
    );
    add(dashes, flat(0xffffff, { vertexColors: true }));

    // Kerbs (red/white blocks)
    const kerbColor = (i: number, out: THREE.Color) => out.set(Math.floor(i / 8) % 2 ? 0xd8423a : 0xf2f2f2);
    add(ribbon(data, half - 0.6, half + 0.4, 0.04, kerbColor, 4), flat(0xffffff, { vertexColors: true }));
    add(ribbon(data, -half - 0.4, -half + 0.6, 0.04, kerbColor, 4), flat(0xffffff, { vertexColors: true }));

    // Walls (double-sided so they read from both sides)
    const wallMat = flat(0xd9d2c3, { side: THREE.DoubleSide });
    add(wall(data, TRACK.wallOffset, TRACK.wallHeight), wallMat).castShadow = true;
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
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.removeFromParent();
  }
}
