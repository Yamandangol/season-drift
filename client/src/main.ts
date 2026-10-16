import { PetalView } from './render/PetalView';
import { LEAF_KICK } from './game/Race';
import { SAIL_ON } from './game/Hazards';
import { inStartZone } from '@shared/track';
// Boot, scene setup, game states, fixed-timestep game loop.

import * as THREE from 'three';
import './ui/ui.css';
import { CAMERA, CAR, SIM_DT, TRACK, type Difficulty } from '@shared/constants';
import { buildTrackData, seasonIndexAt, seasonToT, trackPoint } from '@shared/track';
import { GLARE_ZONE } from '@shared/hazards';
import { Input, keyLabel, type InputState } from './input/Input';
import { TrackView } from './game/Track';
import { PLAYER_COLORS } from './game/CarMesh';
import { Hazards, type HazardEvent } from './game/Hazards';
import { Race, type RacerConfig } from './game/Race';
import type { Car } from './game/Car';
import { Seasons } from './render/Seasons';
import { HazardView } from './render/HazardView';
import { FallingBranchView } from './render/FallingBranchView';
import { GustView } from './render/GustView';
import { LakeView } from './render/LakeView';
import { CloudView } from './render/CloudView';
import { seasonWeights } from './render/palette';
import { Particles, ScreenFx } from './render/Effects';
import { HUD } from './ui/HUD';
import { Menu } from './ui/Menu';
import { Net } from './net/Net';
import { HowToPlay } from './ui/HowToPlay';
import { Settings, type Prefs } from './ui/Settings';
import { HEATER_FUEL, HEATERS, heaterT } from '@shared/winter';
import { Sfx } from './audio/Sfx';
import { Sky } from './render/Sky';
import { LeafFx } from './render/LeafFx';
import { WaveView } from './render/WaveView';
import { WinterView } from './render/WinterView';
import { blizzardAt } from '@shared/winter';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WAVE, WAVES } from '@shared/leafwaves';
const WAVE_SPEED = WAVES[0].speed;
import type { Racer } from './game/Race';
import type { RaceStart } from '@shared/protocol';

// ---------- Renderer / scene ----------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c8e8);
scene.fog = new THREE.Fog(0xa9c8e8, 120, 520);
const camera = new THREE.PerspectiveCamera(CAMERA.baseFov, window.innerWidth / window.innerHeight, 0.5, 2000);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x6a7a50, 1.6);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -45;
sc.right = sc.top = 45;
sc.near = 1;
sc.far = 200;
scene.add(hemi, sun, sun.target);
// soft studio reflections for the glossy car paint (only PBR materials use it)
{
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  pm.dispose();
}
const sky = new Sky();
scene.add(sky.mesh);

// ---------- Post-processing (single view): bloom + colour grade + vignette ----------
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uWarm; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      c.rgb *= vec3(1.0 + uWarm * 0.08, 1.0, 1.0 - uWarm * 0.08);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.6, 0.45, 2.3);
const grade = new ShaderPass(GradeShader);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(grade);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
let postOn = !new URLSearchParams(location.search).has('lowfx');
let slowTime = 0;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
  for (const v of views) setAspect(v);
});

if (new URLSearchParams(location.search).has('debug')) document.body.classList.add('debug');

// ---------- Static world ----------
const track = buildTrackData();
const hazards = new Hazards(track, 0);
const trackView = new TrackView(track, 0);
scene.add(trackView.group);
const hazardView = new HazardView(track, hazards.map);
scene.add(hazardView.group);
const seasons = new Seasons(track, hazards.map, scene, hemi, sun);
const particles = new Particles(scene);
const leafFx = new LeafFx(scene);
const winterView = new WinterView(track, hazards.snowballs, hazards.map.offset, particles);
scene.add(winterView.group);
const fallingView = new FallingBranchView(track, hazards.falling, leafFx);
scene.add(fallingView.group);
const gustView = new GustView(scene, particles);
const lakeView = new LakeView();
scene.add(lakeView.group);
const cloudView = new CloudView(hazards.clouds, track);
scene.add(cloudView.group);
const waveView = new WaveView(hazards.waves);
scene.add(waveView.group);
const petalView = new PetalView(track);
scene.add(petalView.group);

// ---------- UI ----------
const uiRoot = document.createElement('div');
uiRoot.id = 'ui';
document.body.appendChild(uiRoot);
const screenFx = new ScreenFx(uiRoot);
const hud = new HUD(uiRoot);
const input = new Input();
if (input.isTouch) document.body.classList.add('touch');
const rotateHint = document.createElement('div');
rotateHint.className = 'rotate-hint';
rotateHint.textContent = 'Turn your phone sideways to race';
uiRoot.appendChild(rotateHint);
/** phones: go full screen in landscape when joining a race (silently ignored where unsupported, e.g. iPhone) */
function phoneFullscreen() {
  if (!input.isTouch || document.fullscreenElement) return;
  const el = document.documentElement;
  el.requestFullscreen?.()
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
}

// ---------- Views: one per local player (split-screen = two side by side) ----------
interface View {
  racer: Racer | null; // null = attract mode (follow the leader)
  cam: THREE.PerspectiveCamera;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  shake: number;
  roll: number;
  rollTarget: number;
  snap: boolean;
  hud: HUD;
  fx: ScreenFx;
  side: 'full' | 'left' | 'right';
  /** last season this view's car was in (for the boundary flourish) */
  lastSi?: number;
}
function newView(side: View['side'], h: HUD, fx: ScreenFx, cam: THREE.PerspectiveCamera): View {
  return { racer: null, cam, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, roll: 0, rollTarget: 0, snap: true, hud: h, fx, side };
}
function setAspect(v: View) {
  const w = v.side === 'full' ? window.innerWidth : window.innerWidth / 2;
  v.cam.aspect = w / window.innerHeight;
  v.cam.updateProjectionMatrix();
}
const fullView = newView('full', hud, screenFx, camera);
const halves = (['left', 'right'] as const).map((side) => {
  const root = document.createElement('div');
  root.className = 'view-half ' + side + ' hidden';
  uiRoot.insertBefore(root, uiRoot.firstChild);
  const v = newView(side, new HUD(root), new ScreenFx(root), new THREE.PerspectiveCamera(CAMERA.baseFov, 1, 0.5, 2000));
  v.hud.setKeySet(side === 'left' ? 'wasd' : 'arrows');
  v.hud.setTag(side === 'left' ? 'P1' : 'P2', '#' + PLAYER_COLORS[side === 'left' ? 0 : 1].toString(16).padStart(6, '0'));
  return { v, root };
});
let views: View[] = [fullView];
const viewOf = (car: Car) => views.find((v) => v.racer?.car === car);
/** is (x, z) within r of any camera? (particles are only worth emitting near someone) */
const nearCam = (x: number, z: number, r: number) => views.some((v) => (v.cam.position.x - x) ** 2 + (v.cam.position.z - z) ** 2 < r * r);

type State = 'menu' | 'race' | 'paused' | 'results';
type Mode = 'solo' | 'split' | 'online';
let state: State = 'menu';
let mode: Mode = 'solo';
let race: Race | null = null;
let difficulty: Difficulty = 'normal';
const net = new Net();

