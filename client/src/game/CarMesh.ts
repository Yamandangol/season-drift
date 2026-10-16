// Low-poly box car, built from primitives. Faces +Z.

import * as THREE from 'three';

export const PLAYER_COLORS = [0xe0413a, 0x3a7be0, 0xf0c419, 0x9b4fd6];

export function createCarMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222428, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd3f0, flatShading: true });
  const stripe = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 3.6), body);
  chassis.position.y = 0.55;
  g.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.7), glass);
  cabin.position.set(0, 1.12, -0.25);
  g.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.4), body);
  roof.position.set(0, 1.44, -0.3);
  g.add(roof);

  // Pattern stripe (colour-blind friendly identity)
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 3.62), stripe);
  s.position.y = 0.56;
  g.add(s);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1, 1.15], [1, 1.15], [-1, -1.15], [1, -1.15]] as const) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.42, z);
    g.add(w);
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat.dispose();
    }
  });
}
