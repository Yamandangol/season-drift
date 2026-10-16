// Visible geometry for every hazard. Rule: every hazard is visible before it hits.

import * as THREE from 'three';
import { blobShape, MOUND, type HazardMap, type PlacedHazard } from '@shared/hazards';
import type { TrackData } from '@shared/track';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ribbon } from '../game/Track';

const RIPPLES = 60;
const _v = new THREE.Vector3();

/** Small deterministic RNG so hazard decoration looks the same for everyone. */
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class HazardView {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private iceMat!: THREE.MeshPhongMaterial;
  private puddleMat!: THREE.MeshPhongMaterial;
  private time = 0;
  private puddles: PlacedHazard[] = [];
  private ripples!: THREE.InstancedMesh;
  private rippleState: { x: number; z: number; age: number; life: number }[] = [];
  private m4 = new THREE.Matrix4();

  constructor(private track: TrackData, map: HazardMap, private colorBlind = false) {
    this.build(map);
  }

  private range(h: PlacedHazard) {
    const n = this.track.samples.length;
    return [Math.floor(h.t0 * n), Math.ceil(h.t1 * n)] as const;
  }

  /** World position of a point given in a hazard's normalised blob space (u along, v lateral, -1..1). */
  private blobPoint(h: PlacedHazard, u: number, v: number, out: THREE.Vector3, y: number) {
    const s = this.track.samples, n = s.length;
    const t = (h.t0 + h.t1) / 2 + u * (h.t1 - h.t0) / 2;
    const lat = (h.lat0 + h.lat1) / 2 + v * (h.lat1 - h.lat0) / 2;
    const f = ((t % 1) + 1) % 1 * n;
    const i = Math.floor(f), k = f - i;
    const a = s[i % n], b = s[(i + 1) % n];
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    const nx = a.nx + (b.nx - a.nx) * k, nz = a.nz + (b.nz - a.nz) * k;
    return out.set(x + nx * lat, y, z + nz * lat);
  }

  /**
   * Triangle-fan blob in a hazard's space. `scale` grows/shrinks the outline,
   * (cu, cv) moves the centre, `seed`/`type` pick the outline.
   */
  private blobGeo(h: PlacedHazard, y: number, scale: number, cu = 0, cv = 0, seed = h.blob ?? 0, type = h.type, segs = 40) {
    const pos: number[] = [];
    const c = this.blobPoint(h, cu, cv, new THREE.Vector3(), y);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const r0 = blobShape(type, seed, a0) * scale, r1 = blobShape(type, seed, a1) * scale;
      this.blobPoint(h, cu + Math.cos(a0) * r0, cv + Math.sin(a0) * r0, p, y);
      this.blobPoint(h, cu + Math.cos(a1) * r1, cv + Math.sin(a1) * r1, q, y);
      // wind so the face points up whichever way the track turns
      const cross = (p.x - c.x) * (q.z - c.z) - (p.z - c.z) * (q.x - c.x);
      if (cross < 0) pos.push(c.x, y, c.z, p.x, y, p.z, q.x, y, q.z);
      else pos.push(c.x, y, c.z, q.x, y, q.z, p.x, y, p.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * A low hill over a blob outline (snow drift, leaf pile). Polar grid in blob
   * space; height falls to 0 at the rim so it melts into the road.
   * `hump` adds ridges along the length, `bump` adds per-vertex lumpiness.
   */
  private moundGeo(
    h: PlacedHazard, height: number, o: { seed?: number; scale?: number; su?: number; sv?: number; cu?: number; cv?: number; hump?: number; bump?: number;
      rings?: number; segs?: number; smooth?: boolean; color?: (r: number, rnd: () => number, out: THREE.Color) => void } = {},
  ) {
    const seed = o.seed ?? h.blob ?? 0, scale = o.scale ?? 1, cu = o.cu ?? 0, cv = o.cv ?? 0;
    const su = (o.su ?? 1) * scale, sv = (o.sv ?? 1) * scale;
    const rings = o.rings ?? 7, segs = o.segs ?? 36, hump = o.hump ?? 0, bump = o.bump ?? 0;
    const rnd = mulberry(seed * 13 + 5);
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const ringStart: number[] = [];
    const P = new THREE.Vector3();
    let n = 0;
    for (let r = 0; r <= rings; r++) {
      ringStart.push(n);
      const k = r / rings;
      for (let i = 0; i < (r === 0 ? 1 : segs); i++) {
        const th = (i / segs) * Math.PI * 2;
        const rad = k * blobShape(h.type, seed, th);
        const u = cu + Math.cos(th) * rad * su, v = cv + Math.sin(th) * rad * sv;
        let y = height * Math.pow(Math.max(0, 1 - k * k), 0.65);
        if (hump) y *= 1 - hump + hump * (0.5 + 0.5 * Math.cos(u * Math.PI * 2.2 + seed));
        if (bump && r < rings) y *= 1 + (rnd() - 0.5) * bump;
        this.blobPoint(h, u, v, P, 0.05 + y);
        pos.push(P.x, P.y, P.z);
        if (o.color) { o.color(k, rnd, c); col.push(c.r, c.g, c.b); }
        n++;
      }
    }
    const idx: number[] = [];
    const vid = (r: number, i: number) => (r === 0 ? 0 : ringStart[r] + (i % segs));
    const tri = (a: number, b: number, d: number) => {
      const cross = (pos[b * 3] - pos[a * 3]) * (pos[d * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[d * 3] - pos[a * 3]);
      if (cross < 0) idx.push(a, b, d); else idx.push(a, d, b);
    };
    for (let i = 0; i < segs; i++) tri(0, vid(1, i), vid(1, i + 1));
    for (let r = 1; r < rings; r++) {
      for (let i = 0; i < segs; i++) {
        tri(vid(r, i), vid(r + 1, i), vid(r, i + 1));
        tri(vid(r, i + 1), vid(r + 1, i), vid(r + 1, i + 1));
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    if (o.smooth) {
      g.computeVertexNormals(); // shared vertices -> soft, rounded shading
    } else {
      const flat = g.toNonIndexed(); // faceted low-poly; one colour per face
      g.dispose();
      g = flat;
      if (o.color) {
        const ca = g.getAttribute('color') as THREE.BufferAttribute;
        for (let f = 0; f < ca.count; f += 3) {
          o.color(0, rnd, c);
          for (let k = 0; k < 3; k++) ca.setXYZ(f + k, c.r, c.g, c.b);
        }
      }
      g.computeVertexNormals();
    }
    return g;
  }

  build(map: HazardMap) {
    this.clear();
    this.puddles = map.placed.filter((h) => h.type === 'puddle');
    // Everything is bucketed by material and merged at the end: few draw calls.
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
      let ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      ng.deleteAttribute('uv');
      if (!ng.getAttribute('normal')) ng.computeVertexNormals();
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m)!.push(ng);
    };
    const obj = new THREE.Object3D();
    const addAt = (g: THREE.BufferGeometry, m: THREE.Material) => {
      obj.updateMatrix();
      add(g.clone().applyMatrix4(obj.matrix), m);
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
    };
    const mat = <T extends THREE.Material>(m: T) => (this.disposables.push(m), m);

    const mud = mat(new THREE.MeshPhongMaterial({ color: 0x6b4526, shininess: 80, specular: 0x665544 }));
    const mudDark = mat(new THREE.MeshPhongMaterial({ color: 0x3f2814, shininess: 30 }));
    const mudWet = mat(new THREE.MeshPhongMaterial({ color: 0x8a6038, shininess: 120, specular: 0x998877 }));
    this.puddleMat = mat(new THREE.MeshPhongMaterial({ color: 0x5a92cf, shininess: 160, specular: 0xffffff, emissive: 0x0d2240, transparent: true, opacity: 0.92 }));
    const wetEdge = mat(new THREE.MeshPhongMaterial({ color: 0x2a3036, shininess: 90, specular: 0x667788, transparent: true, opacity: 0.75, depthWrite: false }));
    const skyGlint = mat(new THREE.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.55, depthWrite: false }));
    const shade = mat(new THREE.MeshBasicMaterial({ color: 0x0b1a08, transparent: true, opacity: 0.38, depthWrite: false }));
    const leaves = mat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.iceMat = mat(new THREE.MeshPhongMaterial({ color: 0xa9dcf0, shininess: 180, specular: 0xffffff, transparent: true, opacity: 0.93, emissive: 0x284858 }));
    const iceCrack = mat(new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
    const iceFrost = mat(new THREE.MeshLambertMaterial({ color: 0xe6f4fb, transparent: true, opacity: 0.7, depthWrite: false }));
    const snow = mat(new THREE.MeshLambertMaterial({ color: 0xf7fafc, flatShading: true }));
    const snowSoft = mat(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x222833 }));
    const leafPile = mat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const iceRim = mat(new THREE.MeshLambertMaterial({ color: 0xf2f8fc }));
    const bark = mat(new THREE.MeshLambertMaterial({ color: 0x5a3b22, flatShading: true }));
    const outline = mat(new THREE.MeshBasicMaterial({ color: 0xffee00, side: THREE.BackSide }));

    const leafColors = [0xe0662a, 0xc8402a, 0xf0a030, 0xb8562a, 0xe8c040];
    const snowMound = new THREE.IcosahedronGeometry(1, 0);
    const branchGeo = new THREE.CylinderGeometry(0.45, 0.55, 1, 7).rotateZ(Math.PI / 2);
    const twigGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 5);
    this.disposables.push(snowMound, branchGeo, twigGeo);

    for (const h of map.placed) {
      const [i0, i1] = this.range(h);
      switch (h.type) {
        case 'mud': {
          const seed = h.blob ?? h.id;
          const rnd = mulberry(seed * 31 + 7);
          // dark rim -> glossy mud -> wet sheen, plus flung splats and a few lumps
          add(this.blobGeo(h, 0.045, 1.0), mudDark);
          add(this.blobGeo(h, 0.05, 0.86), mud);
          add(this.blobGeo(h, 0.055, 0.35, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, seed + 3), mudWet);
          for (let k = 0; k < 7; k++) {
            const a = rnd() * Math.PI * 2;
            const r = blobShape('mud', seed, a) * (1.05 + rnd() * 0.25);
            add(this.blobGeo(h, 0.048, 0.06 + rnd() * 0.08, Math.cos(a) * r, Math.sin(a) * r, seed + k + 10, 'mud', 12), mudDark);
          }
          for (let k = 0; k < 5; k++) {
            const a = rnd() * Math.PI * 2, r = rnd() * 0.6;
            this.blobPoint(h, Math.cos(a) * r, Math.sin(a) * r, obj.position, 0.05);
            obj.scale.set(0.9 + rnd(), 0.25, 0.9 + rnd());
            obj.rotation.y = rnd() * 6;
            addAt(snowMound, mudDark);
          }
          break;
        }
        case 'puddle': {
          // Spilled water: wet dark edge, irregular water body, sky glint, and droplets around it.
          const seed = h.blob ?? h.id;
          const rnd = mulberry(seed * 17 + 3);
          add(this.blobGeo(h, 0.04, 1.08), wetEdge);
          add(this.blobGeo(h, 0.05, 0.95), this.puddleMat);
          add(this.blobGeo(h, 0.056, 0.32, 0.15, -0.1, seed + 5), skyGlint);
          for (let k = 0; k < 9; k++) {
            const a = rnd() * Math.PI * 2;
            const r = blobShape('puddle', seed, a) * (1.0 + rnd() * 0.3);
            const sz = 0.04 + rnd() * 0.08;
            add(this.blobGeo(h, 0.04, sz * 1.3, Math.cos(a) * r, Math.sin(a) * r, seed + k + 20, 'puddle', 14), wetEdge);
            add(this.blobGeo(h, 0.05, sz, Math.cos(a) * r, Math.sin(a) * r, seed + k + 20, 'puddle', 14), this.puddleMat);
          }
          break;
        }
        case 'shade':
          add(ribbon(this.track, h.lat0, h.lat1, 0.045, undefined, 2, i0, i1), shade);
          break;
        case 'leaves': {
          // A raked pile of leaves: lumpy low mound, every facet a different leaf colour,
          // with loose leaf clumps scattered around the edge.
          const seed = h.blob ?? h.id;
          const rnd = mulberry(seed * 7 + 1);
          const leafColor = (_r: number, rr: () => number, out: THREE.Color) => out.set(leafColors[Math.floor(rr() * leafColors.length)]);
          add(this.moundGeo(h, MOUND.leaves!.height, { bump: 0.45, rings: 7, segs: 44, color: leafColor }), leafPile);
          for (let k = 0; k < 10; k++) {
            const a = rnd() * Math.PI * 2;
            const r = blobShape('leaves', seed, a) * (1.0 + rnd() * 0.3);
            add(this.moundGeo(h, 0.3 + rnd() * 0.25, { seed: seed + k + 40, scale: 0.07 + rnd() * 0.08, cu: Math.cos(a) * r, cv: Math.sin(a) * r, rings: 2, segs: 9, bump: 0.6, color: leafColor }), leafPile);
          }
          break;
        }
        case 'ice': {
          // Frozen puddle: organic glassy sheet with a frosty rim and a few frozen splashes.
          const seed = h.blob ?? h.id;
          const rnd = mulberry(seed * 5 + 9);
          add(this.blobGeo(h, 0.045, 1.04), iceRim);
          add(this.blobGeo(h, 0.05, 0.96), this.iceMat);
          // frosty white patches on the sheet
          for (let k = 0; k < 7; k++) {
            const a = rnd() * Math.PI * 2, r = rnd() * 0.6;
            add(this.blobGeo(h, 0.054, 0.08 + rnd() * 0.12, Math.cos(a) * r, Math.sin(a) * r, seed + k + 30, 'ice', 12), iceFrost);
          }
          // white crack lines branching across the ice
          const P = new THREE.Vector3(), Q = new THREE.Vector3();
          for (let k = 0; k < 6; k++) {
            let a = rnd() * Math.PI * 2;
            let u = (rnd() - 0.5) * 0.5, v = (rnd() - 0.5) * 0.5;
            const pos: number[] = [];
            for (let s = 0; s < 6; s++) {
              const nu = u + Math.cos(a) * 0.14, nv = v + Math.sin(a) * 0.14;
              if (Math.hypot(nu, nv) > 0.85) break;
              this.blobPoint(h, u, v, P, 0.058);
              this.blobPoint(h, nu, nv, Q, 0.058);
              const dx = Q.x - P.x, dz = Q.z - P.z, l = Math.hypot(dx, dz) || 1;
              const w = 0.11, ox = (-dz / l) * w, oz = (dx / l) * w;
              pos.push(P.x - ox, 0.058, P.z - oz, Q.x - ox, 0.058, Q.z - oz, Q.x + ox, 0.058, Q.z + oz,
                P.x - ox, 0.058, P.z - oz, Q.x + ox, 0.058, Q.z + oz, P.x + ox, 0.058, P.z + oz);
              u = nu; v = nv; a += (rnd() - 0.5) * 1.2;
            }
            if (!pos.length) continue;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            add(g, iceCrack);
          }
          break;
        }
        case 'snow': {
          // A wind-blown snow drift: smooth hill with a couple of humps along its length,
          // bluish in the shaded lower edge, plus little clumps thrown around it.
          const seed = h.blob ?? h.id;
          const rnd = mulberry(seed * 11 + 3);
          const snowColor = (r: number, rr: () => number, out: THREE.Color) =>
            out.setRGB(0.86 + 0.12 * (1 - r) + rr() * 0.02, 0.9 + 0.09 * (1 - r) + rr() * 0.01, 0.97);
          // Long drifts are several soft heaps (same heaps the physics uses: packed-solid core, soft rim).
          for (const hp of h.heaps ?? []) {
            add(this.moundGeo(h, MOUND.snow!.height * hp.hMul, {
              seed: hp.seed, su: hp.su, sv: hp.sv, cu: hp.cu, cv: hp.cv,
              rings: 7, segs: 28, smooth: true, color: snowColor,
            }), snowSoft);
          }
          for (let k = 0; k < 8; k++) {
            const a = rnd() * Math.PI * 2;
            const r = blobShape('snow', seed, a) * (1.02 + rnd() * 0.25);
            add(this.moundGeo(h, 0.35 + rnd() * 0.4, { seed: seed + k + 50, scale: 0.05 + rnd() * 0.07, cu: Math.cos(a) * r, cv: Math.sin(a) * r, rings: 3, segs: 10, color: snowColor }), snowSoft);
          }
          break;
        }
        case 'branch': {
          const s = this.track.samples, n = s.length;
          const p = s[Math.floor(((h.t0 + h.t1) / 2) * n) % n];
          const latMid = (h.lat0 + h.lat1) / 2;
          const width = h.lat1 - h.lat0;
          const yaw = Math.atan2(p.tx, p.tz);
          obj.scale.set(width, 1, 1);
          obj.position.set(p.x + p.nx * latMid, 0.5, p.z + p.nz * latMid);
          obj.rotation.y = yaw;
          addAt(branchGeo, bark);
          for (let k = 0; k < 3; k++) {
            const l = h.lat0 + (width * (k + 0.5)) / 3;
            obj.position.set(p.x + p.nx * l, 0.9, p.z + p.nz * l);
            obj.rotation.set(0.6 * (k % 2 ? 1 : -1), yaw, 0.5, 'YXZ');
            addAt(twigGeo, bark);
          }
          if (this.colorBlind) {
            obj.scale.set(width + 0.3, 1.3, 1.3);
            obj.position.set(p.x + p.nx * latMid, 0.5, p.z + p.nz * latMid);
            obj.rotation.y = yaw;
            addAt(branchGeo, outline);
          }
          break;
        }
      }
    }

    for (const [m, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      this.disposables.push(merged);
      const mesh = new THREE.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.castShadow = m === bark;
      this.group.add(mesh);
    }

    // Rain ripples on the puddles (instanced rings that grow and fade).
    const ringGeo = new THREE.RingGeometry(0.75, 1, 18).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.disposables.push(ringGeo, ringMat);
    this.ripples = new THREE.InstancedMesh(ringGeo, ringMat, RIPPLES);
    this.ripples.frustumCulled = false;
    this.rippleState = [];
    for (let i = 0; i < RIPPLES; i++) {
      this.rippleState.push({ x: 0, z: 0, age: 1, life: 1 });
      this.m4.makeScale(0, 0, 0);
      this.ripples.setMatrixAt(i, this.m4);
    }
    this.group.add(this.ripples);
  }

  /** Spawn/advance ripples on puddles near the camera; `rain` 0..1 is how much it's raining. */
  updateRipples(dt: number, cam: THREE.Vector3, rain: number) {
    if (!this.ripples) return;
    this.ripples.visible = rain > 0.05;
    if (!this.ripples.visible) return;
    const near = this.puddles.filter((h) => this.blobPoint(h, 0, 0, _v, 0).distanceToSquared(cam) < 160 * 160);
    for (let i = 0; i < RIPPLES; i++) {
      const r = this.rippleState[i];
      r.age += dt;
      if (r.age >= r.life) {
        if (!near.length || Math.random() > rain) {
          this.m4.makeScale(0, 0, 0);
          this.ripples.setMatrixAt(i, this.m4);
          r.age = 0;
          r.life = 0.2 + Math.random() * 0.4;
          continue;
        }
        const h = near[Math.floor(Math.random() * near.length)];
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * blobShape('puddle', h.blob ?? 0, a) * 0.85;
        this.blobPoint(h, Math.cos(a) * rr, Math.sin(a) * rr, _v, 0.06);
        r.x = _v.x;
        r.z = _v.z;
        r.age = 0;
        r.life = 0.5 + Math.random() * 0.5;
      }
      const k = r.age / r.life;
      const sc = 0.15 + k * 0.9;
      this.m4.makeScale(sc, 1, sc).setPosition(r.x, 0.062, r.z);
      this.ripples.setMatrixAt(i, this.m4);
    }
    this.ripples.instanceMatrix.needsUpdate = true;
  }

  /** subtle shimmer so ice is hard-but-possible to see */
  update(dt: number) {
    this.time += dt;
    if (this.iceMat) { const g = 0.5 + 0.5 * Math.sin(this.time * 3); this.iceMat.emissive.setRGB(0.14 + 0.06 * g, 0.26 + 0.07 * g, 0.33 + 0.08 * g); }
    if (this.puddleMat) this.puddleMat.opacity = 0.88 + 0.05 * Math.sin(this.time * 2);
  }

  private clear() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
