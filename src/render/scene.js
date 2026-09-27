// The 3D diorama: a floating platform inside the rift where combat plays out.
// The DOM UI asks it for screen positions (project) to place HP bars/intents.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildPlayer, buildEnemy } from './models.js';
import { Particles, Transients, makeRing, makeBubble, makeOrb, makeBeam, makeFlash } from './fx.js';

const PALETTES = {
  1: { bg1: '#05070f', bg2: '#0c2238', bg3: '#23c6ff', rift: '#36d6ff', edge: '#2ec9ff', hemi: '#4a86d8', fog: '#060a14', accent: '#ff3f9a' },
  2: { bg1: '#07050f', bg2: '#22123f', bg3: '#a06bff', rift: '#a26bff', edge: '#9a6bff', hemi: '#7a5bd8', fog: '#08060f', accent: '#ffb347' },
  3: { bg1: '#0d0407', bg2: '#35091a', bg3: '#ff4a5e', rift: '#ff3b4f', edge: '#ff4a5e', hemi: '#d8506a', fog: '#0c0407', accent: '#ffe6a8' },
};

const RANGED = new Set(['drone', 'wisp', 'sentry', 'cultist', 'seraph', 'sentinel', 'weaver', 'shade', 'gatekeeper', 'heart', 'sovereign', 'archon']);

const NOISE_GLSL = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

export class Diorama {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
    this.insets = { top: 0, bottom: 0 };
    this.units = new Map();
    this.enemyOrder = [];
    this.time = 0;
    this.shakeAmt = 0;
    this.freeze = 0; // hit-stop: seconds left in which the action runs at a crawl
    this.kick = 0; // degrees the field of view is narrowed for an impact punch
    this.baseFov = 36;
    this.speed = 1;
    this.mode = 'title';
    this.onFrame = null;
    this.reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.pal = {};
    this.palTarget = {};
    for (const [k, v] of Object.entries(PALETTES[1])) {
      this.pal[k] = new THREE.Color(v);
      this.palTarget[k] = new THREE.Color(v);
    }

    this.buildWorld();
    this.particles = new Particles(this.scene);
    this.transients = new Transients(this.scene);

    this.camPos = new THREE.Vector3(0, 4, 13);
    this.camLook = new THREE.Vector3(0, 1, 0);
    this.camGoalPos = this.camPos.clone();
    this.camGoalLook = this.camLook.clone();

    this.setQuality(quality);
    this.player = null;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- world --

