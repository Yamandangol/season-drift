// Visuals for autumn's falling branches: a shadow that grows on the road (the warning),
// the branch tumbling down from the canopy, then lying on the road until cleared.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FALL, type FallingBranches } from '@shared/fallingBranches';
import type { TrackData } from '@shared/track';

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

  constructor(private track: TrackData, private falling: FallingBranches) {
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
      if (br.phase === 'falling') {
        const k = Math.min(1, Math.max(0, (now - br.startAt) / (br.landAt - br.startAt)));
        const y = 0.5 + DROP_HEIGHT * (1 - k * k); // accelerates like gravity
        slot.group.position.set(x, y, z);
        slot.group.rotation.set((1 - k) * 1.2, yaw + (1 - k) * 1.5, (1 - k) * 0.6);
        // warning shadow: grows and darkens as it gets close
        slot.shadow.position.set(x, 0.07, z);
        slot.shadow.rotation.y = yaw;
        slot.shadow.scale.set(FALL.length / 2 * (0.4 + 0.6 * k), 1, 1.2 * (0.4 + 0.6 * k));
        slot.shadowMat.opacity = 0.2 + 0.45 * k;
      } else {
        // down: lie still, sink away in the last second before it's cleared
        const left = br.clearAt - now;
        const sink = left < 1 ? (1 - Math.max(0, left)) * 1.2 : 0;
        slot.group.position.set(x, 0.5 - sink, z);
        slot.group.rotation.set(0, yaw, 0);
      }
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
