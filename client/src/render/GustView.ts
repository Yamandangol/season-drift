// Makes autumn wind gusts visible *before* they push you: wind streaks and a swirl of
// leaves blow across the road in the gust direction during the warning, stronger while it blows.

import * as THREE from 'three';
import type { Particles } from './Effects';

const COUNT = 70;
const BOX = 55; // half-size of the streak volume around the camera
const LEAF_COLORS = [0xe0662a, 0xc8402a, 0xf0a030, 0xb8562a];

export class GustView {
  readonly mesh: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private offs = new Float32Array(COUNT * 3); // local offsets in the volume
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private scl = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private opacity = 0;
  private leafAcc = 0;

  constructor(scene: THREE.Scene, private particles: Particles) {
    const geo = new THREE.BoxGeometry(6, 0.09, 0.09);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    for (let i = 0; i < COUNT; i++) {
      this.offs[i * 3] = (Math.random() * 2 - 1) * BOX;
      this.offs[i * 3 + 1] = 0.4 + Math.random() * 5;
      this.offs[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    }
    scene.add(this.mesh);
  }

  /**
   * @param autumn 0..1 how much the camera is in autumn
   * @param warning 0..1 ramp before the gust
   * @param active gust is blowing
   */
  update(dt: number, cam: THREE.Vector3, dirX: number, dirZ: number, autumn: number, warning: number, active: boolean) {
    const target = autumn * (active ? 0.75 : 0.22 + warning * 0.3);
    this.opacity += (target - this.opacity) * Math.min(1, dt * 6);
    this.mat.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.01;
    if (!this.mesh.visible) return;

    const speed = active ? 55 : 24 + warning * 15;
    this.q.setFromAxisAngle(this.up, Math.atan2(-dirZ, dirX));
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      this.offs[j] += dirX * speed * dt;
      this.offs[j + 2] += dirZ * speed * dt;
      for (const k of [0, 2]) {
        if (this.offs[j + k] > BOX) this.offs[j + k] -= 2 * BOX;
        else if (this.offs[j + k] < -BOX) this.offs[j + k] += 2 * BOX;
      }
      this.v.set(cam.x + this.offs[j], this.offs[j + 1], cam.z + this.offs[j + 2]);
      this.scl.set(0.6 + (i % 5) * 0.25, 1, 1);
      this.m4.compose(this.v, this.q, this.scl);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Leaves swept across the road from the upwind side.
    this.leafAcc += dt * autumn * (active ? 45 : 6 + warning * 25);
    while (this.leafAcc >= 1) {
      this.leafAcc -= 1;
      const side = (Math.random() * 2 - 1) * 35;
      const x = cam.x - dirX * 28 + -dirZ * side;
      const z = cam.z - dirZ * 28 + dirX * side;
      this.particles.emit(x, 0.5 + Math.random() * 3, z, 1, LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)], {
        speed: 1.5, up: 1.5, gravity: 0.8, life: 2.2, size: 0.35, vx: dirX * speed * 0.6, vz: dirZ * speed * 0.6,
      });
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
