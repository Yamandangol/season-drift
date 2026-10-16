// Juice: 3D particle bursts (mud, spray, leaves, snow, steam) + screen overlays (glare, mud splatter).

import * as THREE from 'three';
import { GLARE } from '@shared/constants';

const MAX = 500;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private alive = new Uint8Array(MAX);
  private next = 0;
  private m4 = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.m4.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, count: number, color: number, o: { speed?: number; up?: number; life?: number; size?: number; gravity?: number; vx?: number; vz?: number } = {}) {
    const { speed = 4, up = 4, life = 0.8, size = 0.35, gravity = 12, vx = 0, vz = 0 } = o;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos[i * 3] = x + (Math.random() - 0.5);
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5);
      const a = Math.random() * Math.PI * 2;
      this.vel[i * 3] = Math.cos(a) * speed * Math.random() + vx;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * speed * Math.random() + vz;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.mesh.setColorAt(i, this.c.set(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        // hide dead particles once (steam/smoke are at their biggest when they expire and would hang in the air)
        if (this.alive[i]) {
          this.alive[i] = 0;
          this.m4.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this.m4);
        }
        continue;
      }
      this.alive[i] = 1;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(0.05, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      // steam (negative gravity) grows as it fades; debris shrinks
      const s = this.grav[i] < 0 ? this.size[i] * (2 - f) : this.size[i] * f;
      this.m4.makeScale(s, s, s).setPosition(this.pos[j], this.pos[j + 1], this.pos[j + 2]);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}

/** Screen overlays for the local player. */
export class ScreenFx {
  private glareEl: HTMLDivElement;
  private flareEl: HTMLDivElement;
  private mudEl: HTMLDivElement;
  private dropsEl: HTMLDivElement;
  private leavesEl: HTMLDivElement;
  private speedEl!: HTMLDivElement;
  private speedK = 0;
  private whiteEl!: HTMLDivElement;
  private whiteQ = -1;
  private leavesA = -1;
  private speedQ = -1;
  private rainQ = -1;
  private glare = 0; // current opacity 0..1
  private glareHeld = 0; // seconds at/near full
  private flare = 0;
  private mud = 0;
  reduceFlashes = false;

