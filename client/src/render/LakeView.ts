// Winter's frozen lake: glassy ice inside the corner, snowbanks on its straight edges,
// orange marker poles at the open shore, and crack decals that spread under slow cars.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAKE } from '@shared/lake';

const CRACKS = 90;

export class LakeView {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private iceMat: THREE.MeshPhongMaterial;
  private cracks: THREE.InstancedMesh;
  private crackAge = new Float32Array(CRACKS).fill(99);
  private crackNext = 0;
  private hole: THREE.Mesh;
  private holeAge = 99;
  private m4 = new THREE.Matrix4();
  private time = 0;

  constructor() {
    const { cx, cz, r, a0, a1 } = LAKE;
    // Ice sheet: a quarter disc. CircleGeometry lies in XY; rotate onto the ground.
    const ice = new THREE.CircleGeometry(r + 0.3, 48, a0, a1 - a0);
    // Circle is in XY (angle from +X toward +Y). We want angle from +X toward +Z, so map y -> z.
    ice.rotateX(Math.PI / 2);
    ice.translate(cx, 0.03, cz);
    this.iceMat = new THREE.MeshPhongMaterial({ color: 0xbfe2f5, shininess: 90, specular: 0x8899aa, emissive: 0x16303f, side: THREE.DoubleSide });
    const iceMesh = new THREE.Mesh(ice, this.iceMat);
    iceMesh.receiveShadow = true;
    this.group.add(iceMesh);

    // Frosty streaks on the ice so you can feel your speed.
    const streakGeos: THREE.BufferGeometry[] = [];
    const rnd = mulberry(77);
    for (let i = 0; i < 60; i++) {
      const a = a0 + rnd() * (a1 - a0), d = rnd() * r * 0.95;
      const g = new THREE.PlaneGeometry(2 + rnd() * 7, 0.18 + rnd() * 0.25).rotateX(-Math.PI / 2).rotateY(rnd() * Math.PI);
      g.translate(cx + Math.cos(a) * d, 0.04, cz + Math.sin(a) * d);
      g.deleteAttribute('uv');
      streakGeos.push(g);
    }
    const streaks = new THREE.Mesh(mergeGeometries(streakGeos)!, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    streakGeos.forEach((g) => g.dispose());
    this.group.add(streaks);

    // Snowbanks along the two straight edges (soft heaps).
    const bankGeos: THREE.BufferGeometry[] = [];
    const heap = new THREE.SphereGeometry(1, 10, 6);
    heap.deleteAttribute('uv');
    for (const edgeA of [a0, a1]) {
      for (let d = 2; d < r + 2; d += 2.6) {
        const g = heap.clone();
        g.scale(2.2 + rnd(), 0.9 + rnd() * 0.7, 2.2 + rnd());
        const off = 2.2; // sit just outside the lake edge
        const ex = Math.cos(edgeA), ez = Math.sin(edgeA);
        // outward normal of the edge (away from the lake): for a0 (+z dir) it's +x; for a1 (-x dir) it's -z
        const ox = edgeA === a0 ? 1 : 0, oz = edgeA === a0 ? 0 : -1;
        g.translate(cx + ex * d + ox * off, 0, cz + ez * d + oz * off);
        bankGeos.push(g);
      }
    }
    const banks = new THREE.Mesh(mergeGeometries(bankGeos)!, new THREE.MeshLambertMaterial({ color: 0xf4f8fb }));
    bankGeos.forEach((g) => g.dispose());
    banks.castShadow = true;
    banks.receiveShadow = true;
    this.group.add(banks);

    // Orange marker poles along the open shore, so the shortcut reads from the road.
    const poleGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      const g = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6).translate(0, 1.2, 0);
      g.deleteAttribute('uv');
      g.translate(cx + Math.cos(a) * (r - 1), 0, cz + Math.sin(a) * (r - 1));
      poleGeos.push(g);
    }
    const poles = new THREE.Mesh(mergeGeometries(poleGeos)!, new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    poleGeos.forEach((g) => g.dispose());
    this.group.add(poles);

    // Crack decals (instanced, reused round-robin).
    const crackGeo = crackShape();
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x2a4a66, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.cracks = new THREE.InstancedMesh(crackGeo, crackMat, CRACKS);
    this.cracks.frustumCulled = false;
    for (let i = 0; i < CRACKS; i++) {
      this.m4.makeScale(0, 0, 0);
      this.cracks.setMatrixAt(i, this.m4);
    }
    this.group.add(this.cracks);

    // Hole left when someone falls through.
    const holeGeo = new THREE.CircleGeometry(3.2, 14).rotateX(-Math.PI / 2);
    this.hole = new THREE.Mesh(holeGeo, new THREE.MeshPhongMaterial({ color: 0x0b2a44, shininess: 120, specular: 0x88aacc }));
    this.hole.visible = false;
    this.group.add(this.hole);

    this.disposables.push(ice, this.iceMat, streaks.geometry, streaks.material as THREE.Material, heap, banks.geometry, banks.material as THREE.Material,
      poles.geometry, poles.material as THREE.Material, crackGeo, crackMat, holeGeo, this.hole.material as THREE.Material);
  }

