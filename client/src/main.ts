// Boot, scene setup, fixed-timestep game loop.

import * as THREE from 'three';
import { CAMERA, CAR, SIM_DT } from '@shared/constants';
import { buildTrackData, seasonAt } from '@shared/track';
import { Input } from './input/Input';
import { Car } from './game/Car';
import { TrackView } from './game/Track';
import { createCarMesh, PLAYER_COLORS } from './game/CarMesh';

// ---------- Renderer / scene ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c8e8);
scene.fog = new THREE.Fog(0xa9c8e8, 120, 520);

const camera = new THREE.PerspectiveCamera(CAMERA.baseFov, window.innerWidth / window.innerHeight, 0.5, 1500);

scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a7a50, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -40;
sc.right = sc.top = 40;
sc.near = 1;
sc.far = 200;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- World ----------
const track = buildTrackData();
const trackView = new TrackView(track);
scene.add(trackView.group);

const input = new Input();
const car = new Car(track);
car.placeAt(0.995, -3); // just behind the start line
const carMesh = createCarMesh(PLAYER_COLORS[0]);
scene.add(carMesh);

// ---------- Camera ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let shake = 0;

function updateCamera(x: number, z: number, heading: number, dt: number, snap = false) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const target = new THREE.Vector3(x - fx * CAMERA.distance, CAMERA.height, z - fz * CAMERA.distance);
  const look = new THREE.Vector3(x + fx * CAMERA.lookAhead, 1.2, z + fz * CAMERA.lookAhead);
  const k = snap ? 1 : 1 - Math.exp(-CAMERA.posLerp * dt);
  camPos.lerp(target, k);
  camLook.lerp(look, snap ? 1 : 1 - Math.exp(-CAMERA.posLerp * 1.6 * dt));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 3);
  }
  camera.lookAt(camLook);
  const speedFrac = Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
  const fov = CAMERA.baseFov + CAMERA.speedFov * speedFrac;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}
updateCamera(car.x, car.z, car.heading, 0, true);

// ---------- Loop (fixed 60 Hz sim, interpolated render) ----------
const debug = document.getElementById('debug')!;
let acc = 0;
let last = performance.now();
let frames = 0, fpsTime = 0, fps = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); // clamp after tab switches
  last = now;
  acc += dt;

  const inp = input.read();
  if (inp.respawn) car.respawn();
  while (acc >= SIM_DT) {
    car.step(inp, SIM_DT);
    if (car.hitWall > 3) shake = Math.min(0.6, car.hitWall * 0.05);
    acc -= SIM_DT;
  }

  // Interpolate between previous and current sim state.
  const a = acc / SIM_DT;
  const rx = car.px + (car.x - car.px) * a;
  const rz = car.pz + (car.z - car.pz) * a;
  let dh = car.heading - car.pheading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const rh = car.pheading + dh * a;

  carMesh.position.set(rx, 0, rz);
  carMesh.rotation.y = rh;

  sun.position.set(rx + 30, 60, rz + 20);
  sun.target.position.set(rx, 0, rz);

  updateCamera(rx, rz, rh, dt);
  renderer.render(scene, camera);

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  debug.textContent =
    `fps ${fps}  speed ${car.speed.toFixed(1)}\n` +
    `t ${car.trackPos.t.toFixed(3)}  lat ${car.trackPos.lateral.toFixed(1)}  ${car.surface}  ${seasonAt(car.trackPos.t)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for quick console debugging / automated tests.
(window as unknown as { __fsr: unknown }).__fsr = { car, track, scene };