  constructor(private root: HTMLElement) {
    this.glareEl = div(root, 'fx-glare');
    this.flareEl = div(root, 'fx-flare');
    this.mudEl = div(root, 'fx-mud');
    // Raindrops on the "lens" while it's raining in spring.
    this.dropsEl = div(root, 'fx-drops');
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('i');
      const size = 10 + Math.random() * 26;
      d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 85}%;width:${size}px;height:${size * 1.15}px;` +
        `animation-delay:${(-Math.random() * 4).toFixed(2)}s;animation-duration:${(2.5 + Math.random() * 2.5).toFixed(2)}s`;
      this.dropsEl.appendChild(d);
    }
    // A face full of leaves (autumn leaf-kick): big leaves over most of the view, thickest in the middle.
    this.speedEl = div(root, 'fx-speed');
    this.whiteEl = div(root, 'fx-white');
    this.leavesEl = div(root, 'fx-leaves');
    // Drawn ONCE into a single canvas (one GPU layer), then the whole sheet sways with a cheap CSS
    // transform. Dozens of separately animated big emoji were what made the leaf waves lag.
    {
      const cv = document.createElement('canvas');
      cv.width = 960;
      cv.height = 540;
      const g = cv.getContext('2d')!;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const COLS = [['#f08a3a', '#b9441a'], ['#e8582a', '#9c2d14'], ['#f4b43c', '#c8701e'], ['#d9702a', '#7a3412'], ['#c8402a', '#7c1e10']];
      for (let i = 0; i < 42; i++) {
        const cx = 0.5 + (Math.random() - 0.5) * 1.15 * Math.sqrt(Math.random());
        const cy = 0.47 + (Math.random() - 0.5) * 1.05 * Math.sqrt(Math.random());
        const size = 60 + Math.random() * 95;
        g.save();
        g.translate(cx * cv.width, cy * cv.height);
        g.rotate(Math.random() * Math.PI * 2);
        g.shadowColor = 'rgba(0,0,0,.35)';
        g.shadowBlur = 10;
        g.shadowOffsetY = 5;
        drawLeaf(g, size, COLS[i % COLS.length], Math.random() < 0.55);
        g.restore();
      }
      this.leavesEl.appendChild(cv);
    }
  }

  /** speed lines at the screen edges above ~70% of top speed */
  setSpeed(f: number) {
    const k = Math.max(0, Math.min(1, (f - 0.7) / 0.45));
    this.speedK += (k - this.speedK) * 0.12;
    const q = Math.round(this.speedK * 20) / 20;
    if (q === this.speedQ) return;
    this.speedQ = q;
    this.speedEl.style.opacity = String(q);
    this.speedEl.classList.toggle('on', q > 0);
  }

  /** 0..1 blizzard whiteout */
  setWhiteout(k: number) {
    const q = Math.round(Math.max(0, Math.min(1, k)) * 20) / 20;
    if (q === this.whiteQ) return;
    this.whiteQ = q;
    this.whiteEl.style.opacity = String(q);
    this.whiteEl.classList.toggle('on', q > 0);
  }

  /** 0..1 how much of the screen is covered by kicked-up leaves */
  setLeaves(amount: number) {
    const a = Math.round(Math.max(0, Math.min(1, amount)) * 20) / 20; // 5% steps: far fewer style writes
    if (a === this.leavesA) return;
    this.leavesA = a;
    this.leavesEl.style.opacity = String(a);
    this.leavesEl.classList.toggle('on', a > 0.01); // hidden + paused when not showing
  }

  /** 0..1 how hard it's raining at the camera */
  setRain(amount: number) {
    const q = Math.round(Math.max(0, Math.min(1, amount)) * 20) / 20;
    if (q === this.rainQ) return;
    this.rainQ = q;
    this.dropsEl.style.opacity = String(q * 0.85);
    this.dropsEl.classList.toggle('on', q > 0);
  }

  splashMud() {
    this.mud = 1.5;
  }

  /**
   * @param facingSun dot(heading, sunDir)
   * @param inZone car is in the glare zone
   */
  updateGlare(dt: number, facingSun: number, inZone: boolean, approachWarn: boolean) {
    const want = inZone && facingSun > GLARE.dotThreshold;
    const cap = this.reduceFlashes ? GLARE.reducedOpacity : GLARE.maxOpacity;
    // Warning flare streak: grows ~1 s before full glare (approaching the zone, facing the sun).
    const warnTarget = (approachWarn || want) && facingSun > GLARE.dotThreshold - 0.1 ? 1 : 0;
    this.flare += (warnTarget - this.flare) * Math.min(1, dt / GLARE.warnSeconds * 2.5);

    if (want && this.glareHeld < GLARE.hold) {
      this.glare = Math.min(1, this.glare + dt / GLARE.fadeIn);
      if (this.glare >= 1) this.glareHeld += dt;
    } else {
      this.glare = Math.max(0, this.glare - dt / GLARE.fadeOut);
      if (!want) this.glareHeld = 0;
    }
    this.glareEl.style.opacity = String(this.glare * cap);
    this.flareEl.style.opacity = String(this.flare * (this.reduceFlashes ? 0.5 : 0.9));
    this.flareEl.style.transform = `translate(-50%, -50%) scaleX(${0.4 + this.flare * 1.2}) rotate(-12deg)`;
  }

  update(dt: number) {
    this.mud = Math.max(0, this.mud - dt);
    this.mudEl.style.opacity = String(Math.min(1, this.mud / 0.6));
  }

  /** quick seasonal sweep across the screen when a new season starts */
  flourish(si: number, calm = false) {
    const el = document.createElement('div');
    el.className = `fx-flourish s${si}${calm ? ' calm' : ''}`;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 1700);
  }

  reset() {
    this.glare = this.glareHeld = this.flare = this.mud = 0;
    this.setLeaves(0);
    this.update(0);
    this.updateGlare(0, 0, false, false);
  }
}

/** a drawn autumn leaf (maple or oval), centred on the origin, pointing up */
function drawLeaf(g: CanvasRenderingContext2D, size: number, [light, dark]: string[], maple: boolean) {
  const r = size / 2;
  const grad = g.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.beginPath();
  if (maple) {
    // five pointed lobes
    const pts = 10;
    for (let k = 0; k <= pts * 2; k++) {
      const a = -Math.PI / 2 + (k / (pts * 2)) * Math.PI * 2;
      const lobe = k % 2 === 0 ? (k % 4 === 0 ? 1 : 0.78) : 0.42;
      const rr = r * lobe * (a > 0.4 && a < 2.7 ? 0.75 : 1);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  } else {
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.75, -r * 0.55, r * 0.6, r * 0.55, 0, r * 0.8);
    g.bezierCurveTo(-r * 0.6, r * 0.55, -r * 0.75, -r * 0.55, 0, -r);
  }
  g.closePath();
  g.fill();
  g.shadowColor = 'transparent';
  // veins and stem
  g.strokeStyle = 'rgba(70,25,8,.45)';
  g.lineWidth = Math.max(1.2, size * 0.022);
  g.beginPath();
  g.moveTo(0, r * 1.05); g.lineTo(0, -r * 0.8);
  for (const s of [-1, 1]) {
    for (const t of [0.15, -0.2, -0.5]) {
      g.moveTo(0, r * t);
      g.lineTo(s * r * (maple ? 0.6 : 0.42), r * (t - 0.3));
    }
  }
  g.stroke();
}

function div(root: HTMLElement, cls: string) {
  const d = document.createElement('div');
  d.className = cls;
  root.appendChild(d);
  return d;
}
