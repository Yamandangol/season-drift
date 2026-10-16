// Autumn leaf waves drawn as little whirlwinds: a twisting funnel of pale wind streaks that widens
// with height, a dusty ring spinning on the road, all following the wave as it travels.
// (The leaves themselves come from LeafFx, spiralling up the funnel.)

import * as THREE from 'three';
import type { LeafWaves } from '@shared/leafwaves';

const HEIGHT = 6.5;

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private turns: number, private r0: number, private r1: number, private phase: number) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = this.phase + t * this.turns * Math.PI * 2;
    const r = this.r0 + (this.r1 - this.r0) * t;
    return target.set(Math.cos(a) * r, t * HEIGHT, Math.sin(a) * r);
  }
}

export class WaveView {
  readonly group = new THREE.Group();
  private funnels: THREE.Group[] = [];
  private streakMat: THREE.MeshBasicMaterial;
  private dustMat: THREE.MeshBasicMaterial;
  private disposables: { dispose(): void }[] = [];
  private time = 0;

  constructor(private waves: LeafWaves) {
    this.streakMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0xc89a62, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.disposables.push(this.streakMat, this.dustMat);
    const streaks: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.TubeGeometry(new Helix(1.6 + k * 0.15, 0.9 + k * 0.2, 3.8 + k * 0.4, (k / 4) * Math.PI * 2), 48, 0.1, 4, false);
      streaks.push(g);
      this.disposables.push(g);
    }
    // a broken ring of dust on the road
    const dust: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.RingGeometry(2.6 + k * 0.5, 3.0 + k * 0.5, 24, 1, k * 2.1, 1.9).rotateX(-Math.PI / 2);
      dust.push(g);
      this.disposables.push(g);
    }
    for (let i = 0; i < waves.pos.length; i++) {
      const f = new THREE.Group();
      const spin = new THREE.Group();
      spin.name = 'spin';
      for (const g of streaks) spin.add(new THREE.Mesh(g, this.streakMat));
      const ring = new THREE.Group();
      ring.name = 'ring';
      for (const g of dust) {
        const m = new THREE.Mesh(g, this.dustMat);
        m.position.y = 0.08;
        ring.add(m);
      }
      f.add(spin, ring);
      f.visible = false;
      this.group.add(f);
      this.funnels.push(f);
    }
  }

  /** autumnK 0..1: how much the camera is in autumn (fades the funnels in/out) */
  update(dt: number, autumnK: number, near: (x: number, z: number) => boolean) {
    this.time += dt;
    this.streakMat.opacity = 0.45 * autumnK;
    this.dustMat.opacity = 0.28 * autumnK;
    this.waves.pos.forEach((w, i) => {
      const f = this.funnels[i];
      f.visible = autumnK > 0.02 && near(w.x, w.z);
      if (!f.visible) return;
      f.position.set(w.x, 0, w.z);
      const spin = f.getObjectByName('spin')!;
      spin.rotation.y = -this.time * 5.5 - i;
      // a gentle sway of the funnel's top, like a real dust devil
      spin.rotation.z = Math.sin(this.time * 1.3 + i) * 0.08;
      spin.rotation.x = Math.cos(this.time * 1.1 + i) * 0.08;
      f.getObjectByName('ring')!.rotation.y = -this.time * 3.6;
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
