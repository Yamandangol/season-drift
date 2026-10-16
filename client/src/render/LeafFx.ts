// Autumn leaves as real leaves: flat, two-sided leaf shapes that spin, flutter side to side and
// drift down slowly (air drag), then lie on the road and fade. One instanced mesh, one draw call.
// Optional swirl: leaves orbit a moving centre (the leaf waves become little whirlwinds).

import * as THREE from 'three';

const MAX = 700;
export const LEAF_COLORS = [0xe0662a, 0xc8402a, 0xf0a030, 0xb8541e, 0xd9822b, 0x9c3b1a];

export interface LeafEmit {
  vx?: number; vy?: number; vz?: number;
  spread?: number; // random speed added in every direction
  life?: number;
  size?: number;
  /** orbit this centre (world x/z) at w rad/s, drifting with (cvx, cvz) */
  swirl?: { cx: number; cz: number; w: number; cvx?: number; cvz?: number };
}

export class LeafFx {
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private rot = new Float32Array(MAX * 3);
  private spin = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private phase = new Float32Array(MAX);
  private sw = new Float32Array(MAX * 5); // cx, cz, w, cvx, cvz
  private alive = new Uint8Array(MAX);
  private next = 0;
  private t = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    // a leaf: pointed oval with a little stem, in the XZ plane
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.55);
    shape.quadraticCurveTo(0.42, -0.2, 0.3, 0.2);
    shape.quadraticCurveTo(0.18, 0.5, 0, 0.62);
    shape.quadraticCurveTo(-0.18, 0.5, -0.3, 0.2);
    shape.quadraticCurveTo(-0.42, -0.2, 0, -0.55);
    const geo = new THREE.ShapeGeometry(shape, 3).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < MAX; i++) {
      this.m4.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, this.c.set(LEAF_COLORS[i % LEAF_COLORS.length]));
    }
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, count: number, o: LeafEmit = {}) {
    const { vx = 0, vy = 2, vz = 0, spread = 3, life = 2.2, size = 0.5, swirl } = o;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const j = i * 3;
      this.pos[j] = x + (Math.random() - 0.5) * 0.8;
      this.pos[j + 1] = y + Math.random() * 0.4;
      this.pos[j + 2] = z + (Math.random() - 0.5) * 0.8;
      this.vel[j] = vx + (Math.random() - 0.5) * spread * 2;
      this.vel[j + 1] = vy + Math.random() * spread;
      this.vel[j + 2] = vz + (Math.random() - 0.5) * spread * 2;
      this.rot[j] = Math.random() * 6.28; this.rot[j + 1] = Math.random() * 6.28; this.rot[j + 2] = Math.random() * 6.28;
      this.spin[j] = (Math.random() - 0.5) * 8; this.spin[j + 1] = (Math.random() - 0.5) * 5; this.spin[j + 2] = (Math.random() - 0.5) * 8;
      this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.size[i] = size * (0.7 + Math.random() * 0.6);
      this.phase[i] = Math.random() * 6.28;
      const s5 = i * 5;
      if (swirl) {
        this.sw[s5] = swirl.cx; this.sw[s5 + 1] = swirl.cz; this.sw[s5 + 2] = swirl.w * (0.7 + Math.random() * 0.6);
        this.sw[s5 + 3] = swirl.cvx ?? 0; this.sw[s5 + 4] = swirl.cvz ?? 0;
      } else this.sw[s5 + 2] = 0;
      this.alive[i] = 1;
      this.mesh.setColorAt(i, this.c.set(LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    this.t += dt;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      any = true;
      const j = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.m4.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m4);
        continue;
      }
      const onGround = this.pos[j + 1] <= 0.06;
      if (!onGround) {
        // gravity against heavy air drag: leaves drift, they don't drop
        this.vel[j + 1] -= 6 * dt;
        const drag = Math.exp(-2.2 * dt);
        this.vel[j] *= drag; this.vel[j + 1] *= drag; this.vel[j + 2] *= drag;
        if (this.vel[j + 1] < -2.2) this.vel[j + 1] = -2.2; // terminal velocity
        // flutter: a side-to-side rocking as they fall
        const fl = Math.sin(this.t * 4 + this.phase[i]) * 1.4 * dt;
        this.pos[j] += this.vel[j] * dt + fl;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.pos[j + 2] += this.vel[j + 2] * dt + Math.cos(this.t * 3.3 + this.phase[i]) * 0.9 * dt;
        this.rot[j] += this.spin[j] * dt; this.rot[j + 1] += this.spin[j + 1] * dt; this.rot[j + 2] += this.spin[j + 2] * dt;
        // whirlwind: orbit the (moving) centre
        const s5 = i * 5;
        const w = this.sw[s5 + 2];
        if (w !== 0) {
          this.sw[s5] += this.sw[s5 + 3] * dt;
          this.sw[s5 + 1] += this.sw[s5 + 4] * dt;
          const cx = this.sw[s5], cz = this.sw[s5 + 1];
          const dx = this.pos[j] - cx, dz = this.pos[j + 2] - cz;
          const a = w * dt, ca = Math.cos(a), sa = Math.sin(a);
          this.pos[j] = cx + dx * ca - dz * sa;
          this.pos[j + 2] = cz + dx * sa + dz * ca;
          this.pos[j] += this.sw[s5 + 3] * dt;
          this.pos[j + 2] += this.sw[s5 + 4] * dt;
        }
        if (this.pos[j + 1] < 0.06) { this.pos[j + 1] = 0.06; this.rot[j] = 0; this.rot[j + 2] = 0; } // land flat
      }
      const f = Math.min(1, this.life[i] / Math.min(0.6, this.maxLife[i]));
      const sz = this.size[i] * f;
      this.e.set(this.rot[j], this.rot[j + 1], this.rot[j + 2]);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]), this.q, this.s.set(sz, sz, sz));
      this.mesh.setMatrixAt(i, this.m4);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
