// Low-poly box car, built from primitives. Faces +Z.

import * as THREE from 'three';

export const PLAYER_COLORS = [0xe0413a, 0x3a7be0, 0xf0c419, 0x9b4fd6, 0x2fb36a];

export function createCarMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.32, metalness: 0.25 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222428, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6d9fc0, flatShading: true, roughness: 0.08, metalness: 0.6 });
  const stripe = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 3.6), body);
  chassis.position.y = 0.55;
  chassis.name = 'body';
  g.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.7), glass);
  cabin.position.set(0, 1.12, -0.25);
  g.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.4), body);
  roof.position.set(0, 1.44, -0.3);
  g.add(roof);

  // Head- and tail-lights (bright enough to bloom)
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6d8).multiplyScalar(5) }); // >1 so it blooms
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(5) });
  for (const x of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.06), headMat);
    h.position.set(x, 0.66, 1.81);
    g.add(h);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.06), tailMat);
    tl.position.set(x, 0.68, -1.81);
    tl.name = 'tail';
    g.add(tl);
  }
  // spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.38), dark);
  spoiler.position.set(0, 1.08, -1.62);
  g.add(spoiler);
  for (const x of [-0.7, 0.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.12), dark);
    post.position.set(x, 0.92, -1.62);
    g.add(post);
  }

  // Pattern stripe (colour-blind friendly identity)
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 3.62), stripe);
  s.position.y = 0.56;
  g.add(s);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.37, 0.5, 0.12);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xc9ced6, flatShading: true });
  for (const [x, z] of [[-1, 1.15], [1, 1.15], [-1, -1.15], [1, -1.15]] as const) {
    // wheel group spins around X (main.ts); front wheels also steer (rotation.y on the pivot)
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    pivot.name = z > 0 ? 'steer' : '';
    const w = new THREE.Group();
    w.name = 'wheel';
    w.add(new THREE.Mesh(wheelGeo, dark));
    w.add(new THREE.Mesh(hubGeo, hubMat)); // spoke so the spin is visible
    pivot.add(w);
    g.add(pivot);
  }

  // Autumn sail (hidden until the car is in autumn). Pivot = mast; boom swings with the wind.
  const sail = new THREE.Group();
  sail.name = 'sail';
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6).translate(0, 1.8, 0), dark);
  sail.add(mast);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.15, 0, 0, 3.5, 0, 0, 0.15, -2.6], 3));
  tri.computeVertexNormals();
  const cloth = new THREE.MeshLambertMaterial({ color: 0xfff6e8, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(tri, cloth);
  sheet.name = 'sheet';
  sail.add(sheet);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.6).translate(0, 0.15, -1.3), dark);
  sail.add(boom);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4).translate(0.35, 0, 0), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  flag.position.y = 3.5;
  sail.add(flag);
  sail.position.set(0, 1.5, 0.4);
  sail.visible = false;
  g.add(sail);

  // Winter snow pile (scaled by how much snow is on the car).
  const pile = new THREE.Group();
  pile.name = 'snowpile';
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf6faff, flatShading: true });
  // 14 lumps that appear one by one as snow builds up (roof first, then bonnet, boot, sides)
  const lumps: [number, number, number, number][] = [
    [0.7, 0, 1.5, -0.3], [0.55, 0.45, 1.45, 0.2], [0.55, -0.45, 1.45, -0.7], [0.6, 0.4, 1.0, 1.2], [0.6, -0.4, 1.0, 1.3],
    [0.6, 0.45, 1.0, -1.4], [0.6, -0.45, 1.0, -1.3], [0.75, 0, 1.85, -0.3], [0.5, 0.95, 0.9, 0.3], [0.5, -0.95, 0.9, -0.4],
    [0.7, 0, 1.15, 1.5], [0.7, 0, 1.15, -1.6], [0.65, 0.3, 2.2, 0], [0.6, -0.3, 2.1, -0.6],
  ];
  lumps.forEach(([r, x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), snowMat);
    m.position.set(x, y, z);
    m.name = 'lump' + i;
    m.scale.setScalar(0);
    pile.add(m);
  });
  pile.visible = false;
  g.add(pile);

  // Summer burn-out: flames licking out from under the bonnet (animated in main.ts).
  const fire = new THREE.Group();
  fire.name = 'fire';
  const flameCols = [0xff4a12, 0xff8a1a, 0xffc22a, 0xff6a14, 0xffd84a];
  const flamePos: [number, number, number, number][] = [[0, 1.0, 1.1, 0.9], [0.55, 0.9, 0.7, 0.7], [-0.55, 0.9, 1.3, 0.7], [0.25, 0.8, 1.55, 0.55], [-0.25, 0.85, 0.5, 0.6]];
  flamePos.forEach(([x, y, z, r], i) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 2.2, 6).translate(0, r * 1.1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(flameCols[i]).multiplyScalar(3.5), transparent: true, opacity: 0.92 }));
    f.position.set(x, y, z);
    f.name = 'flame' + i;
    f.castShadow = false;
    fire.add(f);
  });
  fire.visible = false;
  g.add(fire);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o.parent && o.parent.name === 'fire')) o.castShadow = true;
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