const menu = new Menu(uiRoot, {
  onSolo: (d) => startSolo(d),
  onSplit: (d) => startSplit(d),
  onHowTo: () => { menu.hideAll(); howTo.open(); },
  onSettings: () => { settingsFrom = state === 'paused' ? 'pause' : 'menu'; menu.hideAll(); settings.open(); },
  onRematch: () => (mode === 'online' ? backToLobby() : mode === 'split' ? startSplit(difficulty) : startSolo(difficulty)),
  onMenu: () => toMenu(),
  onResume: () => setPaused(false),
  onOnlineCreate: (name) => net.create(name),
  onOnlineJoin: (code, name) => { phoneFullscreen(); net.join(code, name); },
  onOnlineStart: (d) => net.requestStart(d),
  onOnlineBack: () => { net.leave(); toMenu(); },
});

const howTo = new HowToPlay(uiRoot);
const settings = new Settings(uiRoot, input);
let settingsFrom: 'menu' | 'pause' = 'menu';
settings.onClose = () => { if (settingsFrom === 'pause' && state === 'paused') menu.showPause(true); else if (state === 'menu') menu.showMain(); };
settings.onChange = (p) => applyPrefs(p);

/** name tags + colour-blind hazard markers */
const tagTex = new Map<string, THREE.Texture>();
function textSprite(text: string, bg: string, w = 256, h = 64, font = 'bold 34px system-ui'): THREE.Sprite {
  const key = text + bg;
  let tex = tagTex.get(key);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!;
    if (bg) {
      g.fillStyle = 'rgba(15,18,28,.78)';
      g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, h / 2 - 2); g.fill();
      g.fillStyle = bg;
      g.beginPath(); g.roundRect(2, 2, h - 4, h - 4, h / 2 - 2); g.fill();
    }
    g.font = font;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, bg ? (w + h) / 2 : w / 2, h / 2 + 2);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tagTex.set(key, tex);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sp.renderOrder = 20;
  return sp;
}
const cbMarkers = new THREE.Group();
{
  cbMarkers.visible = false;
  scene.add(cbMarkers);
}
let prefs: Prefs = settings.prefs;
function applyPrefs(p: Prefs) {
  prefs = p;
  sfx.setVolumes(p.music, p.sfx);
  postOn = p.quality === 'high' && !location.search.includes('lowfx');
  document.body.classList.toggle('cb', p.colorBlind);
  cbMarkers.visible = p.colorBlind;
  for (const v of [fullView, ...halves.map((h) => h.v)]) v.fx.reduceFlashes = p.reduceFlashes;
}
howTo.onClose = () => { if (state === 'menu') menu.showMain(); };

// ---------- Online ----------
const showLobby = () => menu.showLobby(net.code, net.players.map((p) => ({ name: p.name, host: p.host, me: p.id === net.id })), net.isHost);
net.onLobby = (code) => {
  if (code !== qrFor) {
    qrFor = code;
    shareBase().then((base) => {
      if (net.code !== code) return;
      menu.setJoinUrl(`${base}/?join=${code}`);
      if (state === 'menu') showLobby();
    });
  }
  if (state === 'race' || state === 'paused' || state === 'results') return; // mid-race lobby updates (e.g. someone left) are handled by onLeft
  showLobby();
};
/** The address other devices should open: the public link when the server runs with `npm run share`,
 *  else (page opened on localhost, which would point at the phone itself) this machine's Wi-Fi address,
 *  else the page's own address (e.g. the deployed site). */
let qrFor = '';
function shareBase(): Promise<string> {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return fetch('/api/lan')
    .then((r) => r.json() as Promise<{ public: string | null; urls: string[] }>)
    .then((j) => {
      if (j.public) return j.public;
      if (local && j.urls[0]) return `${location.protocol}//${new URL(j.urls[0]).hostname}${location.port ? ':' + location.port : ''}`;
      return location.origin;
    })
    .catch(() => location.origin);
}
net.onError = (m) => menu.onlineMsg(m);
net.onStart = (st) => setTimeout(() => startOnline(st), st.delayMs);
net.onState = (snaps) => { if (mode === 'online' && race) for (const sn of snaps) race.applySnap(sn); };
net.onLeft = (id) => {
  if (mode !== 'online' || !race) return;
  const r = race.markLeft(id);
  if (r) fullView.hud.toast(`${r.name} left`, 'bad');
};
net.onDisconnect = () => {
  if (mode === 'online' && state !== 'menu') { fullView.hud.toast('Disconnected', 'bad'); }
};
function backToLobby() {
  race?.dispose();
  race = null;
  hud.show(false);
  state = 'menu';
  showLobby();
}

// ---------- Sound ----------
const sfx = new Sfx();
sfx.startMusic();
{
  const btn = document.createElement('button');
  btn.className = 'mute-btn';
  const sync = () => { btn.textContent = sfx.muted ? 'SOUND OFF' : 'SOUND ON'; btn.title = 'Sound (M)'; btn.classList.toggle('off', sfx.muted); };
  sync();
  btn.onclick = () => { sfx.toggleMute(); sync(); btn.blur(); };
  document.body.appendChild(btn);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) { sfx.toggleMute(); sync(); }
  });
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button:not(.mute-btn)')) sfx.click();
  });
}
let lastCd = 99;
let touchShown = false;
let blizzardOn = false;
const sunGlowDir = new THREE.Vector3();
const passSide = new Map<Racer, number>();
let lastPlaceSfx = 0;
let lastSeasonSfx = -1;
let lastWallSfx = 0;

// ---------- Hazard feedback ----------
const surfaceColor: Partial<Record<HazardEvent, number>> = { mud: 0x5a3a1d, hydroplane: 0xbfdcff, snow: 0xffffff, leaves: 0xe0702a, ice: 0xdff0ff };
hazards.onEvent = (car, e) => {
  const v = viewOf(car);
  const near = nearCam(car.x, car.z, 80);
  if (near) {
    if (e === 'branch') particles.emit(car.x, 0.8, car.z, 14, 0x6b4a2b, { speed: 6, up: 5, size: 0.3 });
    else if (e === 'iceBreak') {
      lakeView.breakAt(car.x, car.z);
      particles.emit(car.x, 0.5, car.z, 30, 0x2f6fa8, { speed: 6, up: 9, size: 0.4, life: 1.2 });
      particles.emit(car.x, 0.5, car.z, 20, 0xe8f4ff, { speed: 7, up: 6, size: 0.5, life: 1 });
    }
    else if (e === 'land') particles.emit(car.x, 1.2, car.z, 30, 0xffffff, { speed: 6, up: 5, size: 0.45, life: 1 });
    else if (e === 'snowball') { particles.emit(car.x, 1.4, car.z, 40, 0xffffff, { speed: 8, up: 6, size: 0.5, life: 1.2 }); }
    else if (e === 'snowHit') particles.emit(car.x + Math.sin(car.heading) * 2, 1, car.z + Math.cos(car.heading) * 2, 26, 0xffffff, { speed: 6, up: 6, size: 0.45, life: 1 });
    else if (e === 'stall') particles.emit(car.x, 1.2, car.z, 16, 0xeeeeee, { speed: 1.5, up: 2, gravity: -3, life: 1.6, size: 0.6 });
    else if (e === 'leaves') leafFx.emit(car.x, 0.4, car.z, 14, { spread: 4, vy: 5, life: 2, size: 0.5 });
    else if (surfaceColor[e]) particles.emit(car.x, 0.3, car.z, 10, surfaceColor[e]!, { speed: 4, up: 5 });
  }
  if (near && e === 'petal') particles.emit(car.x, 1.4, car.z, 22, 0xffb7d5, { speed: 5, up: 4, gravity: 3, life: 0.9, size: 0.35 });
  if (v && v.racer) {
    switch (e) {
      case 'petal': sfx.petal(v.racer.hz.chain); break;
      case 'chainBreak': sfx.chainBreak(); break;
      case 'leafKick': sfx.leafKick(); break;
      case 'blinded': sfx.blinded(); break;
      case 'leafWave': sfx.leafWave(); break;
      case 'heatWarn': sfx.heatWarn(); break;
      case 'stall': sfx.stall(); break;
      case 'heater': sfx.melt(); break;
      case 'snowHit': sfx.snowHit(); break;
      case 'jump': sfx.jump(); break;
      case 'land': sfx.land(); break;
      case 'snowball': sfx.snowHit(); break;
      case 'iceBreak': sfx.iceBreak(); break;
      case 'crack': sfx.crack(); break;
      case 'ice': sfx.ice(); break;
      case 'mud': sfx.mud(); break;
      case 'hydroplane': case 'splash': sfx.splash(); break;
      case 'branch': sfx.branch(); break;
    }
  }
  if (!v || !v.racer) return;
  if (e === 'petal') {
    const c = v.racer.hz.chain;
    if (c >= 3) v.hud.toast(`CHAIN x${c}`, 'pink');
  }
  if (e === 'chainBreak') v.hud.toast('CHAIN BROKEN', 'bad');
  if (e === 'blinded') { v.hud.toast('BLINDED', 'bad'); v.shake = Math.max(v.shake, 0.3); }
  if (e === 'leafKick') v.hud.toast('LEAF HIT', 'good');
  if (e === 'land' && v.racer.hz.snow < 0.3) v.hud.toast('SNOW SHAKEN OFF', 'good');
  if (e === 'snowball') { v.hud.toast('SNOWBALL', 'bad'); v.shake = Math.max(v.shake, 0.8); }
  if (e === 'heaterOut') v.hud.toast('HEATER BURNT OUT', 'bad');
  if (e === 'heaterCold') v.hud.toast('HEATER IS OUT', 'bad');
  if (e === 'mud') v.fx.splashMud();
  if (e === 'branch') v.shake = 0.7;
  if (e === 'snowHit') v.shake = 0.6;
  if (e === 'iceBreak') v.shake = 0.9;
};

