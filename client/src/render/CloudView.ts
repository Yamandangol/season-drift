// Summer clouds: puffy clouds in the sky with their shadows sliding along the road,
// plus the winter heater pads (glowing, with fire barrels) so all the new
// season-mechanic props live together.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Clouds } from '@shared/clouds';
import { HEATERS, HEATER_LEN, heaterT } from '@shared/winter';
import type { TrackData } from '@shared/track';

export class CloudView {
  readonly group = new THREE.Group();
  private puffs: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private shadowMat: THREE.MeshBasicMaterial;
  private disposables: { dispose(): void }[] = [];
  private padMat: THREE.MeshBasicMaterial;
  private flames: THREE.Mesh[] = [];
  private time = 0;

  constructor(private clouds: Clouds, track: TrackData) {
    // Cloud body: a merged cluster of soft puffs.
    const parts: THREE.BufferGeometry[] = [];
    for (const [r, x, y, z] of [[7, 0, 0, 0], [5.5, 6, -1, 1], [5, -6, -1.2, -1], [4.5, 2, 2.5, -2], [4.5, -2, 2, 2.5], [4, 9, -2, -2]]) {
      const g = new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
      g.deleteAttribute('uv');
      parts.push(g);
    }
    const cloudGeo = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888, flatShading: true });
    // Shadow: a puffy cloud silhouette (drawn once on a canvas) that fits inside the gameplay circle of radius r.
    const shadowGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const cx = cv.getContext('2d')!;
    cx.filter = 'blur(5px)';
    cx.fillStyle = '#fff';
    for (const [x, y, r] of [[0, 0.05, 0.5], [-0.46, 0.18, 0.34], [0.45, 0.14, 0.38], [-0.18, -0.3, 0.32], [0.2, -0.32, 0.3], [-0.62, -0.12, 0.2], [0.68, -0.1, 0.2]]) {
      cx.beginPath();
      cx.arc(128 + x * 118, 128 - y * 118, r * 118, 0, Math.PI * 2);
      cx.fill();
    }
    const shadowTex = new THREE.CanvasTexture(cv);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a2a3a, alphaMap: shadowTex, transparent: true, opacity: 0.6, depthWrite: false });
    this.disposables.push(cloudGeo, cloudMat, shadowGeo, this.shadowMat, shadowTex);
    for (let i = 0; i < clouds.pos.length; i++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.castShadow = false;
      this.group.add(puff);
      this.puffs.push(puff);
      const sh = new THREE.Mesh(shadowGeo, this.shadowMat);
      sh.renderOrder = 2;
      sh.rotation.y = i * 2.4; // each cloud casts a slightly different silhouette
      this.group.add(sh);
      this.shadows.push(sh);
    }

    // Heater pads: glowing orange grates across one lane, with burning barrels beside them.
    this.padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(3), transparent: true, opacity: 0.85 });
    const barrelGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 10).translate(0, 0.8, 0);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x4a4f57 });
    const flameGeo = new THREE.ConeGeometry(0.6, 1.6, 7).translate(0, 2.3, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb02a).multiplyScalar(4) });
    this.disposables.push(this.padMat, barrelGeo, barrelMat, flameGeo, flameMat);
    for (const h of HEATERS) {
      const t = heaterT(h);
      const n = track.samples.length;
      const i0 = Math.floor((t * n) - (HEATER_LEN / 2) * n / track.length), i1 = Math.ceil((t * n) + (HEATER_LEN / 2) * n / track.length);
      const pos: number[] = [];
      const idx: number[] = [];
      let v = 0;
      for (let i = i0; i <= i1; i++) {
        const p = track.samples[((i % n) + n) % n];
        pos.push(p.x + p.nx * h.lat0, 0.06, p.z + p.nz * h.lat0, p.x + p.nx * h.lat1, 0.06, p.z + p.nz * h.lat1);
        if (i > i0) idx.push(v - 2, v - 1, v, v - 1, v + 1, v, v - 2, v, v - 1, v - 1, v, v + 1);
        v += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      this.disposables.push(g);
      this.group.add(new THREE.Mesh(g, this.padMat));
      // barrels at both ends of the pad, outside its lane edge
      const pm = track.samples[Math.floor(t * n) % n];
      for (const lat of [h.lat0 - 0.9, h.lat1 + 0.9]) {
        if (Math.abs(lat) > 9.5) continue;
        for (const along of [-HEATER_LEN / 2, HEATER_LEN / 2]) {
          const b = new THREE.Mesh(barrelGeo, barrelMat);
          b.position.set(pm.x + pm.nx * lat + pm.tx * along, 0, pm.z + pm.nz * lat + pm.tz * along);
          b.scale.setScalar(0.6);
          this.group.add(b);
          const f = new THREE.Mesh(flameGeo, flameMat);
          f.position.copy(b.position);
          f.scale.setScalar(0.6);
          this.group.add(f);
          this.flames.push(f);
        }
      }
    }
  }

  /** @param summer 0..1 how much the camera is in summer (fades the clouds in/out) */
  update(dt: number) {
    this.time += dt;
    this.clouds.pos.forEach((c, i) => {
      this.puffs[i].position.set(c.x, 15, c.z);
      this.puffs[i].scale.setScalar(c.r / 9);
      this.shadows[i].position.set(c.x, 0.08, c.z);
      this.shadows[i].scale.setScalar(c.r);
    });
    this.padMat.opacity = 0.7 + 0.2 * Math.sin(this.time * 6);
    this.flames.forEach((f, i) => (f.scale.y = 0.6 * (0.8 + 0.3 * Math.sin(this.time * 12 + i))));
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
