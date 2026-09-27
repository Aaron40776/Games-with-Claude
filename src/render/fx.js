// Visual effects: pooled additive particles, projectiles, expanding rings,
// beams and shield bubbles.

import * as THREE from 'three';

const MAX_PARTICLES = 900;

export class Particles {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.size = new Float32Array(MAX_PARTICLES);
    this.alpha = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.p = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0 }));
    this.cursor = 0;
    this.geo = geo;
  }

  setScale(px) { this.points.material.uniforms.uScale.value = px; }

  /**
   * emit(position, { n, color, speed, spread, life, size, gravity, drag, up })
   */
  emit(at, o = {}) {
    const n = o.n ?? 16;
    const color = new THREE.Color(o.color ?? '#ffffff');
    for (let i = 0; i < n; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + (o.up ?? 0), Math.random() - 0.5).normalize();
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      p.x = at.x + (Math.random() - 0.5) * (o.spread ?? 0.1);
      p.y = at.y + (Math.random() - 0.5) * (o.spread ?? 0.1);
      p.z = at.z + (Math.random() - 0.5) * (o.spread ?? 0.1);
      p.vx = dir.x * sp;
      p.vy = dir.y * sp;
      p.vz = dir.z * sp;
      p.life = p.max = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      p.size = (o.size ?? 0.12) * (0.6 + Math.random() * 0.8);
      p.g = o.gravity ?? 0;
      p.drag = o.drag ?? 2;
      p.r = color.r;
      p.gc = color.g;
      p.b = color.b;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy = p.vy * k - p.g * dt;
        p.vz *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const t = Math.max(0, p.life / p.max);
        this.pos[i * 3] = p.x;
        this.pos[i * 3 + 1] = p.y;
        this.pos[i * 3 + 2] = p.z;
        this.col[i * 3] = p.r;
        this.col[i * 3 + 1] = p.gc;
        this.col[i * 3 + 2] = p.b;
        this.size[i] = p.size * (0.4 + t * 0.6);
        this.alpha[i] = t;
      } else if (this.alpha[i] !== 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
      }
    }
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

/** Short-lived meshes with an update function; removed when done. */
export class Transients {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  add(obj, dur, update, onDone) {
    this.scene.add(obj);
    this.list.push({ obj, t: 0, dur, update, onDone });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update?.(k, dt, it.obj);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.list.splice(i, 1);
        it.onDone?.();
      }
    }
  }
}

const ringGeos = new Map();
const ringGeo = (inner) => {
  if (!ringGeos.has(inner)) ringGeos.set(inner, new THREE.RingGeometry(inner, 1, 6));
  return ringGeos.get(inner);
};
const hexGeo = new THREE.IcosahedronGeometry(1, 1);

export function makeRing(color, opacity = 0.9, inner = 0.85) {
  const mesh = new THREE.Mesh(ringGeo(inner).clone(), new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function makeBubble(color) {
  return new THREE.Mesh(hexGeo.clone(), new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.4), wireframe: true, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
}

export function makeOrb(color, r = 0.12) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), toneMapped: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 10, 8), new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  return g;
}

export function makeBeam(a, b, color, width = 0.06) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(width, width, len, 6, 1, true), new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  }));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}