/** Crossing into a new season: a themed burst around the car + a quick sweep across that player's screen. */
function seasonFlourish(v: View, si: number, car: Car) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const ahead = (d: number, side: number) => [car.x + fx * d + fz * side, car.z + fz * d - fx * side] as const;
  const vel = { vx: car.vx * 0.6, vz: car.vz * 0.6 }; // travel with the car so the burst surrounds you
  for (let k = 0; k < 46; k++) {
    const [x, z] = ahead(2 + Math.random() * 14, (Math.random() - 0.5) * 14);
    switch (si) {
      case 0: // spring: pink petals drifting down
        particles.emit(x, 2 + Math.random() * 4, z, 1, [0xffb7d5, 0xff8cc0, 0xffe0ee][k % 3], { speed: 2, up: 1, gravity: 1.2, life: 1.6, size: 0.35, ...vel });
        break;
      case 1: // summer: golden sparks rising off the road
        particles.emit(x, 0.3, z, 1, [0xffe27a, 0xffb627, 0xfff4c2][k % 3], { speed: 1.5, up: 6, gravity: -1, life: 1.1, size: 0.3, ...vel });
        break;
      case 2: // autumn: a gust of leaves
        leafFx.emit(x, 1 + Math.random() * 3, z, 1, { spread: 3, vy: 2.5, life: 2, size: 0.55, vx: vel.vx, vz: vel.vz });
        break;
      default: // winter: a flurry of snow from above
        particles.emit(x, 5 + Math.random() * 3, z, 1, 0xffffff, { speed: 1.5, up: -3, gravity: 3, life: 1.6, size: 0.3, ...vel });
    }
  }
  v.fx.flourish(si, prefs.reduceFlashes);
}

// Falling branch lands: burst of leaves + bark, thump if it's close to the player.
hazards.falling.onLand = (b) => {
  const s = track.samples[Math.floor(b.t * track.samples.length) % track.samples.length];
  const x = s.x + s.nx * b.lat, z = s.z + s.nz * b.lat;
  if (!nearCam(x, z, 120)) return;
  { const f = views[0]?.cam.position; if (f) sfx.thump(Math.max(0, 1 - Math.hypot(f.x - x, f.z - z) / 90)); }
  leafFx.emit(x, 0.8, z, 34, { spread: 4.5, vy: 6, life: 2.4, size: 0.55 });
  for (let k = 0; k < 18; k++) { // a ring of dust puffing out along the road
    const a = (k / 18) * Math.PI * 2;
    particles.emit(x + Math.cos(a) * 1.5, 0.3, z + Math.sin(a) * 1.5, 1, 0xb79b7a, { speed: 0.5, up: 1, gravity: -0.6, life: 1.1, size: 0.7, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5 });
  }
  particles.emit(x, 0.4, z, 8, 0x5a3b22, { speed: 5, up: 4, size: 0.25 });
  for (const v of views) if (v.cam.position.distanceToSquared(new THREE.Vector3(x, 0, z)) < 45 * 45) v.shake = Math.max(v.shake, 0.45);
};

/** continuous wheel kicks while on special surfaces */
let kickTimer = 0;
function surfaceKicks(dt: number, cars: Car[]) {
  kickTimer += dt;
  if (kickTimer < 0.05) return;
  kickTimer = 0;
  for (const car of cars) {
    const sp = Math.abs(car.speed);
    if (sp < 4) continue;
    if (!nearCam(car.x, car.z, 70)) continue;
    const bx = car.x - Math.sin(car.heading) * 1.8, bz = car.z - Math.cos(car.heading) * 1.8;
    const back = { vx: -Math.sin(car.heading) * sp * 0.25, vz: -Math.cos(car.heading) * sp * 0.25 };
    switch (car.surface) {
      case 'mud': particles.emit(bx, 0.3, bz, 2, 0x5a3a1d, { speed: 2, up: 4, ...back }); break;
      case 'puddle': particles.emit(bx, 0.3, bz, 3, 0xcfe6ff, { speed: 3, up: 5, size: 0.25, ...back }); break;
      case 'leaves': leafFx.emit(bx, 0.3, bz, 2, { spread: 1.5, vy: 4, life: 1.6, size: 0.45, vx: back.vx, vz: back.vz }); break;
      case 'snow': particles.emit(bx, 0.3, bz, 2, 0xffffff, { speed: 2, up: 4, ...back }); break;
      case 'powder': particles.emit(bx, 0.25, bz, 2, 0xf4f8ff, { speed: 2.5, up: 3.5, size: 0.3, life: 0.7, ...back }); break;
      case 'road':
        // wet spring road: light spray off the tyres
        if (seasons.weights[0] > 0.5 && sp > 14 && Math.random() < 0.6) particles.emit(bx, 0.25, bz, 1, 0xd6e4f2, { speed: 1.5, up: 2.5, size: 0.22, life: 0.5, ...back });
        break;
      case 'grass': if (Math.random() < 0.4) particles.emit(bx, 0.3, bz, 1, 0x5f8a3a, { speed: 1, up: 2, size: 0.2 }); break;
    }
  }
}

// ---------- Game states ----------
const BOT_NAMES = ['Blossom', 'Sunny', 'Maple', 'Frost'];

