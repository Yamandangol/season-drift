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
  private padMats: THREE.MeshBasicMaterial[] = [];
  private flags: THREE.Mesh[] = [];
  private flames: { m: THREE.Mesh; hi: number }[] = [];
  private fuel: number[] = [];
  private relight: number[] = [];
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

    // Snow ramps (where the heaters used to be): a wedge across one lane rising to a lip. Built to be
    // seen from far off on a white road: orange/white stripes up the face, dark sides, a glowing lip,
    // tall flagged poles, and orange arrows painted on the road leading into the ramp lane.
    this.padMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const rampMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x34405a, flatShading: true });
    const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a1a).multiplyScalar(2.2) });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.14, 4.2, 6).translate(0, 2.1, 0);
    const stripeGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 6);
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.2, 0, 0, 3.2, 0, 1.4, 3.7, 0], 3));
    flagGeo.computeVertexNormals();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x20242e });
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xff6a1a, emissive: 0x662200 });
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xff5a14, emissive: 0x7a2200, side: THREE.DoubleSide });
    this.disposables.push(this.padMat, rampMat, sideMat, lipMat, arrowMat, poleGeo, stripeGeo, flagGeo, poleMat, stripeMat, flagMat);
    const ORANGE = new THREE.Color(0xff6a1a), WHITE = new THREE.Color(0xf4f8fc);
    HEATERS.forEach((h) => {
      const t = heaterT(h);
      const n = track.samples.length;
      const i0 = Math.floor((t * n) - (HEATER_LEN / 2) * n / track.length), i1 = Math.ceil((t * n) + (HEATER_LEN / 2) * n / track.length);
      const top: number[] = [], topCol: number[] = [], side: number[] = [];
      const P = (i: number, lat: number, y: number) => { const p = track.samples[((i % n) + n) % n]; return [p.x + p.nx * lat, y, p.z + p.nz * lat]; };
      const H = (i: number) => 0.05 + 1.25 * Math.pow((i - i0) / (i1 - i0), 1.4);
      for (let i = i0; i < i1; i++) {
        const a0 = P(i, h.lat0, H(i)), a1 = P(i, h.lat1, H(i)), b0 = P(i + 1, h.lat0, H(i + 1)), b1 = P(i + 1, h.lat1, H(i + 1));
        top.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
        const c = ((i - i0) >> 1) % 2 === 0 ? ORANGE : WHITE; // bold bands up the face
        for (let k = 0; k < 6; k++) topCol.push(c.r, c.g, c.b);
        for (const lat of [h.lat0, h.lat1]) {
          const u0 = P(i, lat, H(i)), u1 = P(i + 1, lat, H(i + 1)), d0 = P(i, lat, 0), d1 = P(i + 1, lat, 0);
          side.push(...d0, ...u0, ...d1, ...d1, ...u0, ...u1);
        }
      }
      // the lip: a vertical face at the far end
      { const u0 = P(i1, h.lat0, H(i1)), u1 = P(i1, h.lat1, H(i1)), d0 = P(i1, h.lat0, 0), d1 = P(i1, h.lat1, 0); side.push(...d0, ...d1, ...u0, ...u0, ...d1, ...u1); }
      const mk = (arr: number[], mat: THREE.Material, col?: number[]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        this.disposables.push(g);
        const m = new THREE.Mesh(g, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
      };
      mk(top, rampMat, topCol);
      mk(side, sideMat);
      // a glowing bar along the lip
      {
        const l0 = P(i1, h.lat0, H(i1)), l1 = P(i1, h.lat1, H(i1));
        const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(l1[0] - l0[0], l1[2] - l0[2]), 0.18, 0.3), lipMat);
        this.disposables.push(bar.geometry);
        bar.position.set((l0[0] + l1[0]) / 2, l0[1] + 0.05, (l0[2] + l1[2]) / 2);
        bar.rotation.y = -Math.atan2(l1[2] - l0[2], l1[0] - l0[0]);
        this.group.add(bar);
      }
      // tall striped poles with flags either side of the lip
      for (const lat of [h.lat0 - 0.6, h.lat1 + 0.6]) {
        const [x, , z] = P(i1, lat, 0);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 0, z);
        this.group.add(pole);
        for (const y of [1.2, 2.3]) {
          const st = new THREE.Mesh(stripeGeo, stripeMat);
          st.position.set(x, y, z);
          this.group.add(st);
        }
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(x, 0, z);
        const s0 = track.samples[((i1 % n) + n) % n];
        flag.rotation.y = Math.atan2(s0.tx, s0.tz) + Math.PI / 2;
        this.group.add(flag);
        this.flags.push(flag);
      }
      // orange chevrons on the road leading into the ramp lane
      const mid = (h.lat0 + h.lat1) / 2;
      for (const back of [10, 18, 26]) {
        const ic = Math.round(i0 - back * n / track.length);
        const tip = P(ic + 2, mid, 0.05), l = P(ic - 1, mid - 2.2, 0.05), r = P(ic - 1, mid + 2.2, 0.05);
        const li = P(ic, mid - 2.2, 0.05), ri = P(ic, mid + 2.2, 0.05), tipIn = P(ic + 3, mid, 0.05);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([...l, ...li, ...tip, ...tip, ...li, ...tipIn, ...r, ...tip, ...ri, ...ri, ...tip, ...tipIn], 3));
        g.computeVertexNormals();
        this.disposables.push(g);
        const m = new THREE.Mesh(g, arrowMat);
        m.renderOrder = 2;
        this.group.add(m);
      }
    });
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
    // pads glow by fuel left; a burnt-out pad goes dark grey, then flickers back as it relights
    // flags flutter
    this.flags.forEach((f, i) => (f.scale.x = 0.85 + 0.15 * Math.sin(this.time * 7 + i)));
    this.padMats.forEach((m, i) => {
      const fuel = this.fuel[i] ?? 1;
      const out = (this.relight[i] ?? 0) > 0;
      const k = out ? 0 : 0.35 + 0.65 * fuel;
      m.color.setRGB(0.25 + 0.75 * k * 1.8, 0.25 + 0.23 * k * 1.8, 0.25 + 0.0 * k);
      m.opacity = out ? 0.55 + (this.relight[i] < 2 ? 0.3 * Math.max(0, Math.sin(this.time * 18)) : 0) : 0.7 + 0.2 * Math.sin(this.time * 6);
    });
    this.flames.forEach(({ m, hi }, i) => {
      const out = (this.relight[hi] ?? 0) > 0;
      const k = out ? 0.05 : 0.35 + 0.65 * (this.fuel[hi] ?? 1);
      m.visible = k > 0.06;
      m.scale.set(0.6 * k, 0.6 * k * (0.8 + 0.3 * Math.sin(this.time * 12 + i)), 0.6 * k);
    });
  }

  /** heater fuel (0..1) and seconds until relight (0 = lit) */
  setHeaters(fuel: number[], relight: number[]) {
    this.fuel = fuel;
    this.relight = relight;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
