// Spring petal chain: swirling clusters of cherry petals floating over one lane each,
// with a soft pink ring on the road. The local player's collected petals vanish until next lap.

import * as THREE from 'three';
import { PETALS, PETAL, petalT } from '@shared/petals';
import { trackPoint, type TrackData } from '@shared/track';

const PER = 30; // petals per cluster
const COLORS = [0xffb7d5, 0xff9cc6, 0xffd6e8, 0xffffff, 0xff86b8];

export class PetalView {
  readonly group = new THREE.Group();
  private inst: THREE.InstancedMesh;
  private rings: THREE.Mesh[] = [];
  private beams: THREE.Mesh[] = [];
  private beamMat: THREE.MeshBasicMaterial;
  private centers: { x: number; z: number; heading: number }[] = [];
  private ringMat: THREE.MeshBasicMaterial;
  private time = 0;
  private shown: number[]; // 0..1 per cluster (fades when collected)
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(track: TrackData) {
    const geo = new THREE.CircleGeometry(0.5, 5).scale(1, 0.62, 1);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.inst = new THREE.InstancedMesh(geo, mat, PETALS.length * PER);
    this.inst.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < PETALS.length * PER; i++) this.inst.setColorAt(i, c.set(COLORS[i % COLORS.length]));
    this.group.add(this.inst);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff8cc0, transparent: true, opacity: 0.55, depthWrite: false });
    const ringGeo = new THREE.RingGeometry(PETAL.radius - 0.55, PETAL.radius, 28).rotateX(-Math.PI / 2);
    // a soft pink light column so the next link reads from far away
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff4f9e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const beamGeo = new THREE.CylinderGeometry(1.1, 1.6, 9, 14, 1, true).translate(0, 4.5, 0);
    for (const p of PETALS) {
      const pt = trackPoint(track, petalT(p), p.lat);
      this.centers.push(pt);
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.position.set(pt.x, 0.07, pt.z);
      ring.renderOrder = 2;
      this.group.add(ring);
      this.rings.push(ring);
      const beam = new THREE.Mesh(beamGeo, this.beamMat);
      beam.position.set(pt.x, 0, pt.z);
      this.group.add(beam);
      this.beams.push(beam);
    }
    this.shown = PETALS.map(() => 1);
  }

  /** @param got indices of petals the local player has collected this pass */
  update(dt: number, got: readonly number[]) {
    this.time += dt;
    const T = this.time;
    this.ringMat.opacity = 0.4 + 0.2 * Math.sin(T * 5);
    this.beamMat.opacity = 0.18 + 0.08 * Math.sin(T * 3);
    PETALS.forEach((_, i) => {
      const want = got.includes(i) ? 0 : 1;
      this.shown[i] += (want - this.shown[i]) * Math.min(1, dt * (want ? 2 : 10));
      const k = this.shown[i];
      const c = this.centers[i];
      this.rings[i].visible = k > 0.05;
      this.beams[i].visible = k > 0.05;
      this.beams[i].scale.set(k, 1, k);
      this.rings[i].scale.setScalar(0.8 + 0.2 * k + 0.05 * Math.sin(T * 4 + i));
      for (let j = 0; j < PER; j++) {
        const a = T * (1.4 + (j % 3) * 0.35) + j * 2.399; // golden-angle spread
        const r = (0.6 + ((j * 7) % 11) / 11 * 1.7) * (1 + (1 - k) * 2.5); // burst outwards when collected
        const y = 0.5 + ((j * 5) % 9) * 0.28 + Math.sin(T * 2 + j) * 0.25 + (1 - k) * 2;
        this.v.set(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
        this.e.set(T * 2 + j, a, T * 3 + j * 0.7);
        this.q.setFromEuler(this.e);
        this.s.setScalar(k);
        this.m4.compose(this.v, this.q, this.s);
        this.inst.setMatrixAt(i * PER + j, this.m4);
      }
    });
    this.inst.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.inst.geometry.dispose();
    (this.inst.material as THREE.Material).dispose();
    this.rings[0]?.geometry.dispose();
    this.ringMat.dispose();
    this.beams[0]?.geometry.dispose();
    this.beamMat.dispose();
    this.group.removeFromParent();
  }
}