function makeRace(configs: RacerConfig[], d: Difficulty) {
  race?.dispose();
  race = new Race(track, hazards, scene, configs, d);
  const locals = race.locals;
  // one full-screen view, or two halves for split-screen
  const split = locals.length >= 2;
  halves.forEach((h) => h.root.classList.toggle('hidden', !split));
  views = split ? halves.map((h, i) => ((h.v.racer = locals[i]), h.v)) : [fullView];
  fullView.racer = split ? null : locals[0] ?? null;
  for (const v of views) {
    v.hud.setKeyLabels(input.binds, keyLabel);
    v.fx.reset();
    v.hud.resetSeason(4);
    v.snap = true;
    v.shake = 0;
    v.lastSi = undefined;
    setAspect(v);
  }
  hud.show(false);
  lastCd = 99;
  winterView.clearMarks();
  for (const r of race.racers) {
    const tag = textSprite(r.name.slice(0, 10), '#' + r.color.toString(16).padStart(6, '0'));
    tag.name = 'tag';
    tag.position.set(0, 3.3, 0);
    tag.scale.set(4, 1, 1);
    tag.visible = false;
    r.mesh.add(tag);
  }
  passSide.clear();
  lastPlaceSfx = 0;
  race.onLap = (r) => { if (r.kind === 'local') sfx.lap(); };
  race.onFinish = (r) => { if (r.kind === 'local') { sfx.finish(r.place === 1); celebrate(r); } };
  race.onResults = (standings) => {
    if (state !== 'race' && state !== 'paused') return;
    state = 'results';
    for (const v of views) v.hud.show(false);
    halves.forEach((h) => h.root.classList.add('hidden'));
    views = [fullView];
    fullView.racer = race?.local ?? null;
    setAspect(fullView);
    menu.showResults(standings, mode === 'split' ? undefined : race?.local?.id, mode === 'online');
    if (mode === 'online' && net.isHost) net.raceOver();
  };
}

function beginRace() {
  menu.hideAll();
  for (const v of views) v.hud.show(!!v.racer);
  state = 'race';
}

function startSolo(d: Difficulty) {
  difficulty = d;
  (document.activeElement as HTMLElement | null)?.blur?.(); // Space is the boost key: don't re-click buttons
  const configs: RacerConfig[] = [
    { id: 'b0', name: BOT_NAMES[1], color: PLAYER_COLORS[1], kind: 'bot' },
    { id: 'b1', name: BOT_NAMES[2], color: PLAYER_COLORS[2], kind: 'bot' },
    { id: 'me', name: 'You', color: PLAYER_COLORS[0], kind: 'local' },
    { id: 'b2', name: BOT_NAMES[3], color: PLAYER_COLORS[3], kind: 'bot' },
  ];
  mode = 'solo';
  makeRace(configs, d);
  beginRace();
}

/** Two players on one keyboard: P1 = WASD (left half), P2 = arrows (right half), plus two bots. */
function startSplit(d: Difficulty) {
  difficulty = d;
  (document.activeElement as HTMLElement | null)?.blur?.();
  mode = 'split';
  makeRace([
    { id: 'p1', name: 'P1', color: PLAYER_COLORS[0], kind: 'local', slot: 0, human: true },
    { id: 'p2', name: 'P2', color: PLAYER_COLORS[1], kind: 'local', slot: 1, human: true },
    { id: 'b0', name: BOT_NAMES[2], color: PLAYER_COLORS[2], kind: 'bot' },
    { id: 'b1', name: BOT_NAMES[3], color: PLAYER_COLORS[3], kind: 'bot' },
  ], d);
  beginRace();
}

/** Online (up to 5 devices): each simulates its own car; the host also runs the bots that fill empty seats. */
function startOnline(st: RaceStart) {
  difficulty = st.difficulty;
  (document.activeElement as HTMLElement | null)?.blur?.();
  mode = 'online';
  const host = st.hostId === net.id;
  const configs: RacerConfig[] = st.grid.map((g, i) => ({
    id: g.id,
    name: g.id === net.id ? g.name + ' (you)' : g.name,
    color: PLAYER_COLORS[(g.color ?? i) % PLAYER_COLORS.length],
    kind: g.id === net.id ? 'local' : g.human ? 'remote' : host ? 'bot' : 'remote',
    human: g.human,
  }));
  makeRace(configs, st.difficulty);
  beginRace();
}

/** Attract mode: bots race behind the menu. */
function toMenu() {
  if (mode === 'online') net.leave();
  mode = 'solo';
  makeRace(
    [0, 1, 2, 3].map((i) => ({ id: 'a' + i, name: BOT_NAMES[i], color: PLAYER_COLORS[i], kind: 'bot' as const })),
    'normal',
  );
  menu.hideAll();
  menu.showMain();
  state = 'menu';
}

function setPaused(p: boolean) {
  if (p && state === 'race') {
    state = 'paused';
    menu.showPause(true);
  } else if (!p && state === 'paused') {
    state = 'race';
    menu.showPause(false);
    last = performance.now();
  }
}

// ---------- Camera ----------
const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

