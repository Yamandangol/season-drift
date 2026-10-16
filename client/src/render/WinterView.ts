// Winter road: a layer of fresh powder over the asphalt with packed ruts down each lane, tyre marks
// that every car leaves behind it, and the rolling snowballs.

import * as THREE from 'three';
import { RUTS } from '@shared/winter';
import { inStartZone, seasonToT, trackPoint, type TrackData } from '@shared/track';
import { ribbon } from '../game/Track';
import type { Snowballs } from '@shared/snowballs';
import type { Particles } from './Effects';

const MARKS = 3000;
const ROAD_HALF = 9.0;

export class WinterView {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private marks: THREE.InstancedMesh;
  private nextMark = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private balls: { mesh: THREE.Mesh; shadow: THREE.Mesh; roll: number }[] = [];
  private up = new THREE.Vector3(0, 1, 0);
  private axis = new THREE.Vector3();

  constructor(private track: TrackData, private snowballs: Snowballs, offset: number, private particles: Particles) {
    const n = track.samples.length;
    // winter's stretch of road, stopping short of the start/finish zone
    const t0 = seasonToT(3, 0, offset);
    let i0 = Math.floor(t0 * n), i1 = i0 + Math.floor(n / 4);
    while (i1 > i0 && inStartZone(((i1 % n) + n) % n / n, track.length)) i1--;
    i0 += 2;

    const powder = new THREE.MeshLambertMaterial({ color: 0xf3f7fb });
    const rut = new THREE.MeshLambertMaterial({ color: 0xa9b6c6 });
    const rutEdge = new THREE.MeshLambertMaterial({ color: 0xdde5ee });
    this.disposables.push(powder, rut, rutEdge);
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
      this.disposables.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    add(ribbon(track, -ROAD_HALF + 0.6, ROAD_HALF - 0.6, 0.032, undefined, 1, i0, i1), powder);
    for (const c of RUTS.lanes) {
      // a packed lane: two darker wheel tracks with a lighter, flattened strip around them
      add(ribbon(track, c - RUTS.half, c + RUTS.half, 0.036, undefined, 1, i0, i1), rutEdge);
      add(ribbon(track, c - 1.2, c - 0.7, 0.04, undefined, 1, i0, i1), rut);
      add(ribbon(track, c + 0.7, c + 1.2, 0.04, undefined, 1, i0, i1), rut);
    }

    // tyre marks (instanced quads, recycled oldest-first)
    const markGeo = new THREE.PlaneGeometry(0.32, 1.35).rotateX(-Math.PI / 2);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xa3b1c3, transparent: true, opacity: 0.5, depthWrite: false });
    this.disposables.push(markGeo, markMat);
    this.marks = new THREE.InstancedMesh(markGeo, markMat, MARKS);
    this.marks.frustumCulled = false;
    this.m4.makeScale(0, 0, 0);
    for (let i = 0; i < MARKS; i++) this.marks.setMatrixAt(i, this.m4);
    this.marks.renderOrder = 1;
    this.group.add(this.marks);

    // snowballs
    const ballGeo = new THREE.IcosahedronGeometry(1, 2);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xf6faff, flatShading: true });
    const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x40506a, transparent: true, opacity: 0.35, depthWrite: false });
    this.disposables.push(ballGeo, ballMat, shadowGeo, shadowMat);
    for (let i = 0; i < snowballs.balls.length; i++) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      mesh.castShadow = true;
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      mesh.visible = shadow.visible = false;
      this.group.add(mesh, shadow);
      this.balls.push({ mesh, shadow, roll: 0 });
    }
  }

  /** two wheel marks behind a car at (x, z) heading h */
  addMarks(x: number, z: number, h: number) {
    const rx = Math.cos(h), rz = -Math.sin(h);
    for (const side of [-0.85, 0.85]) {
      this.q.setFromAxisAngle(this.up, h);
      this.m4.compose(new THREE.Vector3(x + rx * side, 0.043, z + rz * side), this.q, new THREE.Vector3(1, 1, 1));
      this.marks.setMatrixAt(this.nextMark, this.m4);
      this.nextMark = (this.nextMark + 1) % MARKS;
    }
    this.marks.instanceMatrix.needsUpdate = true;
  }

  clearMarks() {
    this.m4.makeScale(0, 0, 0);
    for (let i = 0; i < MARKS; i++) this.marks.setMatrixAt(i, this.m4);
    this.marks.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, near: (x: number, z: number) => boolean) {
    this.snowballs.balls.forEach((b, i) => {
      const v = this.balls[i];
      const show = b.phase === 'rolling';
      v.mesh.visible = v.shadow.visible = show;
      if (!show) { v.roll = 0; return; }
      const p = trackPoint(this.track, b.t, b.lat);
      v.mesh.position.set(p.x, b.r * 0.92, p.z);
      v.mesh.scale.setScalar(b.r);
      v.shadow.position.set(p.x, 0.05, p.z);
      v.shadow.scale.setScalar(b.r * 1.05);
      // roll across the road: spin about the road's direction
      const s = this.track.samples[Math.floor(b.t * this.track.samples.length) % this.track.samples.length];
      this.axis.set(s.tx, 0, s.tz).normalize();
      v.roll += (9 / Math.max(0.5, b.r)) * dt * b.dir;
      v.mesh.quaternion.setFromAxisAngle(this.axis, v.roll);
      // snow kicked up behind it
      if (near(p.x, p.z) && Math.random() < dt * 30) {
        this.particles.emit(p.x + s.nx * b.dir * b.r * 0.8, 0.3, p.z + s.nz * b.dir * b.r * 0.8, 1, 0xffffff, { speed: 1.5, up: 3, size: 0.4, life: 0.8 });
      }
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.marks.dispose();
    this.group.removeFromParent();
  }
}
