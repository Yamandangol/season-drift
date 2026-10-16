// Visuals for autumn's falling branches: a shadow that grows on the road (the warning),
// the branch tumbling down from the canopy, then lying on the road until cleared.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FALL, type FallingBranches } from '@shared/fallingBranches';
import type { TrackData } from '@shared/track';
import type { LeafFx } from './LeafFx';

const DROP_HEIGHT = 15;

/** One branch model: log + twigs (bark) and leaf clumps (orange), merged per material. */
function buildBranchGeos(): { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const L = FALL.length;
  const parts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  const clean = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  };
  parts.push(clean(new THREE.CylinderGeometry(0.42, 0.55, L, 7).rotateZ(Math.PI / 2)));
  const twigs: [number, number, number][] = [[-1.8, 0.6, 0.7], [0.4, -0.7, -0.6], [2.2, 0.5, 0.5]];
  for (const [x, rz, ry] of twigs) {
    const g = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5).translate(0, 1.1, 0).rotateZ(rz).rotateY(ry).translate(x, 0.2, 0);
    parts.push(clean(g));
    const clump = new THREE.IcosahedronGeometry(0.9, 0).translate(0, 2.2, 0).rotateZ(rz).rotateY(ry).translate(x, 0.2, 0);
    leafParts.push(clean(clump));
  }
  leafParts.push(clean(new THREE.IcosahedronGeometry(0.8, 0).translate(-L / 2 + 0.3, 0.5, 0.2)));
  leafParts.push(clean(new THREE.IcosahedronGeometry(0.7, 0).translate(L / 2 - 0.2, 0.4, -0.3)));
  return { bark: mergeGeometries(parts)!, leaves: mergeGeometries(leafParts)! };
}

interface Slot {
  group: THREE.Group;
  shadow: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
}

export class FallingBranchView {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private disposables: { dispose(): void }[] = [];

  private lastNow = 0;

  constructor(private track: TrackData, private falling: FallingBranches, private leafFx?: LeafFx) {
    const { bark, leaves } = buildBranchGeos();
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x5a3b22, flatShading: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xe0662a, flatShading: true });
    const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    this.disposables.push(bark, leaves, barkMat, leafMat, shadowGeo);
    for (let i = 0; i < falling.branches.length; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(bark, barkMat);
      const l = new THREE.Mesh(leaves, leafMat);
      b.castShadow = l.castShadow = true;
      g.add(b, l);
      g.visible = false;
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x140a02, transparent: true, opacity: 0, depthWrite: false });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.visible = false;
      shadow.renderOrder = 1;
      this.disposables.push(shadowMat);
      this.group.add(g, shadow);
      this.slots.push({ group: g, shadow, shadowMat });
    }
  }

  update(now: number) {
    const frameDt = Math.max(0, Math.min(0.1, now - this.lastNow));
    this.lastNow = now;
    const s = this.track.samples;
    const n = s.length;
    this.falling.branches.forEach((br, i) => {
      const slot = this.slots[i];
      const show = br.phase === 'falling' || br.phase === 'down';
      slot.group.visible = show;
      slot.shadow.visible = br.phase === 'falling';
      if (!show) return;
      const p = s[Math.floor(br.t * n) % n];
      const x = p.x + p.nx * br.lat, z = p.z + p.nz * br.lat;
      // log lies across the road: its long axis (local X) along the track normal
      const yaw = Math.atan2(p.tx, p.tz) + br.spin;
      const dt = frameDt;
      if (br.phase === 'falling') {
        const k = Math.min(1, Math.max(0, (now - br.startAt) / (br.landAt - br.startAt)));
        const SNAP = 0.22; // first part: it creaks and shakes up in the canopy
        const top = DROP_HEIGHT + 1.5;
        if (k < SNAP) {
          const sh = Math.sin(now * 55) * 0.07 * (k / SNAP);
          slot.group.position.set(x, top, z);
          slot.group.rotation.set(0.25 + sh, yaw + 0.6, 0.15 - sh);
          if (this.leafFx && Math.random() < dt * 25) this.leafFx.emit(x + (Math.random() - 0.5) * 4, top, z + (Math.random() - 0.5) * 2, 1, { spread: 0.8, vy: 0, life: 2.6, size: 0.5 });
        } else {
          const kk = (k - SNAP) / (1 - SNAP);
          const y = 0.5 + (top - 0.5) * (1 - kk * kk); // accelerates like gravity
          slot.group.position.set(x, y, z);
          // tumbles end over end, settling flat just before impact
          slot.group.rotation.set((1 - kk) * 2.6 + 0.25 * (1 - kk), yaw + (1 - kk) * 0.6, Math.sin(kk * Math.PI) * 0.7);
          if (this.leafFx && Math.random() < dt * 40) this.leafFx.emit(x + (Math.random() - 0.5) * 3, y + 0.5, z + (Math.random() - 0.5) * 3, 1, { spread: 1.2, vy: 2, life: 2.2, size: 0.5 });
        }
        // warning shadow: grows and darkens as it gets close
        slot.shadow.position.set(x, 0.07, z);
        slot.shadow.rotation.y = yaw;
        slot.shadow.scale.set(FALL.length / 2 * (0.4 + 0.6 * k), 1, 1.2 * (0.4 + 0.6 * k));
        slot.shadowMat.opacity = 0.2 + 0.45 * k;
      } else {
        // down: lie still, sink away in the last second before it's cleared
        const left = br.clearAt - now;
        const sink = left < 1 ? (1 - Math.max(0, left)) * 1.2 : 0;
        // impact: a couple of bounces and a rock side to side before it settles
        const td = now - br.landAt;
        const bounce = td < 1 ? Math.abs(Math.sin(td * 8)) * 0.9 * Math.exp(-td * 5) : 0;
        const rock = td < 1.2 ? Math.sin(td * 14) * 0.22 * Math.exp(-td * 4) : 0;
        slot.group.position.set(x, 0.5 + bounce - sink, z);
        slot.group.rotation.set(rock * 0.4, yaw, rock);
      }
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