  /** Leave a crack under a car (call while the ice is cracking). */
  addCrack(x: number, z: number, size: number) {
    const i = this.crackNext;
    this.crackNext = (this.crackNext + 1) % CRACKS;
    this.crackAge[i] = 0;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    this.m4.compose(new THREE.Vector3(x + (Math.random() - 0.5) * 2, 0.05, z + (Math.random() - 0.5) * 2), q, new THREE.Vector3(size, 1, size));
    this.cracks.setMatrixAt(i, this.m4);
    this.cracks.instanceMatrix.needsUpdate = true;
  }

  breakAt(x: number, z: number) {
    this.hole.position.set(x, 0.055, z);
    this.hole.visible = true;
    this.holeAge = 0;
  }

  update(dt: number) {
    this.time += dt;
    this.iceMat.emissive.setRGB(0.08, 0.17 + 0.03 * Math.sin(this.time * 1.5), 0.24 + 0.04 * Math.sin(this.time * 1.5));
    // cracks slowly freeze over after a while
    let changed = false;
    for (let i = 0; i < CRACKS; i++) {
      if (this.crackAge[i] > 98) continue;
      this.crackAge[i] += dt;
      if (this.crackAge[i] > 14) {
        this.crackAge[i] = 99;
        this.m4.makeScale(0, 0, 0);
        this.cracks.setMatrixAt(i, this.m4);
        changed = true;
      }
    }
    if (changed) this.cracks.instanceMatrix.needsUpdate = true;
    if (this.hole.visible) {
      this.holeAge += dt;
      if (this.holeAge > 10) this.hole.visible = false;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.cracks.dispose();
    this.group.removeFromParent();
  }
}

/** A star-burst crack: thin jagged lines out from the centre. */
function crackShape(): THREE.BufferGeometry {
  const pos: number[] = [];
  const rnd = mulberry(5);
  for (let k = 0; k < 7; k++) {
    let a = (k / 7) * Math.PI * 2 + rnd() * 0.5;
    let x = 0, z = 0;
    for (let s = 0; s < 4; s++) {
      const len = 0.5 + rnd() * 0.7;
      a += (rnd() - 0.5) * 0.9;
      const nx = x + Math.cos(a) * len, nz = z + Math.sin(a) * len;
      const w = 0.07 * (1 - s / 4) + 0.02;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(x - px, 0, z - pz, nx - px, 0, nz - pz, nx + px, 0, nz + pz);
      pos.push(x - px, 0, z - pz, nx + px, 0, nz + pz, x + px, 0, z + pz);
      x = nx;
      z = nz;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