function updateCamera(v: View, x: number, z: number, heading: number, speed: number, dt: number) {
  const camera = v.cam;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  _target.set(x - fx * CAMERA.distance, CAMERA.height, z - fz * CAMERA.distance);
  _look.set(x + fx * CAMERA.lookAhead, 1.2, z + fz * CAMERA.lookAhead);
  const k = v.snap ? 1 : 1 - Math.exp(-CAMERA.posLerp * dt);
  v.pos.lerp(_target, k);
  v.look.lerp(_look, v.snap ? 1 : 1 - Math.exp(-CAMERA.posLerp * 1.6 * dt));
  v.snap = false;
  camera.position.copy(v.pos);
  if (v.shake > 0) {
    const k = prefs.reduceFlashes ? 0 : 1;
    camera.position.x += (Math.random() - 0.5) * v.shake * k;
    camera.position.y += (Math.random() - 0.5) * v.shake * k;
    v.shake = Math.max(0, v.shake - dt * 2.5);
  }
  camera.lookAt(v.look);
  v.roll += (v.rollTarget - v.roll) * Math.min(1, dt * 3);
  if (Math.abs(v.roll) > 0.0005) camera.rotateZ(v.roll);
  const fov = CAMERA.baseFov + CAMERA.speedFov * Math.min(1, Math.abs(speed) / CAR.maxSpeed);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

/** After the finish: swing round to the front of the car and slowly circle it. */
function finishCamera(v: View, x: number, z: number, heading: number, t: number, dt: number) {
  const camera = v.cam;
  const a = heading + Math.PI + Math.min(1, t / 2.5) * Math.PI * 0.85 + Math.max(0, t - 2.5) * 0.25;
  const r = 9 - Math.min(1, t / 2.5) * 2;
  _target.set(x + Math.sin(a) * r, 3 + Math.min(1, t / 2.5) * 0.6, z + Math.cos(a) * r);
  _look.set(x, 1.1, z);
  v.pos.lerp(_target, 1 - Math.exp(-3 * dt));
  v.look.lerp(_look, 1 - Math.exp(-4 * dt));
  camera.position.copy(v.pos);
  camera.lookAt(v.look);
  v.roll += (0 - v.roll) * Math.min(1, dt * 3);
  if (Math.abs(camera.fov - CAMERA.baseFov) > 0.05) {
    camera.fov += (CAMERA.baseFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}

/** Confetti at the line and a few fireworks over the car. */
function celebrate(r: Racer) {
  const COLS = [0xff5a8a, 0xffd34d, 0x46c97a, 0x4fa8ff, 0xb28be0, 0xff8a3a];
  for (let k = 0; k < 60; k++) {
    particles.emit(r.car.x + (Math.random() - 0.5) * 6, 0.6, r.car.z + (Math.random() - 0.5) * 6, 1, COLS[k % COLS.length], { speed: 4, up: 9, gravity: 6, life: 2, size: 0.28 });
  }
  for (let i = 0; i < 6; i++) {
    window.setTimeout(() => {
      if (!race) return;
      const x = r.car.x + (Math.random() - 0.5) * 24, z = r.car.z + (Math.random() - 0.5) * 24, y = 11 + Math.random() * 6;
      const c = COLS[i % COLS.length];
      particles.emit(x, y, z, 36, c, { speed: 10, up: 2, gravity: 3, life: 1.3, size: 0.32 });
      particles.emit(x, y, z, 12, 0xffffff, { speed: 6, up: 1, gravity: 3, life: 0.8, size: 0.22 });
      sfx.firework();
    }, 300 + i * 380);
  }
}

// ---------- Loop ----------
const debug = document.getElementById('debug')!;
const NO_INPUT: InputState = { throttle: 0, brake: 0, steer: 0, item: false, respawn: false, pause: false };
let acc = 0;
let last = performance.now();
let frames = 0, fpsTime = 0, fps = 0;
const glareT0 = () => seasonToT(GLARE_ZONE.season, GLARE_ZONE.s0, hazards.map.offset);

/** Car body language: lean into turns, squat/dive on throttle/brake, spinning + steering wheels. */
function animateCar(r: Racer, dt: number) {
  const m = r.mesh;
  const u = m.userData;
  if (dt <= 0) return;
  const c = r.car;
  let dh = c.heading - (u.lastH ?? c.heading);
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const yawRate = dh / dt;
  const accel = (c.speed - (u.lastSp ?? c.speed)) / dt;
  u.lastH = c.heading;
  u.lastSp = c.speed;
  const k = 1 - Math.exp(-dt * 8);
  const rollT = Math.max(-0.12, Math.min(0.12, -yawRate * Math.abs(c.speed) * 0.0035));
  const pitchT = Math.max(-0.07, Math.min(0.07, -accel * 0.0022));
  u.roll = (u.roll ?? 0) + (rollT - (u.roll ?? 0)) * k;
  u.pitch = (u.pitch ?? 0) + (pitchT - (u.pitch ?? 0)) * k;
  m.rotation.order = 'YXZ';
  m.rotation.z = u.roll;
  m.rotation.x = u.pitch;
  // wheels
  const spin = (c.speed * dt) / 0.42;
  const steerT = Math.max(-0.45, Math.min(0.45, -yawRate * 0.35));
  u.steer = (u.steer ?? 0) + (steerT - (u.steer ?? 0)) * k;
  if (!u.wheels) { u.wheels = [] as THREE.Object3D[]; u.pivots = [] as THREE.Object3D[]; m.traverse((o) => { if (o.name === 'wheel') u.wheels.push(o); if (o.name === 'steer') u.pivots.push(o); }); }
  for (const w of u.wheels as THREE.Object3D[]) w.rotation.x += spin;
  for (const p of u.pivots as THREE.Object3D[]) p.rotation.y = u.steer;
}

let netTick = 0;
function sendSnaps() {
  if (!race) return;
  const host = net.isHost;
  const mine = race.racers.filter((r) => r.kind === 'local' || (host && r.kind === 'bot'));
  net.send(mine.map((r) => race!.snapOf(r)));
}

function frame() {
  requestAnimationFrame(frame);
  // performance.now(), not the rAF timestamp: some browsers hand out stale timestamps when frames are slow
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;

  // split-screen: P1 = WASD / pad 1, P2 = arrows / pad 2; otherwise any key drives
  const split = mode === 'split' && views.length === 2;
  {
    const wantTouch = input.isTouch && (state === 'race' || state === 'paused') && !split;
    if (wantTouch !== touchShown) { touchShown = wantTouch; input.showTouch(wantTouch); document.body.classList.toggle('in-race', wantTouch); }
  }
  const inputs = split ? [input.read(0), input.read(1)] : [input.read()];
  if (inputs[0].pause) {
    if (state === 'race') setPaused(true);
    else if (state === 'paused') setPaused(false);
  }

  // Online races can't be paused (the other device keeps racing): the menu shows, the car coasts.
  if (race && (state !== 'paused' || mode === 'online')) {
    acc += dt;
    const live = state === 'race' ? inputs : inputs.map(() => NO_INPUT);
    let steps = 0;
    while (acc >= SIM_DT && steps < 8) {
      race.step(live);
      for (const v of views) {
        const lc = v.racer?.car;
        if (lc && lc.hitWall > 3) {
          v.shake = Math.max(v.shake, Math.min(0.6, lc.hitWall * 0.05));
          const nw = performance.now();
          if (nw - lastWallSfx > 180) { lastWallSfx = nw; sfx.wall(lc.hitWall * 0.05); }
        }
      }
      if (mode === 'online' && ++netTick % 3 === 0) sendSnaps();
      acc -= SIM_DT;
      steps++;
    }
    if (steps === 8) acc = 0;
    // Attract mode loops forever.
    if (state === 'menu' && race.phase === 'finished' && mode === 'solo' && !race.local) toMenu();
  }

  if (race) {
    const a = acc / SIM_DT;
    for (const r of race.racers) {
      const p = Race.pose(r.car, a);
      // ride up over snow drifts / leaf piles (smoothed so it doesn't pop)
      const gy = hazards.map.groundHeight(r.car.trackPos.t, r.car.trackPos.lateral) * 0.8;
      r.mesh.userData.gy = (r.mesh.userData.gy ?? 0) + (gy - (r.mesh.userData.gy ?? 0)) * Math.min(1, dt * 12);
      r.mesh.position.set(p.x, r.mesh.userData.gy + r.hz.airY + (r.car.stalledUntil > race.now ? Math.sin(now * 0.05) * 0.04 : 0), p.z);
      r.mesh.rotation.y = p.heading;
      animateCar(r, dt);
    }
    // Each view's camera follows its player, or the race leader in attract mode.
    const leader = [...race.racers].sort((x, y) => x.place - y.place)[0];
    for (const v of views) {
      const fr = v.racer ?? leader;
      const fp = Race.pose(fr.car, a);
      if (v.racer && v.racer.finished) finishCamera(v, fp.x, fp.z, fp.heading, race.now - race.startAt - v.racer.finishTime, dt);
      else updateCamera(v, fp.x, fp.z, fp.heading, fr.car.speed, dt);
    }
    const focus = views[0].racer ?? leader;
    const camera = views[0].cam;
    const t = focus.car.trackPos.t;
    const g = hazards.gustPhase(race.now);
    const autumnW = seasonWeights(track, t, hazards.map.offset, 40)[2];
    // Autumn wind always blows (it's what drives the sails); gusts make it stronger and shift it.
    const wd = hazards.windDir(t);
    const windPow = g.active ? 18 : 6;
    seasons.windX = wd.x * windPow * autumnW;
    seasons.windZ = wd.z * windPow * autumnW;
    seasons.sway = autumnW * (g.active ? 1 : 0.25 + g.warning * 0.4);
    gustView.update(dt, camera.position, wd.x, wd.z, autumnW, g.warning, g.active);
    for (const v of views) {
      // lean the camera with the wind while a gust blows
      const fr = v.racer ?? leader;
      const h = fr.car.heading;
      const aw = seasonWeights(track, fr.car.trackPos.t, hazards.map.offset, 40)[2];
      const gx = wd.x * -Math.cos(h) + wd.z * Math.sin(h);
      v.rollTarget = g.active ? -gx * 0.05 * aw : 0;
      if (g.active && aw > 0.5) v.shake = Math.max(v.shake, 0.12);
    }
    // Sails: shown in autumn, boom swings to the wind, cloth fills with efficiency.
    for (const r of race.racers) {
      const sail = r.mesh.getObjectByName('sail');
      if (!sail) continue;
      const inAutumn = seasonIndexAt(r.car.trackPos.t, hazards.map.offset) === 2;
      sail.visible = SAIL_ON && inAutumn;
      if (!sail.visible) continue;
      const w = hazards.windDir(r.car.trackPos.t);
      let rel = w.heading - r.car.heading; // downwind relative to the nose
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      // boom eases out to half the angle off the wind, on the downwind side
      const boom = Math.sign(rel || 1) * Math.min(1.45, (Math.PI - Math.abs(rel)) / 2);
      sail.rotation.y += (-boom - sail.rotation.y) * Math.min(1, dt * 5);
      const sheet = sail.getObjectByName('sheet');
      ((sheet as THREE.Mesh).material as THREE.MeshLambertMaterial).emissive.setRGB(0, Math.min(1, r.hz.sail) * 0.12, 0);
    }
    fallingView.update(race.now);
    hazardView.updateRipples(dt, camera.position, seasons.weights[0]);

    surfaceKicks(dt, race.racers.map((r) => r.car));

    // Lake ice cracking under slow cars
    for (const r of race.racers) {
      if (r.hz.onLake && r.hz.crack > 0.15 && Math.random() < dt * (4 + r.hz.crack * 14)) {
        lakeView.addCrack(r.car.x, r.car.z, 1.2 + r.hz.crack * 2.5);
      }
    }
    lakeView.update(dt);
    if (race) cloudView.setHeaters(hazards.heaterFuel, hazards.heaterOutUntil.map((u) => Math.max(0, u - race!.now)));
    cloudView.update(dt);
    winterView.update(dt, (x, z) => nearCam(x, z, 140));
    if (race) for (const r of race.racers) {
      if (r.hz.airY > 0 || Math.abs(r.car.speed) < 3) continue;
      if (seasonIndexAt(r.car.trackPos.t, hazards.map.offset) !== 3 || inStartZone(r.car.trackPos.t, track.length)) continue;
      const lm = r.mesh.userData.lastMark as [number, number] | undefined;
      if (!lm || Math.hypot(r.car.x - lm[0], r.car.z - lm[1]) > 1.3) {
        winterView.addMarks(r.car.x - Math.sin(r.car.heading) * 1.2, r.car.z - Math.cos(r.car.heading) * 1.2, r.car.heading);
        r.mesh.userData.lastMark = [r.car.x, r.car.z];
      }
    }
    waveView.update(dt, race && race.phase !== 'finished' ? seasons.weights[2] : 0, (x, z) => nearCam(x, z, 120));
    // leaf waves: swirling leaves where a wave is (only near the camera)
    if (race && race.phase !== 'finished') for (const w of hazards.waves.pos) {
      if (!nearCam(w.x, w.z, 90)) continue;
      // a little whirlwind: leaves lifted off the road and spun round the wave's centre as it travels
      const smp = track.samples[Math.floor(w.t * track.samples.length) % track.samples.length];
      let n = dt * 90;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        // leaves sucked in off the road and carried up the funnel in a spiral
        const a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.75) * w.r * 0.85;
        leafFx.emit(w.x + Math.cos(a) * rr, 0.15 + Math.random() * 2.5, w.z + Math.sin(a) * rr, 1, {
          vy: 4 + Math.random() * 2, spread: 0.5, life: 2.2, size: 0.55 + Math.random() * 0.2,
          swirl: { cx: w.x, cz: w.z, w: 5, cvx: smp.tx * WAVE_SPEED, cvz: smp.tz * WAVE_SPEED },
        });
      }
    }

    // Autumn leaf-kick: cars tearing through leaf piles throw a cloud of leaves out behind them
    for (const r of race.racers) {
      if (r.car.surface !== 'leaves' || r.car.speed < LEAF_KICK.minSpeed) continue;
      if (!nearCam(r.car.x, r.car.z, 90)) continue;
      const n = Math.random() < dt * 70 ? 2 : 0;
      for (let k = 0; k < n; k++) {
        const bx = r.car.x - Math.sin(r.car.heading) * 2, bz = r.car.z - Math.cos(r.car.heading) * 2;
        leafFx.emit(bx + (Math.random() - 0.5) * 2, 0.5, bz + (Math.random() - 0.5) * 2, 1,
          { spread: 2.5, vy: 7 + Math.random() * 4, life: 2, size: 0.55, vx: -Math.sin(r.car.heading) * 10 + r.car.vx * 0.3, vz: -Math.cos(r.car.heading) * 10 + r.car.vz * 0.3 });
      }
    }
    // Snow piles on cars; steam when a heater melts it
    for (const r of race.racers) {
      const pile = r.mesh.getObjectByName('snowpile');
      if (pile) {
        pile.visible = r.hz.snow > 0.01;
        // lumps pop in one by one as the load grows
        const n = pile.children.length;
        pile.children.forEach((lump, i) => {
          const k = Math.max(0, Math.min(1, r.hz.snow * n - i));
          lump.scale.setScalar(lump.scale.x + (k - lump.scale.x) * Math.min(1, dt * 6));
        });
        // car body frosts over
        const body = r.mesh.getObjectByName('body') as THREE.Mesh | undefined;
        if (body) {
          const mat = body.material as THREE.MeshLambertMaterial;
          mat.userData.base ??= mat.color.getHex();
        }
      }
      // snowflakes visibly falling onto cars in winter
      if (seasonIndexAt(r.car.trackPos.t, hazards.map.offset) === 3 && !inStartZone(r.car.trackPos.t, track.length) && !r.hz.warming
        && nearCam(r.car.x, r.car.z, 60) && Math.random() < dt * 22) {
        // flakes fall fast enough to actually land on the car (no hanging in mid-air when it's parked)
        particles.emit(r.car.x + (Math.random() - 0.5) * 2.4 + r.car.vx * 0.12, 4.6, r.car.z + (Math.random() - 0.5) * 2.4 + r.car.vz * 0.12, 1, 0xffffff,
          { speed: 0.2, up: -6, gravity: 5, life: 0.45, size: 0.26, vx: r.car.vx, vz: r.car.vz });
      }
      if (r.hz.warming && r.hz.snow > 0.02 && Math.random() < dt * 25) {
        particles.emit(r.car.x, 1.6, r.car.z, 1, 0xf2f2f2, { speed: 1, up: 2, gravity: -2.5, life: 1, size: 0.55 });
      }
    }

    // Boost flames out of the exhaust
    for (const r of race.racers) {
      if (r.car.boostUntil > race.now) {
        const bx = r.car.x - Math.sin(r.car.heading) * 2.1, bz = r.car.z - Math.cos(r.car.heading) * 2.1;
        const back = { vx: -Math.sin(r.car.heading) * 8, vz: -Math.cos(r.car.heading) * 8 };
        particles.emit(bx, 0.6, bz, 2, Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { speed: 1.2, up: 1, gravity: -1, life: 0.35, size: 0.4, ...back });
      }
    }
    // Steam from hot engines
    for (const r of race.racers) {
      if ((r.hz.heat > 70 || r.car.stalledUntil > race.now) && Math.random() < dt * 12) {
        particles.emit(r.car.x + Math.sin(r.car.heading) * 1.6, 1.2, r.car.z + Math.cos(r.car.heading) * 1.6, 1, 0xf2f2f2, { speed: 0.8, up: 1.5, gravity: -2, life: 1.2, size: 0.5 });
      }
      // burnt out by the sun: flames, charred body, billowing black smoke
      {
        const rn = race.now;
        const burning = r.car.stalledUntil > rn;
        const fire = r.mesh.getObjectByName('fire');
        if (fire) {
          const k = burning ? 1 : 0;
          const prev = (fire.userData.k ?? 0) as number;
          const kk = prev + (k - prev) * Math.min(1, dt * (burning ? 9 : 5));
          fire.userData.k = kk;
          fire.visible = kk > 0.02;
          fire.children.forEach((f, i) => {
            const flick = 0.75 + 0.35 * Math.sin(rn * 22 + i * 1.9) + 0.15 * Math.sin(rn * 37 + i * 4.1);
            f.scale.set(kk * (0.9 + 0.2 * Math.sin(rn * 17 + i)), kk * flick, kk * (0.9 + 0.2 * Math.cos(rn * 19 + i)));
            f.rotation.y += dt * 4;
          });
        }
        const bodyM = (r.mesh.getObjectByName('body') as THREE.Mesh | undefined)?.material as THREE.MeshLambertMaterial | undefined;
        if (bodyM) {
          // glow red-hot as heat builds; charred while burning
          const hot = burning ? 1 : Math.max(0, (r.hz.heat - 55) / 45);
          bodyM.userData.base ??= bodyM.color.getHex();
          bodyM.color.setHex(bodyM.userData.base).lerp(new THREE.Color(0xeef6ff), r.hz.snow * 0.6).lerp(new THREE.Color(0x1c1410), burning ? 0.75 : 0);
          bodyM.emissive.setHex(0xff3a08).multiplyScalar(hot * (0.35 + 0.25 * Math.sin(race.now * 14)));
        }
        const viewed = views.some((vv) => vv.racer === r);
        if (burning && viewed && Math.random() < dt * 16) sfx.crackle();
        if (burning && Math.random() < dt * 60) {
          const fx = r.car.x + Math.sin(r.car.heading) * 1.0, fz = r.car.z + Math.cos(r.car.heading) * 1.0;
          const roll = Math.random();
          if (roll < 0.35) particles.emit(fx + (Math.random() - 0.5) * 1.6, 1.3, fz + (Math.random() - 0.5) * 1.6, 1, Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { speed: 1, up: 4.5, gravity: 1, life: 0.55, size: 0.5 });
          else if (roll < 0.55) particles.emit(fx, 1.5, fz, 1, 0xffe9a0, { speed: 3.5, up: 6, gravity: 14, life: 0.7, size: 0.16 }); // sparks
          else particles.emit(fx + (Math.random() - 0.5), 2.2, fz + (Math.random() - 0.5), 1, Math.random() < 0.5 ? 0x1c1c1c : 0x3a3a3a, { speed: 1.2, up: 4, gravity: -3.5, life: 2.2, size: 1.3 });
        }
        // the moment it recovers: a big cool-down hiss
        const was = r.mesh.userData.burning as boolean | undefined;
        if (was && !burning && viewed) sfx.cooldown();
        if (was && !burning) particles.emit(r.car.x, 1.6, r.car.z, 22, 0xe8f4ff, { speed: 3, up: 3, gravity: -1, life: 1.1, size: 0.8 });
        r.mesh.userData.burning = burning;
      }
    }

    for (const v of views) {
      const me = v.racer;
      if (!me || !(state === 'race' || state === 'paused')) continue;
      const hud = v.hud;
      const c = me.car;
      const si = inStartZone(c.trackPos.t, track.length) ? 4 : seasonIndexAt(c.trackPos.t, hazards.map.offset);
      if (me.finished) hud.popFinish(me.place);
      else if (!(si === 4 && me.completed >= 0)) hud.popSeason(si); // the neutral zone before the finish line: no "START" banner on the run-in
      if (!me.finished && v.lastSi !== si) {
        if (v.lastSi !== undefined && si < 4 && state === 'race' && race.now > race.startAt) seasonFlourish(v, si, c);
        v.lastSi = si;
      }
      if (v === views[0] && state === 'race' && race.now > race.startAt + 1 && me.place !== lastPlaceSfx) {
        if (lastPlaceSfx > 0) sfx.place(me.place < lastPlaceSfx);
        lastPlaceSfx = me.place;
      }
      if (v === views[0] && si !== lastSeasonSfx) {
        if (lastSeasonSfx !== -1 && state === 'race') sfx.seasonChange(si);
        lastSeasonSfx = si;
        sfx.setSeason(si);
      }
      // Glare
      const facing = Math.sin(c.heading) * seasons.sunDir.x + Math.cos(c.heading) * seasons.sunDir.z;
      const t0 = glareT0();
      const toZone = (t0 - c.trackPos.t) * track.length;
      v.fx.updateGlare(dt, facing, hazards.map.inGlareZone(c.trackPos.t), toZone > 0 && toZone < Math.max(10, c.speed * 1.0));
      // Gust arrow (screen-relative)
      const inAutumn = si === 2;
      let gustAngle = 0;
      {
        // During a gust warning the arrow shows the wind that is coming.
        const rel = hazards.gust && g.warning > 0 ? hazards.gust.nextRel : hazards.windRel;
        const w = hazards.windDir(c.trackPos.t, rel);
        const gx = w.x * -Math.cos(c.heading) + w.z * Math.sin(c.heading); // · right
        const gy = w.x * Math.sin(c.heading) + w.z * Math.cos(c.heading); // · forward
        gustAngle = Math.atan2(-gy, gx);
      }
      {
        const sec = (t: number) => (t % 1 + 1) % 1;
        const prog = (r: Racer) => (r.finished ? 1 : r.completed < 0 ? 0 : Math.min(1, (r.completed + sec(r.car.trackPos.t)) / TRACK.laps));
        hud.setStrip(race.racers.map((r) => ({ p: prog(r), color: '#' + r.color.toString(16).padStart(6, '0'), me: r === me })), si);
      }
      hud.setCountdown(race.startAt - race.now);
      if (v === views[0] && state === 'race') {
        const rem = race.startAt - race.now;
        if (rem > -0.1) {
          const n = Math.ceil(rem);
          if (n !== lastCd) { lastCd = n; if (n >= 1 && n <= 3) sfx.beep(false); else if (n <= 0) sfx.beep(true); }
        }
      }
      hud.showKeys(race.now < race.startAt + 5 && !me.finished);
      hud.update({
        place: me.place,
        total: race.racers.length,
        lap: me.completed + 1,
        lapTime: race.now - me.lapStart,
        progress: me.finished ? 1 : me.completed < 0 ? 0 : (me.completed + c.trackPos.t) / TRACK.laps,
        speed: c.speed,
        heat: me.hz.heat,
        showHeat: si === 1,
        stalled: c.stalledUntil > race.now,
        aquaplaning: me.hz.hydroplaning,
        boosting: c.boostUntil > race.now,
        crack: me.hz.onLake ? me.hz.crack : 0,
        snow: si === 3 || me.hz.snow > 0.03 ? me.hz.snow : -1,
        pad: 0,
        heaters: HEATER_FUEL.on && si === 3 ? hazards.heaterOutUntil.map((u, i) => (u > race!.now ? `<b class="out">${Math.ceil(u - race!.now)}</b>` : `<b>${Math.round(hazards.heaterFuel[i] * 100)}%</b>`)).join('') : '',
        shaded: si === 1 && me.hz.inShade,
        gustWarn: inAutumn ? g.warning : 0,
        sail: SAIL_ON && inAutumn ? me.hz.sail : -1,
        chain: me.hz.chain,
        showChain: si === 0 || (si === 1 && me.hz.chain > 0),
        gustActive: inAutumn && g.active,
        gustAngle,
        grace: me.finished ? -1 : race.graceLeft(),
      });
    }
    if (document.body.classList.contains('debug')) {
      const c = focus.car;
      debug.textContent = `fps ${fps}  speed ${c.speed.toFixed(1)}  heat ${focus.hz.heat.toFixed(0)}\n` +
        `t ${c.trackPos.t.toFixed(3)}  lat ${c.trackPos.lateral.toFixed(1)}  ${c.surface}  lap ${focus.completed} cp ${focus.cp}  calls ${renderer.info.render.calls}`;
    }
  }

  {
    const playing = !!race && state === 'race' && race.phase !== 'finished';
    const lead = playing ? views.map((v) => v.racer).filter((r): r is Racer => !!r).sort((a, b) => Math.abs(b.car.speed) - Math.abs(a.car.speed))[0] : undefined;
    if (lead && race && race.now > race.startAt - 0.8) {
      const c = lead.car;
      const stalled = c.stalledUntil > race.now;
      const slip = c.vx * Math.cos(c.heading) - c.vz * Math.sin(c.heading); // sideways speed
      sfx.drive({
        speed01: stalled ? 0.05 : Math.abs(c.speed) / CAR.maxSpeed,
        throttle: !stalled && (inputs[lead.slot ?? 0]?.throttle ?? 0) > 0,
        slip, surface: c.surface, stalled, boost: c.boostUntil > race.now,
      }, 1);
      // cars zipping past: a whoosh panned to their side when we overtake / get overtaken close by
      for (const o of race.racers) {
        if (o === lead) continue;
        const dl = (o.car.trackPos.t - c.trackPos.t) * track.length;
        const near = Math.abs(dl) < 9 && Math.abs(o.car.trackPos.lateral - c.trackPos.lateral) < 7;
        const prev = passSide.get(o);
        if (prev !== undefined && near && Math.sign(dl) !== Math.sign(prev) && Math.abs(c.speed - o.car.speed) > 2) {
          sfx.pass(Math.max(-1, Math.min(1, (o.car.trackPos.lateral - c.trackPos.lateral) / 6)));
        }
        passSide.set(o, dl);
      }
    } else if (lead) sfx.engine(0.05, false, 0.5);
    else sfx.engineOff();
    sfx.musicLevel(playing);
    sfx.ambience(lastSeasonSfx < 0 ? 4 : lastSeasonSfx, playing);
  }
  particles.update(dt);
  leafFx.update(dt);
  hazardView.update(dt);
  // Render every view (split-screen: left and right halves of one canvas).
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setScissorTest(views.length > 1);
  document.body.classList.toggle('split', views.length > 1);
  views.forEach((v, i) => {
    v.fx.update(dt);
    v.fx.setLeaves(v.racer && state === 'race' ? Math.max(Math.min(1, v.racer.hz.blind / 0.6), (v.racer.hz.wave / WAVE.cover) * WAVE.opacity) : 0);
    if (race) {
      const fr = v.racer ?? [...race.racers].sort((x, y) => x.place - y.place)[0];
      seasons.update(i === 0 ? dt : 0, fr.car.trackPos.t, v.cam.position);
      {
        const inWinter = !inStartZone(fr.car.trackPos.t, track.length) && seasonIndexAt(fr.car.trackPos.t, hazards.map.offset) === 3;
        const wk = inWinter && race.phase !== 'finished' ? blizzardAt(race.now) * seasons.weights[3] : 0;
        const fog = scene.fog as THREE.Fog;
        fog.near *= 1 - 0.85 * wk;
        fog.far *= 1 - 0.7 * wk;
        v.fx.setWhiteout(prefs.reduceFlashes ? wk * 0.5 : wk);
        if (i === 0) { if (wk > 0.05 && !blizzardOn) { blizzardOn = true; sfx.blizzard(); } else if (wk < 0.02) blizzardOn = false; }
      }
      v.fx.setRain(state === 'race' ? seasons.weights[0] : 0);
      petalView.update(i === 0 ? dt : 0, v.racer ? v.racer.hz.petalGot : []);
      sun.position.set(fr.car.x + 30, 60, fr.car.z + 20);
      sun.target.position.set(fr.car.x, 0, fr.car.z);
    }
    // sky follows this view's camera; colours from the season blend
    if (i === 0) {
      const sw = seasons.weights;
      sunGlowDir.set(seasons.sunDir.x, 0.09, seasons.sunDir.z).normalize();
      sky.update(dt, (scene.fog as THREE.Fog).color, scene.background as THREE.Color, sunGlowDir, sun.color, 0.3 + sw[1] * 0.45, 0.7 - sw[3] * 0.5);
      grade.uniforms.uWarm.value = sw[1] * 0.3 + sw[2] * 0.8 - sw[3] * 0.8;
      grade.uniforms.uSat.value = 1.1 + sw[2] * 0.06 - sw[1] * 0.08 - sw[3] * 0.04;
    }
    sky.follow(v.cam.position);
    if (race) {
      const showTags = (prefs.nameTags || prefs.colorBlind) && (state === 'race' || state === 'paused');
      for (const r of race.racers) {
        const tg = r.mesh.getObjectByName('tag');
        if (!tg) continue;
        // never over your own car; fade out tags right next to the camera
        const d = Math.hypot(r.car.x - v.cam.position.x, r.car.z - v.cam.position.z);
        tg.visible = showTags && r !== v.racer && d > 8 && d < 140;
        tg.scale.set(3.2, 0.8, 1);
      }
    }
    const x = v.side === 'right' ? W / 2 : 0, w = v.side === 'full' ? W : W / 2;
    if (postOn && views.length === 1) {
      renderPass.camera = v.cam;
      renderer.setViewport(0, 0, W, H);
      composer.render(dt);
    } else {
      renderer.setViewport(x, 0, w, H);
      renderer.setScissor(x, 0, w, H);
      renderer.render(scene, v.cam);
    }
    v.fx.setSpeed(v.racer && state === 'race' && !prefs.reduceFlashes ? Math.abs(v.racer.car.speed) / CAR.maxSpeed : 0);
  });
  // Weak GPU? Drop the post effects if we can't hold ~35 fps.
  if (postOn && state === 'race') {
    slowTime = fps > 0 && fps < 35 ? slowTime + dt : Math.max(0, slowTime - dt);
    if (slowTime > 4 && !location.search.includes('hifx')) { postOn = false; settings.prefs.quality = 'low'; console.info('[fsr] low fps: post effects off'); }
  }

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
}

applyPrefs(settings.prefs);
toMenu();
// Opened from a lobby QR code (?join=CODE): straight to the join form. Otherwise, on first launch,
// show how to play before the menu.
const joinCode = new URLSearchParams(location.search).get('join');
if (joinCode && /^[a-z]{4}$/i.test(joinCode)) menu.showOnline(joinCode);
else if (!HowToPlay.seen()) { menu.hideAll(); howTo.open(); }
requestAnimationFrame(frame);

// Expose for console debugging / automated tests.
(window as unknown as { __fsr: unknown }).__fsr = {
  waveView,
  leafFx,
  seasons,
  sfx,
  get race() { return race; },
  get state() { return state; },
  hazards,
  track,
  startSolo,
  toMenu,
  howTo,
  renderer,
};