  buildWorld() {
    const s = this.scene;
    this.fog = new THREE.FogExp2(this.pal.fog, 0.014);
    s.fog = this.fog;

    this.bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uC1: { value: this.pal.bg1 }, uC2: { value: this.pal.bg2 }, uC3: { value: this.pal.bg3 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform vec3 uC1, uC2, uC3;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.015, uTime * 0.01));
          float n2 = fbm(d * 4.5 + n * 1.8 - vec3(uTime * 0.01));
          vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.85, n2));
          col += uC3 * pow(smoothstep(0.5, 0.95, n2 * n + 0.25), 3.0) * 0.55;
          col *= 0.4 + 0.6 * smoothstep(-0.7, 0.35, d.y);
          float star = step(0.9975, hash(floor(d * 380.0)));
          col += star * (0.5 + 0.5 * sin(uTime * 2.0 + d.x * 90.0)) * 0.7;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    s.add(new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), this.bgMat));

    // The rift itself: a glowing tear behind the arena.
    this.riftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: this.pal.rift } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform vec3 uColor;
        ${NOISE_GLSL}
        void main() {
          float y = vUv.y;
          float wob = (noise(vec3(y * 5.0, uTime * 0.25, 0.0)) - 0.5) * 0.22 + (noise(vec3(y * 24.0, uTime * 0.8, 3.0)) - 0.5) * 0.05;
          float d = abs(vUv.x - 0.5 - wob);
          float core = smoothstep(0.012, 0.0, d);
          float glow = exp(-d * 14.0) * 0.9 + exp(-d * 4.0) * 0.25;
          float fade = smoothstep(0.0, 0.2, y) * smoothstep(1.0, 0.75, y);
          float flow = 0.75 + 0.25 * noise(vec3(vUv * vec2(8.0, 30.0) - vec2(0.0, uTime * 1.5), 1.0));
          vec3 col = (uColor * glow * flow + vec3(1.0) * core) * fade;
          gl_FragColor = vec4(col, clamp((glow + core) * fade, 0.0, 1.0));
        }`,
    });
    this.rift = new THREE.Mesh(new THREE.PlaneGeometry(14, 44), this.riftMat);
    this.rift.position.set(1.5, 8, -38);
    this.rift.rotation.z = -0.12;
    s.add(this.rift);

    // Lights
    this.hemi = new THREE.HemisphereLight(this.pal.hemi, 0x05060a, 1.1);
    s.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 9, 7);
    s.add(key);
    // Soft fill from the camera side so fronts facing away from the key stay readable.
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.9);
    fill.position.set(-6, 4, 10);
    s.add(fill);
    this.riftLight = new THREE.PointLight(this.pal.rift, 60, 40, 1.6);
    this.riftLight.position.set(1, 5, -10);
    s.add(this.riftLight);

    // Platform
    const plat = new THREE.Group();
    this.platform = plat;
    s.add(plat);
    const topGeo = new THREE.CylinderGeometry(6.4, 5.6, 0.7, 6, 1);
    const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x131728, metalness: 0.4, roughness: 0.7, flatShading: true }));
    top.position.y = -0.35;
    plat.add(top);
    this.edgeMat = new THREE.LineBasicMaterial({ color: this.pal.edge, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(topGeo), this.edgeMat);
    edges.position.y = -0.35;
    plat.add(edges);
    this.hexMat = new THREE.LineBasicMaterial({ color: this.pal.edge, transparent: true, opacity: 0.22 });
    for (const r of [5.3, 3.6, 1.9]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r));
      }
      plat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.hexMat));
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x0e1120, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const r = 0.5 + Math.random() * 1.1;
      const hgt = 1.5 + Math.random() * 3.5;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(r, hgt, 5), rockMat);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 4.6;
      rock.position.set(Math.cos(a) * d, -0.7 - hgt / 2, Math.sin(a) * d);
      rock.rotation.set(Math.PI + (Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3);
      plat.add(rock);
    }

    // Floating debris orbiting the arena.
    const N = 46;
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x1a1f33, emissive: this.pal.edge.clone().multiplyScalar(0.25), flatShading: true });
    this.debris = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), this.debrisMat, N);
    this.debrisData = Array.from({ length: N }, () => ({
      r: 8 + Math.random() * 12, a: Math.random() * Math.PI * 2, y: -3 + Math.random() * 9,
      s: 0.3 + Math.random() * 1.2, sp: (Math.random() * 0.5 + 0.2) * (Math.random() > 0.5 ? 1 : -1) * 0.05, rot: Math.random() * 6,
    }));
    s.add(this.debris);
    this.dummy = new THREE.Object3D();
  }

  setAct(act) {
    const p = PALETTES[act] || PALETTES[1];
    for (const [k, v] of Object.entries(p)) this.palTarget[k].set(v);
  }

  setQuality(q) {
    this.quality = q;
    const coarse = matchMedia?.('(pointer: coarse)').matches;
    const maxDpr = q === 'high' ? (coarse ? 1.75 : 2) : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    if (q === 'high' && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.5, 0.78);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  setInsets(top, bottom) {
    this.insets = { top, bottom };
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const dy = (this.insets.bottom - this.insets.top) / 2;
    this.camera.setViewOffset(w, h, 0, dy, w, h);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      const pr = this.renderer.getPixelRatio();
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.bloom?.resolution.set(w / 2, h / 2);
    }
    this.particles?.setScale((h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.arrange();
  }

  // ---------------------------------------------------------------- units --

  addUnit(ref, built, { isPlayer = false, entrance = true } = {}) {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    inner.add(built.root);
    const mats = [];
    built.root.traverse((o) => {
      if (o.material && o.material.isMeshStandardMaterial) mats.push({ m: o.material, e: o.material.emissive.clone(), ei: o.material.emissiveIntensity });
    });
    const blob = new THREE.Mesh(new THREE.CircleGeometry(built.width * 0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    group.add(blob);
    const shieldRing = makeRing('#7cc4ff', 0.45, 0.94);
    shieldRing.scale.setScalar(built.width * 0.62);
    shieldRing.position.y = 0.05;
    shieldRing.visible = false;
    group.add(shieldRing);
    const u = {
      ref, isPlayer, group, inner, built, mats, height: built.height, width: built.width,
      base: new THREE.Vector3(), facing: 0, flash: 0, shakeT: 0, lunge: null, dying: false, dieT: 0,
      spawnT: entrance ? 0 : 1, shieldRing, state: {}, orbs: [], emberT: 0, phase: Math.random() * 10,
    };
    this.units.set(ref, u);
    this.scene.add(group);
    if (isPlayer) this.player = u;
    return u;
  }

  removeUnit(ref) {
    const u = this.units.get(ref);
    if (!u) return;
    this.scene.remove(u.group);
    u.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.units.delete(ref);
    if (this.player === u) this.player = null;
  }

  clearEnemies() {
    for (const ref of [...this.units.keys()]) if (ref !== 'P') this.removeUnit(ref);
    this.enemyOrder = [];
  }

  ensurePlayer() {
    if (!this.units.has('P')) this.addUnit('P', buildPlayer(), { isPlayer: true, entrance: false });
    return this.units.get('P');
  }

  /** Title screen: the runner alone, slow orbit. */
  showTitle() {
    this.mode = 'title';
    this.clearEnemies();
    this.ensurePlayer();
    this.arrange(true);
  }

  /** Between rooms: runner idles at the center. */
  showIdle() {
    this.mode = 'idle';
    this.clearEnemies();
    this.ensurePlayer();
    this.arrange();
  }

  /** Enter combat with the given enemy units [{ ref, def }]. */
  setupCombat(enemies) {
    this.mode = 'combat';
    this.clearEnemies();
    this.ensurePlayer();
    for (const e of enemies) this.addEnemy(e.ref, e.def, true);
    this.arrange();
  }

  addEnemy(ref, def, entrance = true, slotIndex = null) {
    const u = this.addUnit(ref, buildEnemy(def), { entrance });
    u.model = def.model;
    if (slotIndex !== null && slotIndex < this.enemyOrder.length) this.enemyOrder.splice(slotIndex, 1, ref);
    else this.enemyOrder.push(ref);
    this.arrange();
    if (entrance) this.warpIn(u);
    return u;
  }

  /** A column of light and a ground ring where an enemy rises onto the platform. */
  warpIn(u) {
    // Deferred a tick: while a fight is set up, later enemies still shift the earlier ones' spots.
    setTimeout(() => {
      if (!this.units.has(u.ref)) return;
      const color = u.built.glow || '#ff5b6b';
      const at = u.base.clone();
      const beam = makeBeam(at.clone().setY(u.height + 4), at.clone().setY(0), color, u.width * 0.12);
      this.transients.add(beam, this.dur(550) / 1000, (k, dt, o) => {
        o.material.opacity = (1 - k) ** 2;
        o.scale.x = o.scale.z = 1 - k * 0.8;
      });
      this.ring(u.ref, color, { size: 1.8, dur: 700, at });
      this.particles.emit(at.clone().setY(0.2), { n: 26, color, speed: 2.4, life: 0.7, size: 0.12, up: 1.6, gravity: 2 });
    }, 0);
  }

  /** Compute unit positions for the current mode and aspect, then fit the camera. */
  arrange(snap = false) {
    const p = this.units.get('P');
    const portrait = this.w / Math.max(1, this.h - this.insets.top - this.insets.bottom) < 1.0;
    const enemies = this.enemyOrder.map((r) => this.units.get(r)).filter((u) => u && !u.dying);
    if (this.mode !== 'combat' || !enemies.length) {
      if (p) { p.base.set(0, 0, 0.5); p.facing = this.mode === 'title' ? -0.4 : 0.3; }
      if (this.mode === 'title') return;
      this.camGoalLook.set(0, 1.0, 0.5);
      this.camGoalPos.set(0, 3.4, 10.5);
      if (snap) { this.camPos.copy(this.camGoalPos); this.camLook.copy(this.camGoalLook); }
      return;
    }
    const gap = this.gap = portrait ? 0.4 : 0.65;
    const total = enemies.reduce((s, u) => s + u.width, 0) + gap * (enemies.length - 1);
    if (portrait) {
      // Enemies across the back, the runner small in the front-left corner.
      const twoRows = total > 4.6 && enemies.length > 2;
      if (twoRows) {
        const back = enemies.filter((_, i) => i % 2 === 0);
        const front = enemies.filter((_, i) => i % 2 === 1);
        this.placeRow(back, 0.3, -2.4);
        this.placeRow(front, 0.6, -0.9);
      } else this.placeRow(enemies, 0.35, -1.6);
      if (p) p.base.set(-Math.max(1.3, Math.min(2.2, total / 2)), 0, 1.5);
    } else {
      const centerX = 1.9 + Math.max(0, total - 3.6) * 0.25;
      this.placeRow(enemies, centerX, -0.2, true);
      if (p) p.base.set(-3.1 - Math.max(0, total - 4) * 0.2, 0, 0.5);
    }
    // Everyone faces the other side.
    const center = new THREE.Vector3();
    enemies.forEach((u) => center.add(u.base));
    center.multiplyScalar(1 / enemies.length);
    if (p) {
      const d = center.clone().sub(p.base);
      p.facing = Math.atan2(-d.z, d.x);
      for (const u of enemies) {
        const e = p.base.clone().sub(u.base);
        u.facing = Math.atan2(-e.z, e.x);
      }
    }
    this.fitCamera(portrait, snap);
  }

  placeRow(list, cx, z, stagger = false) {
    const gap = this.gap || 0.5;
    const total = list.reduce((s, u) => s + u.width, 0) + gap * (list.length - 1);
    let x = cx - total / 2;
    list.forEach((u, i) => {
      u.base.set(x + u.width / 2, 0, z + (stagger ? (i % 2 ? 0.35 : -0.2) : 0));
      x += u.width + gap;
    });
  }

  fitCamera(portrait, snap) {
    const fov = portrait ? 30 : 34;
    if (this.baseFov !== fov) {
      this.baseFov = fov;
      this.camera.fov = fov - this.kick;
      this.camera.updateProjectionMatrix();
      this.particles?.setScale((this.h * this.renderer.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360)));
    }
    const units = [...this.units.values()].filter((u) => !u.dying);
    const min = new THREE.Vector3(Infinity, 0, Infinity);
    const max = new THREE.Vector3(-Infinity, 0, -Infinity);
    for (const u of units) {
      min.x = Math.min(min.x, u.base.x - u.width / 2);
      max.x = Math.max(max.x, u.base.x + u.width / 2);
      min.z = Math.min(min.z, u.base.z);
      max.z = Math.max(max.z, u.base.z);
      max.y = Math.max(max.y, u.height);
    }
    const look = new THREE.Vector3((min.x + max.x) / 2, max.y * 0.42, (min.z + max.z) / 2);
    const pitch = portrait ? 0.46 : 0.28;
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const cam = this.camera.clone();
    cam.fov = this.baseFov; // fit without a running impact kick
    cam.updateProjectionMatrix();
    const pts = [];
    for (const u of units) {
      for (const dx of [-u.width / 2, u.width / 2]) {
        pts.push(new THREE.Vector3(u.base.x + dx, u.height + 0.95, u.base.z));
        pts.push(new THREE.Vector3(u.base.x + dx, -0.55, u.base.z));
      }
    }
    const top = 1 - (2 * this.insets.top) / this.h;
    const bottom = -1 + (2 * this.insets.bottom) / this.h;
    const fits = (d) => {
      cam.position.copy(look).addScaledVector(dir, d);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      for (const p of pts) {
        const v = p.clone().project(cam);
        if (Math.abs(v.x) > 0.9 || v.y > top - 0.04 || v.y < bottom + 0.04) return false;
      }
      return true;
    };
    let lo = 4;
    let hi = 60;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    this.camGoalLook.copy(look);
    this.camGoalPos.copy(look).addScaledVector(dir, hi);
    if (snap) { this.camPos.copy(this.camGoalPos); this.camLook.copy(this.camGoalLook); }
  }

  /** Screen-space anchors for a unit's overlay. */
  project(ref) {
    const u = this.units.get(ref);
    if (!u) return null;
    const p = u.group.position;
    const foot = new THREE.Vector3(p.x, 0, p.z).project(this.camera);
    const head = new THREE.Vector3(p.x, u.height * (u.group.scale.y || 1) + 0.1, p.z).project(this.camera);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const side = new THREE.Vector3(p.x, 0, p.z).addScaledVector(right, u.width / 2).project(this.camera);
    const sx = (v) => ((v.x + 1) / 2) * this.w;
    const sy = (v) => ((1 - v.y) / 2) * this.h;
    return { x: sx(foot), footY: sy(foot), headY: sy(head), halfW: Math.abs(sx(side) - sx(foot)) };
  }

  // ------------------------------------------------------------------ fx ---

  pointOf(ref, where = 'center') {
    const u = this.units.get(ref);
    if (!u) return new THREE.Vector3();
    const p = u.group.position.clone();
    if (where === 'center') p.y += u.height * 0.55;
    if (where === 'head') p.y += u.height;
    if (where === 'muzzle' && u.built.muzzle) return u.built.muzzle.getWorldPosition(new THREE.Vector3());
    if (where === 'muzzle') p.y += u.height * 0.6;
    return p;
  }

  dur(ms) { return ms / this.speed; }

  /** Attack animation; resolves at the moment of impact. */
  attack(srcRef, tgtRef, { color = '#36c9f0', kind = 'shot' } = {}) {
    return new Promise((resolve) => {
      const src = this.units.get(srcRef);
      const tgt = this.units.get(tgtRef);
      if (!src || !tgt) { resolve(); return; }
      const ranged = src.isPlayer || RANGED.has(src.model);
      const dir = tgt.base.clone().sub(src.base).setY(0).normalize();
      if (kind === 'beam') {
        const a = this.pointOf(srcRef, 'muzzle');
        const b = this.pointOf(tgtRef, 'center');
        const beam = makeBeam(a, b, color, 0.07);
        this.transients.add(beam, this.dur(320) / 1000, (k, dt, o) => { o.material.opacity = 1 - k; o.scale.x = o.scale.z = 1 + k * 2; });
        src.lunge = { t: 0, dur: this.dur(260) / 1000, dir: dir.clone().multiplyScalar(-1), dist: 0.25 };
        this.particles.emit(b, { n: 24, color, speed: 4, life: 0.5, size: 0.14 });
        setTimeout(resolve, this.dur(60));
        return;
      }
      if (ranged) {
        src.lunge = { t: 0, dur: this.dur(220) / 1000, dir: src.isPlayer ? dir.clone().multiplyScalar(-1) : dir, dist: 0.18 };
        const a = this.pointOf(srcRef, 'muzzle');
        const b = this.pointOf(tgtRef, 'center');
        const orb = makeOrb(color, src.isPlayer ? 0.09 : 0.13);
        orb.position.copy(a);
        const travel = this.dur(src.isPlayer ? 190 : 260) / 1000;
        const arc = 0.25 + Math.random() * 0.2;
        this.transients.add(orb, travel, (k, dt, o) => {
          o.position.lerpVectors(a, b, k);
          o.position.y += Math.sin(k * Math.PI) * arc;
          if (Math.random() < 0.8) this.particles.emit(o.position, { n: 1, color, speed: 0.3, life: 0.3, size: 0.09 });
        }, resolve);
      } else {
        const dur = this.dur(320) / 1000;
        src.lunge = { t: 0, dur, dir, dist: Math.min(1.4, src.base.distanceTo(tgt.base) * 0.4) };
        setTimeout(resolve, dur * 450);
      }
    });
  }

  hit(ref, { amount = 0, blocked = 0, color = '#ffffff' } = {}) {
    const u = this.units.get(ref);
    if (!u) return;
    const at = this.pointOf(ref, 'center');
    if (amount > 0) {
      u.flash = 1;
      u.shakeT = 0.28;
      this.particles.emit(at, { n: 12 + Math.min(30, amount), color, speed: 3.2, life: 0.55, size: 0.12, gravity: 3 });
      this.particles.emit(at, { n: 6, color: '#ffffff', speed: 2, life: 0.25, size: 0.18 });
      this.flash(at, color, u.width * (0.9 + Math.min(1, amount / 20)));
      this.shake(Math.min(0.35, amount / 60));
      // Heavy hits land with a brief freeze and a punch of the camera.
      if (amount >= 10) this.impact(0.04 + Math.min(0.05, amount / 500), Math.min(1.6, amount / 14));
    }
    if (blocked > 0) {
      this.flash(at, '#7cc4ff', u.width * 0.8, 160);
      const b = makeBubble('#7cc4ff');
      b.position.copy(at);
      b.scale.setScalar(u.width * 0.75);
      this.transients.add(b, 0.35, (k, dt, o) => { o.material.opacity = 0.7 * (1 - k); o.scale.setScalar(u.width * (0.75 + k * 0.25)); });
      this.particles.emit(at, { n: 10, color: '#9fd8ff', speed: 3, life: 0.35, size: 0.1 });
    }
  }

  ring(ref, color, { rise = 0, size = 1, dur = 600, at = null } = {}) {
    const u = this.units.get(ref);
    if (!u) return;
    const r = makeRing(color);
    const base = (at || u.group.position).clone();
    base.y += rise < 0 ? u.height : 0.05;
    r.position.copy(base);
    const w = u.width * size;
    this.transients.add(r, this.dur(dur) / 1000, (k, dt, o) => {
      o.scale.setScalar(w * (0.4 + k * 0.8));
      o.position.y = base.y + rise * k * u.height;
      o.material.opacity = 0.9 * (1 - k);
    });
  }

  shieldUp(ref) {
    const u = this.units.get(ref);
    if (!u) return;
    const b = makeBubble('#7cc4ff');
    const at = this.pointOf(ref, 'center');
    b.position.copy(at);
    this.transients.add(b, this.dur(500) / 1000, (k, dt, o) => {
      o.scale.setScalar(u.width * (0.3 + k * 0.55));
      o.rotation.y = k * 2;
      o.material.opacity = 0.75 * (1 - k * k);
    });
    this.ring(ref, '#7cc4ff', { size: 1.2 });
  }

  buff(ref, color = '#5be39b') {
    this.ring(ref, color, { rise: 1, dur: 700 });
    this.particles.emit(this.pointOf(ref, 'center'), { n: 14, color, speed: 1.2, life: 0.8, size: 0.1, up: 1.2, gravity: -1 });
  }

  debuff(ref, color = '#c38bff') {
    this.ring(ref, color, { rise: -1, dur: 700 });
    this.particles.emit(this.pointOf(ref, 'head'), { n: 14, color, speed: 1.2, life: 0.8, size: 0.1, gravity: 3 });
  }

  heal(ref) {
    this.particles.emit(this.pointOf(ref, 'center'), { n: 22, color: '#5be39b', speed: 1, life: 1, size: 0.12, up: 1.5, gravity: -1.5 });
  }

  cast(color) {
    if (!this.player) return;
    this.ring('P', color, { size: 1.6, dur: 450 });
    this.particles.emit(this.pointOf('P', 'center'), { n: 8, color, speed: 1.6, life: 0.4, size: 0.1 });
  }

  burnTick(ref) {
    this.particles.emit(this.pointOf(ref, 'center'), { n: 18, color: '#ff7a2f', speed: 1.4, life: 0.7, size: 0.13, up: 1, gravity: -2 });
  }

  /** Bright flash at a point, turned to the camera, for impacts. */
  flash(at, color, size = 1, ms = 200) {
    const f = makeFlash(color);
    f.position.copy(at);
    this.transients.add(f, this.dur(ms) / 1000, (k, dt, o) => {
      o.quaternion.copy(this.camera.quaternion);
      o.scale.setScalar(size * (0.5 + k * 1.1));
      o.material.opacity = (1 - k) ** 1.5;
    });
  }

  /** Hit-stop and field-of-view punch. Skipped for reduced motion. */
  impact(freeze, kick) {
    if (this.reduced) return;
    this.freeze = Math.max(this.freeze, freeze);
    this.kick = Math.min(2.2, this.kick + kick);
  }

  /** Fight won: a golden burst rises around the runner. */
  victory() {
    if (!this.player) return;
    const at = this.pointOf('P', 'center');
    this.ring('P', '#ffc84a', { size: 2.4, dur: 900 });
    this.ring('P', '#ffe6a8', { size: 1.4, dur: 700, rise: 1 });
    this.particles.emit(at, { n: 50, color: '#ffc84a', speed: 2.6, life: 1.3, size: 0.12, up: 2, gravity: -0.6 });
    this.flash(at, '#ffc84a', 2.4, 450);
  }

  explode(ref, color = '#ff3b4f') {
    const at = this.pointOf(ref, 'center');
    this.flash(at, '#ffe6a8', 3.2, 320);
    this.impact(0.08, 1.8);
    this.particles.emit(at, { n: 60, color, speed: 6, life: 0.8, size: 0.16, gravity: 2 });
    this.particles.emit(at, { n: 20, color: '#ffe6a8', speed: 3, life: 0.4, size: 0.25 });
    this.shake(0.4);
  }

  die(ref) {
    const u = this.units.get(ref);
    if (!u || u.dying) return;
    u.dying = true;
    u.dieT = 0;
    const at = this.pointOf(ref, 'center');
    this.particles.emit(at, { n: 50, color: u.built.glow, speed: 4.5, life: 0.9, size: 0.14, gravity: 4 });
    this.particles.emit(at, { n: 14, color: '#ffffff', speed: 2, life: 0.35, size: 0.22 });
    this.flash(at, u.built.glow || '#ffffff', u.width * 2.2, 380);
    this.ring(ref, u.built.glow || '#ffffff', { size: 2.6, dur: 750, at: u.base });
    this.impact(0.07, 0.8);
    this.shake(0.2);
    this.arrange();
  }

  shake(amt) {
    if (this.reduced) return;
    this.shakeAmt = Math.min(0.6, this.shakeAmt + amt);
  }

  /** Persistent per-unit visuals (shield ring, burn embers, charge orbs...). */
  setState(ref, state) {
    const u = this.units.get(ref);
    if (!u) return;
    u.state = { ...u.state, ...state };
    u.shieldRing.visible = (u.state.shield || 0) > 0;
    if (u.isPlayer) {
      const want = Math.min(10, u.state.charge || 0);
      while (u.orbs.length < want) {
        const o = makeOrb('#ffe066', 0.05);
        this.scene.add(o);
        u.orbs.push(o);
      }
      while (u.orbs.length > want) {
        const o = u.orbs.pop();
        this.particles.emit(o.position, { n: 6, color: '#ffe066', speed: 1.5, life: 0.4, size: 0.08 });
        this.scene.remove(o);
      }
    }
  }

  // ---------------------------------------------------------------- loop ---

  loop() {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    // During a hit-stop the action (units, particles, effects) crawls; the camera keeps moving.
    let sdt = dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      sdt = dt * 0.08;
    }
    this.time += sdt;
    const t = this.time;

    // Palette easing
    const k = 1 - Math.exp(-dt * 1.5);
    for (const key of Object.keys(this.pal)) this.pal[key].lerp(this.palTarget[key], k);
    this.fog.color.copy(this.pal.fog);
    this.hemi.color.copy(this.pal.hemi);
    this.riftLight.color.copy(this.pal.rift);
    this.edgeMat.color.copy(this.pal.edge);
    this.hexMat.color.copy(this.pal.edge);
    this.debrisMat.emissive.copy(this.pal.edge).multiplyScalar(0.22);
    this.bgMat.uniforms.uTime.value = t;
    this.riftMat.uniforms.uTime.value = t;

    // Debris
    this.debrisData.forEach((d, i) => {
      d.a += d.sp * dt;
      this.dummy.position.set(Math.cos(d.a) * d.r, d.y + Math.sin(t * 0.3 + i) * 0.3, Math.sin(d.a) * d.r - 4);
      this.dummy.rotation.set(t * 0.2 + d.rot, t * 0.15 + i, 0);
      this.dummy.scale.setScalar(d.s);
      this.dummy.updateMatrix();
      this.debris.setMatrixAt(i, this.dummy.matrix);
    });
    this.debris.instanceMatrix.needsUpdate = true;

    // Units
    for (const u of [...this.units.values()]) this.updateUnit(u, sdt, t);

    // Camera
    if (this.mode === 'title') {
      const a = t * 0.08;
      const wide = this.w > this.h * 1.1;
      const dist = wide ? 9.5 : 12;
      this.camGoalPos.set(Math.sin(a) * dist, 2.4 + Math.sin(t * 0.2) * 0.3, Math.cos(a) * dist + 0.5);
      // Look past the runner so it sits right of the title text on wide screens.
      const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(wide ? -2.6 : 0);
      this.camGoalLook.set(side.x, wide ? 1.3 : 2.2, 0.5 + side.z);
    }
    const ck = 1 - Math.exp(-dt * 3);
    this.camPos.lerp(this.camGoalPos, ck);
    this.camLook.lerp(this.camGoalLook, ck);
    this.camera.position.copy(this.camPos);
    if (this.mode !== 'title') {
      this.camera.position.x += Math.sin(t * 0.25) * 0.12;
      this.camera.position.y += Math.sin(t * 0.33) * 0.06;
    }
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(this.camLook);
    const fov = this.baseFov - this.kick;
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.kick = this.kick > 0.01 ? this.kick * Math.exp(-dt * 7) : 0;

    this.particles.update(sdt);
    this.transients.update(sdt);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }

  updateUnit(u, dt, t) {
    const g = u.group;
    const pk = 1 - Math.exp(-dt * 6);
    g.position.lerp(u.base, pk);
    let ang = u.facing - g.rotation.y;
    ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    g.rotation.y += ang * pk;
    u.built.update?.(t + u.phase, dt, u.state);

    // Entrance
    if (u.spawnT < 1) {
      u.spawnT = Math.min(1, u.spawnT + dt * 1.8);
      const e = 1 - (1 - u.spawnT) ** 3;
      u.inner.position.y = (1 - e) * -1.8;
      u.inner.scale.setScalar(0.3 + e * 0.7);
    } else {
      u.inner.position.y = 0;
      if (!u.dying) u.inner.scale.setScalar(1);
    }

    // Lunge
    const off = new THREE.Vector3();
    if (u.lunge) {
      u.lunge.t += dt;
      const k = Math.min(1, u.lunge.t / u.lunge.dur);
      const s = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
      off.copy(u.lunge.dir).multiplyScalar(u.lunge.dist * Math.max(0, s));
      if (k >= 1) u.lunge = null;
    }
    if (u.shakeT > 0) {
      u.shakeT -= dt;
      off.x += (Math.random() - 0.5) * 0.12;
      off.z += (Math.random() - 0.5) * 0.12;
    }
    // inner is rotated with the group; convert world offset to local
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
    u.inner.position.x = off.x;
    u.inner.position.z = off.z;
    u.inner.position.y += Math.sin(t * 1.6 + u.phase) * 0.03;

    // Hit flash
    if (u.flash > 0) {
      u.flash = Math.max(0, u.flash - dt * 5);
      for (const { m, e } of u.mats) {
        m.emissive.copy(e).lerp(new THREE.Color(1, 1, 1), u.flash);
      }
    }

    // Phased: flicker
    const phased = (u.state.phased || 0) > 0;
    u.inner.visible = !phased || Math.sin(t * 22) > -0.6;

    // Shield ring pulse
    if (u.shieldRing.visible) {
      u.shieldRing.rotation.z = t * 0.6;
      u.shieldRing.material.opacity = 0.35 + Math.sin(t * 3) * 0.12;
    }

    // Burn embers
    if ((u.state.burn || 0) > 0 && !u.dying) {
      u.emberT -= dt;
      if (u.emberT <= 0) {
        u.emberT = 0.12;
        const p = this.pointOf(u.ref, 'center');
        p.x += (Math.random() - 0.5) * u.width * 0.6;
        p.y += (Math.random() - 0.5) * u.height * 0.6;
        this.particles.emit(p, { n: 1, color: '#ff7a2f', speed: 0.5, life: 0.7, size: 0.1, up: 2, gravity: -1.2 });
      }
    }

    // Charge orbs orbit the player
    u.orbs.forEach((o, i) => {
      const a = t * 1.8 + (i / Math.max(1, u.orbs.length)) * Math.PI * 2;
      o.position.set(g.position.x + Math.cos(a) * 0.75, g.position.y + 1.0 + Math.sin(a * 2) * 0.15, g.position.z + Math.sin(a) * 0.75);
    });

    // Death
    if (u.dying) {
      u.dieT += dt;
      const k = Math.min(1, u.dieT / 0.6);
      u.inner.scale.setScalar(Math.max(0.001, 1 - k));
      u.inner.rotation.y += dt * 8;
      u.inner.position.y -= k * 0.5;
      if (k >= 1) {
        this.removeUnit(u.ref);
        this.enemyOrder = this.enemyOrder.filter((r) => r !== u.ref);
      }
    }
  }
}

/**
 * Fallback when WebGL is unavailable: no 3D, but the same API so the DOM
 * overlays (HP bars, intents, targeting) still get sensible positions.
 */
export class FlatStage {
  constructor() {
    this.units = new Map();
    this.enemyOrder = [];
    this.insets = { top: 0, bottom: 0 };
    this.speed = 1;
    this.onFrame = null;
    const tick = () => { requestAnimationFrame(tick); this.onFrame?.(); };
    requestAnimationFrame(tick);
  }
  setAct() {}
  setQuality() {}
  setInsets(top, bottom) { this.insets = { top, bottom }; }
  resize() {}
  showTitle() { this.units.clear(); this.enemyOrder = []; }
  showIdle() { this.showTitle(); }
  setupCombat(enemies) {
    this.showTitle();
    this.units.set('P', { width: 1 });
    for (const e of enemies) this.addEnemy(e.ref, e.def);
  }
  addEnemy(ref, def, entrance, slotIndex = null) {
    this.units.set(ref, { width: 1 });
    if (slotIndex !== null && slotIndex < this.enemyOrder.length) this.enemyOrder.splice(slotIndex, 1, ref);
    else this.enemyOrder.push(ref);
  }
  project(ref) {
    const w = window.innerWidth;
    const top = this.insets.top;
    const bottom = window.innerHeight - this.insets.bottom;
    const mid = (top + bottom) / 2;
    if (ref === 'P') return { x: w * 0.18, footY: bottom - 40, headY: mid, halfW: 50 };
    const list = this.enemyOrder.filter((r) => this.units.has(r));
    const i = list.indexOf(ref);
    if (i < 0) return null;
    const x = w * 0.42 + ((i + 0.5) / list.length) * w * 0.52;
    return { x, footY: mid + 40, headY: top + 70, halfW: 44 };
  }
  attack() { return new Promise((r) => setTimeout(r, 120 / this.speed)); }
  die(ref) { this.units.delete(ref); this.enemyOrder = this.enemyOrder.filter((r) => r !== ref); }
  hit() {}
  ring() {}
  shieldUp() {}
  buff() {}
  debuff() {}
  heal() {}
  cast() {}
  burnTick() {}
  explode() {}
  victory() {}
  shake() {}
  setState() {}
}
