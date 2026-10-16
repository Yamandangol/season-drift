// Gradient sky dome: deep zenith colour fading to the season's fog colour at the horizon (so the fog
// blends into the sky seamlessly), with a soft sun glow and a little high-altitude cloud wisp.

import * as THREE from 'three';

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3d7fd6) },
        uHorizon: { value: new THREE.Color(0xcfe3f0) },
        uGround: { value: new THREE.Color(0xa0b090) },
        uSunDir: { value: new THREE.Vector3(1, 0.1, 0).normalize() },
        uSunColor: { value: new THREE.Color(0xfff2c8) },
        uSunGlow: { value: 0.5 },
        uTime: { value: 0 },
        uWisp: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // always at the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uGround, uSunColor, uSunDir;
        uniform float uSunGlow, uTime, uWisp;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.8)) : mix(uHorizon, uGround, smoothstep(0.0, -0.15, h));
          // thin high wisps
          if (h > 0.02) {
            vec2 uv = d.xz / (h + 0.25) * 2.2 + vec2(uTime * 0.01, 0.0);
            float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
            float w = smoothstep(0.55, 0.85, n) * smoothstep(0.02, 0.25, h) * uWisp;
            col = mix(col, vec3(1.0), w * 0.55);
          }
          // sun glow + horizon haze toward the sun
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6) * uSunGlow;
          col = mix(col, uHorizon, (1.0 - smoothstep(0.0, 0.08, abs(h))) * 0.5);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  /** horizon = current fog colour, sky = palette sky colour */
  update(dt: number, horizon: THREE.Color, sky: THREE.Color, sunDir: THREE.Vector3, sunColor: THREE.Color, glow: number, wisp: number) {
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    u.uHorizon.value.copy(horizon);
    // zenith: a deeper, more saturated version of the palette sky
    const hsl = { h: 0, s: 0, l: 0 };
    sky.getHSL(hsl);
    u.uTop.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.08), Math.max(0.25, hsl.l * 0.78));
    u.uGround.value.copy(horizon).multiplyScalar(0.85);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uSunGlow.value = glow;
    u.uWisp.value = wisp;
  }

  follow(pos: THREE.Vector3) {
    this.mesh.position.copy(pos);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
