// Procedural low-poly models built from primitives. Each builder returns
// { root, height, width, glow, update(t, dt, u) }. Models face +x.

import * as THREE from 'three';

const DARK = 0x1b2036;
const DARK2 = 0x262d4a;

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: opts.metal ?? 0.35, roughness: opts.rough ?? 0.55, flatShading: true,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
    transparent: !!opts.opacity, opacity: opts.opacity ?? 1,
  });
}
function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}
function m(geo, mat, x = 0, y = 0, z = 0, parent = null) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (parent) parent.add(mesh);
  return mesh;
}
const col = (c) => new THREE.Color(c);
/** Bright version of a color for emissive parts (goes past 1 so bloom catches it). */
const hot = (c, k = 2.2) => col(c).multiplyScalar(k);

// ------------------------------------------------------------ player ----

export function buildPlayer() {
  const root = new THREE.Group();
  const body = std(0x34406a, { metal: 0.45, rough: 0.5 });
  const trim = std(0x56639a, { metal: 0.55, rough: 0.45 });
  const visor = glow(hot('#36c9f0', 2.6));
  const legL = m(new THREE.BoxGeometry(0.17, 0.72, 0.2), body, 0, 0.36, -0.13, root);
  const legR = m(new THREE.BoxGeometry(0.17, 0.72, 0.2), body, 0, 0.36, 0.13, root);
  m(new THREE.BoxGeometry(0.3, 0.16, 0.44), trim, 0, 0.78, 0, root);
  const torso = m(new THREE.CylinderGeometry(0.3, 0.2, 0.64, 5), body, 0, 1.16, 0, root);
  torso.rotation.y = Math.PI / 5;
  m(new THREE.BoxGeometry(0.04, 0.34, 0.08), visor, 0.24, 1.18, 0, root);
  const head = new THREE.Group();
  head.position.set(0, 1.63, 0);
  root.add(head);
  m(new THREE.IcosahedronGeometry(0.19, 0), trim, 0, 0, 0, head);
  m(new THREE.BoxGeometry(0.1, 0.07, 0.26), visor, 0.14, 0.01, 0, head);
  // shoulders + gun arm
  m(new THREE.OctahedronGeometry(0.14, 0), trim, 0, 1.42, -0.32, root);
  m(new THREE.OctahedronGeometry(0.14, 0), trim, 0, 1.42, 0.32, root);
  const arm = new THREE.Group();
  arm.position.set(0.05, 1.3, 0.34);
  root.add(arm);
  m(new THREE.BoxGeometry(0.12, 0.36, 0.12), body, 0, -0.16, 0, arm);
  const gun = m(new THREE.BoxGeometry(0.56, 0.12, 0.12), trim, 0.26, -0.3, 0, arm);
  m(new THREE.BoxGeometry(0.08, 0.06, 0.06), visor, 0.56, -0.3, 0, arm);
  gun.userData.muzzle = true;
  // scarf / trailing strip
  const scarf = m(new THREE.BoxGeometry(0.5, 0.05, 0.14), std(0x36c9f0, { emissive: 0x0d4b5c }), -0.3, 1.42, 0, root);
  scarf.rotation.z = 0.35;
  // drone companion
  const drone = new THREE.Group();
  root.add(drone);
  m(new THREE.OctahedronGeometry(0.11, 0), std(0x3a4470, { metal: 0.7 }), 0, 0, 0, drone);
  m(new THREE.SphereGeometry(0.045, 8, 6), glow(hot('#36c9f0', 3)), 0.08, 0, 0, drone);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.65, 1.0, 0.34);
  root.add(muzzle);
  return {
    root, height: 1.85, width: 0.9, glow: '#36c9f0', muzzle,
    update(t) {
      head.rotation.y = Math.sin(t * 0.7) * 0.15;
      scarf.rotation.y = Math.sin(t * 2.1) * 0.25;
      drone.position.set(Math.cos(t * 1.3) * 0.6, 2.0 + Math.sin(t * 2.2) * 0.08, Math.sin(t * 1.3) * 0.6);
      drone.rotation.y = t * 2;
      legL.rotation.z = Math.sin(t * 1.5) * 0.02;
      legR.rotation.z = -Math.sin(t * 1.5) * 0.02;
    },
  };
}

// ----------------------------------------------------------- enemies ----

function crystals(g) {
  const root = new THREE.Group();
  const c = g.glow;
  const mats = [std(DARK2, { emissive: col(c).multiplyScalar(0.25) }), std(0x2b3558, { emissive: col(c).multiplyScalar(0.4) })];
  const spec = [[0, 0.5, 0, 0.42, 1.6], [0.25, 0.35, 0.2, 0.26, 1.4], [-0.22, 0.3, -0.2, 0.24, 1.5], [0.1, 0.25, -0.3, 0.2, 1.2], [-0.25, 0.28, 0.25, 0.18, 1.3]];
  const parts = spec.map(([x, y, z, r, s], i) => {
    const mesh = m(new THREE.OctahedronGeometry(r, 0), mats[i % 2], x, y, z, root);
    mesh.scale.y = s;
    mesh.rotation.z = (i - 2) * 0.2;
    return mesh;
  });
  m(new THREE.OctahedronGeometry(0.14, 0), glow(hot(c, 2.5)), 0, 0.55, 0, root);
  return {
    root, height: 1.15, width: 0.9,
    update(t) { parts.forEach((p, i) => { p.rotation.y = t * (0.3 + i * 0.1); }); },
  };
}

function drone(g) {
  const root = new THREE.Group();
  const hover = new THREE.Group();
  hover.position.y = 1.0;
  root.add(hover);
  m(new THREE.IcosahedronGeometry(0.32, 1), std(DARK2, { metal: 0.7 }), 0, 0, 0, hover);
  m(new THREE.SphereGeometry(0.1, 10, 8), glow(hot(g.glow, 3)), 0.28, 0.02, 0, hover);
  const ring = m(new THREE.TorusGeometry(0.5, 0.05, 6, 20), std(0x3a4470, { metal: 0.8 }), 0, 0, 0, hover);
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const fin = m(new THREE.ConeGeometry(0.08, 0.35, 4), std(DARK), 0, 0, 0, hover);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.4, -0.25, Math.sin(a) * 0.4);
    fin.rotation.x = Math.PI;
  }
  return {
    root, height: 1.45, width: 1.0,
    update(t) {
      hover.position.y = 1.0 + Math.sin(t * 2.3) * 0.08;
      ring.rotation.z = t * 1.5;
    },
  };
}

function leech(g) {
  const root = new THREE.Group();
  const segs = [];
  const mat = std(0x3a1f38, { emissive: col(g.glow).multiplyScalar(0.12) });
  for (let i = 0; i < 7; i++) {
    const r = 0.32 - i * 0.03;
    segs.push(m(new THREE.IcosahedronGeometry(r, 0), mat, -i * 0.3, r, 0, root));
  }
  const mouth = m(new THREE.TorusGeometry(0.16, 0.05, 6, 12), glow(hot(g.glow, 2.4)), 0.3, 0.45, 0, root);
  mouth.rotation.y = Math.PI / 2;
  return {
    root, height: 1.05, width: 1.5,
    update(t) {
      segs.forEach((s, i) => {
        s.position.y = 0.3 + Math.max(0, Math.sin(t * 2 - i * 0.7)) * 0.35 * (1 - i / 8);
        s.position.z = Math.sin(t * 1.4 - i * 0.6) * 0.12;
      });
      mouth.position.y = segs[0].position.y + 0.15;
    },
  };
}

function wisp(g) {
  const root = new THREE.Group();
  const core = m(new THREE.IcosahedronGeometry(0.24, 1), glow(hot(g.glow, 2.6)), 0, 1.1, 0, root);
  const shell = m(new THREE.IcosahedronGeometry(0.46, 0), new THREE.MeshBasicMaterial({ color: g.glow, wireframe: true, transparent: true, opacity: 0.5 }), 0, 1.1, 0, root);
  const orbit = [];
  for (let i = 0; i < 4; i++) orbit.push(m(new THREE.TetrahedronGeometry(0.08), glow(hot(g.glow, 1.8)), 0, 1.1, 0, root));
  return {
    root, height: 1.6, width: 0.9,
    update(t) {
      const y = 1.1 + Math.sin(t * 1.9) * 0.12;
      core.position.y = y;
      shell.position.y = y;
      shell.rotation.set(t * 0.7, t * 0.5, 0);
      core.scale.setScalar(1 + Math.sin(t * 7) * 0.08);
      orbit.forEach((o, i) => {
        const a = t * 2 + (i * Math.PI) / 2;
        o.position.set(Math.cos(a) * 0.6, y + Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.6);
      });
    },
  };
}

function crawler(g) {
  const root = new THREE.Group();
  const body = m(new THREE.DodecahedronGeometry(0.42, 0), std(0x2a1a14, { emissive: col(g.glow).multiplyScalar(0.18) }), 0, 0.42, 0, root);
  body.scale.set(1.4, 0.7, 1);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const leg = m(new THREE.CylinderGeometry(0.03, 0.02, 0.6, 4), std(DARK), (i % 3 - 1) * 0.3, 0.25, side * 0.4, root);
    leg.rotation.x = side * 0.9;
    legs.push(leg);
  }
  for (let i = 0; i < 4; i++) m(new THREE.SphereGeometry(0.06, 6, 4), glow(hot(g.glow, 2.4)), -0.2 + i * 0.15, 0.68, (i % 2 ? 1 : -1) * 0.12, root);
  m(new THREE.SphereGeometry(0.06, 6, 4), glow(hot('#ffe066', 3)), 0.55, 0.48, 0.1, root);
  m(new THREE.SphereGeometry(0.06, 6, 4), glow(hot('#ffe066', 3)), 0.55, 0.48, -0.1, root);
  return {
    root, height: 0.95, width: 1.4,
    update(t) {
      legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 6 + i) * 0.25; });
      body.position.y = 0.42 + Math.sin(t * 6) * 0.02;
    },
  };
}

function golem(g, { scale = 1, spikes = false, core = true } = {}) {
  const root = new THREE.Group();
  const s = scale;
  const body = std(0x252b40, { metal: 0.6 });
  const plate = std(0x343d60, { metal: 0.7 });
  const eye = glow(hot(g.glow, 2.8));
  m(new THREE.BoxGeometry(0.35 * s, 0.9 * s, 0.3 * s), body, 0, 0.45 * s, -0.3 * s, root);
  m(new THREE.BoxGeometry(0.35 * s, 0.9 * s, 0.3 * s), body, 0, 0.45 * s, 0.3 * s, root);
  const torso = m(new THREE.BoxGeometry(0.8 * s, 0.95 * s, 1.15 * s), plate, 0, 1.35 * s, 0, root);
  torso.rotation.z = -0.08;
  if (core) m(new THREE.OctahedronGeometry(0.16 * s, 0), eye, 0.42 * s, 1.4 * s, 0, root);
  const head = m(new THREE.BoxGeometry(0.42 * s, 0.34 * s, 0.4 * s), body, 0.1 * s, 2.0 * s, 0, root);
  m(new THREE.BoxGeometry(0.06 * s, 0.07 * s, 0.3 * s), eye, 0.32 * s, 2.02 * s, 0, root);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(0.05 * s, 1.7 * s, -0.78 * s);
  armR.position.set(0.05 * s, 1.7 * s, 0.78 * s);
  root.add(armL, armR);
  for (const arm of [armL, armR]) {
    m(new THREE.BoxGeometry(0.42 * s, 0.42 * s, 0.42 * s), plate, 0, 0, 0, arm);
    m(new THREE.BoxGeometry(0.34 * s, 0.9 * s, 0.34 * s), body, 0.05 * s, -0.6 * s, 0, arm);
    m(new THREE.BoxGeometry(0.45 * s, 0.4 * s, 0.45 * s), plate, 0.1 * s, -1.1 * s, 0, arm);
    if (spikes) {
      const sp = m(new THREE.ConeGeometry(0.12 * s, 0.5 * s, 4), std(0x3a2030, { emissive: col(g.glow).multiplyScalar(0.3) }), 0, 0.35 * s, 0, arm);
      sp.rotation.x = arm === armL ? -0.4 : 0.4;
    }
  }
  return {
    root, height: 2.3 * s, width: 1.7 * s,
    update(t) {
      armL.rotation.z = Math.sin(t * 1.1) * 0.08;
      armR.rotation.z = -Math.sin(t * 1.1) * 0.08;
      head.rotation.y = Math.sin(t * 0.6) * 0.2;
    },
  };
}

function sentry(g) {
  const root = new THREE.Group();
  m(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 6), std(DARK2), 0, 0.15, 0, root);
  m(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 6), std(0x2b3350, { metal: 0.7 }), 0, 0.85, 0, root);
  const eye = m(new THREE.OctahedronGeometry(0.28, 0), std(0x2b3350, { emissive: col(g.glow).multiplyScalar(0.5) }), 0, 1.6, 0, root);
  m(new THREE.SphereGeometry(0.1, 8, 6), glow(hot(g.glow, 3)), 0.22, 1.6, 0, root);
  const ring = m(new THREE.TorusGeometry(0.42, 0.03, 4, 24), glow(hot(g.glow, 1.6)), 0, 1.6, 0, root);
  return {
    root, height: 2.0, width: 0.95,
    update(t) {
      eye.rotation.y = t * 0.8;
      ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.4, t, 0);
    },
  };
}

function beast(g, { scale = 1, spikes = false, legs = 4 } = {}) {
  const root = new THREE.Group();
  const s = scale;
  const body = std(0x221c36, { emissive: col(g.glow).multiplyScalar(0.08) });
  const torso = m(new THREE.BoxGeometry(1.1 * s, 0.45 * s, 0.5 * s), body, 0, 0.7 * s, 0, root);
  const head = new THREE.Group();
  head.position.set(0.65 * s, 0.85 * s, 0);
  root.add(head);
  m(new THREE.BoxGeometry(0.42 * s, 0.3 * s, 0.34 * s), body, 0, 0, 0, head);
  m(new THREE.ConeGeometry(0.12 * s, 0.34 * s, 4), body, 0.28 * s, -0.04 * s, 0, head).rotation.z = -Math.PI / 2;
  m(new THREE.SphereGeometry(0.045 * s, 6, 4), glow(hot(g.glow, 3)), 0.18 * s, 0.06 * s, 0.1 * s, head);
  m(new THREE.SphereGeometry(0.045 * s, 6, 4), glow(hot(g.glow, 3)), 0.18 * s, 0.06 * s, -0.1 * s, head);
  const legList = [];
  for (let i = 0; i < legs; i++) {
    const x = legs === 4 ? (i < 2 ? 0.38 : -0.38) * s : (-0.45 + (i % (legs / 2)) * (0.9 / (legs / 2 - 1))) * s;
    const z = (i % 2 ? 0.2 : -0.2) * s * (legs === 4 ? 1 : 1.4);
    const leg = m(new THREE.BoxGeometry(0.12 * s, 0.6 * s, 0.12 * s), body, x, 0.3 * s, legs === 4 ? z : (i < legs / 2 ? -0.3 : 0.3) * s, root);
    legList.push(leg);
  }
  const tail = m(new THREE.ConeGeometry(0.08 * s, 0.6 * s, 4), body, -0.75 * s, 0.85 * s, 0, root);
  tail.rotation.z = Math.PI / 2 + 0.5;
  if (spikes) {
    for (let i = 0; i < 5; i++) {
      const sp = m(new THREE.ConeGeometry(0.1 * s, 0.45 * s, 4), std(0x2b3558, { emissive: col(g.glow).multiplyScalar(0.5) }), (-0.4 + i * 0.2) * s, 1.05 * s, 0, root);
      sp.rotation.z = -0.3;
    }
  }
  return {
    root, height: 1.25 * s, width: 1.5 * s,
    update(t) {
      legList.forEach((l, i) => { l.rotation.z = Math.sin(t * 3 + i * 1.7) * 0.12; });
      head.rotation.z = Math.sin(t * 1.3) * 0.08;
      tail.rotation.y = Math.sin(t * 2.5) * 0.5;
      torso.position.y = 0.7 * s + Math.sin(t * 3) * 0.015 * s;
    },
  };
}

function gatekeeper(g) {
  const root = new THREE.Group();
  const ring = m(new THREE.TorusGeometry(1.35, 0.2, 6, 6), std(0x2b3350, { metal: 0.8 }), 0, 1.75, 0, root);
  ring.rotation.y = Math.PI / 2;
  const inner = m(new THREE.TorusGeometry(1.05, 0.04, 4, 32), glow(hot(g.glow, 1.3)), 0, 1.75, 0, root);
  inner.rotation.y = Math.PI / 2;
  const core = m(new THREE.IcosahedronGeometry(0.34, 1), glow(hot(g.glow, 1.25)), 0, 1.75, 0, root);
  const shellMat = new THREE.MeshBasicMaterial({ color: g.glow, wireframe: true, transparent: true, opacity: 0.22 });
  const shell = m(new THREE.IcosahedronGeometry(0.7, 0), shellMat, 0, 1.75, 0, root);
  for (const z of [-1.45, 1.45]) {
    m(new THREE.BoxGeometry(0.5, 2.4, 0.5), std(DARK2, { metal: 0.6 }), 0, 1.2, z, root);
    m(new THREE.OctahedronGeometry(0.22, 0), glow(hot(g.glow, 2)), 0, 2.6, z, root);
  }
  const runes = [];
  for (let i = 0; i < 6; i++) runes.push(m(new THREE.BoxGeometry(0.12, 0.3, 0.12), glow(hot(g.glow, 1.2)), 0, 0, 0, root));
  return {
    root, height: 3.2, width: 3.0,
    update(t) {
      ring.rotation.x = t * 0.2;
      shell.rotation.set(t * 0.4, t * 0.3, 0);
      core.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      runes.forEach((r, i) => {
        const a = t * 0.6 + (i / 6) * Math.PI * 2;
        r.position.set(0, 1.75 + Math.sin(a) * 1.35, Math.cos(a) * 1.35);
        r.rotation.x = -a;
      });
    },
  };
}

function mine(g) {
  const root = new THREE.Group();
  const hover = new THREE.Group();
  hover.position.y = 0.8;
  root.add(hover);
  m(new THREE.IcosahedronGeometry(0.34, 0), std(0x2a2230, { metal: 0.7 }), 0, 0, 0, hover);
  const ico = new THREE.IcosahedronGeometry(0.34, 0);
  const pos = ico.attributes.position;
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const key = v.toArray().map((x) => x.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const spike = m(new THREE.ConeGeometry(0.06, 0.28, 4), std(0x3a3040), 0, 0, 0, hover);
    spike.position.copy(v.clone().multiplyScalar(1.25));
    spike.lookAt(v.clone().multiplyScalar(3));
    spike.rotateX(Math.PI / 2);
  }
  const light = m(new THREE.SphereGeometry(0.12, 8, 6), glow(hot(g.glow, 3)), 0, 0, 0, hover);
  return {
    root, height: 1.3, width: 0.9,
    update(t, dt, u) {
      hover.rotation.y = t * 0.8;
      hover.position.y = 0.8 + Math.sin(t * 2) * 0.06;
      const rate = u?.countdown ? 2 + (4 - u.countdown) * 3 : 3;
      light.visible = Math.sin(t * rate) > -0.2;
    },
  };
}

function robed(g, { scale = 1, crown = false } = {}) {
  const root = new THREE.Group();
  const s = scale;
  const robe = m(new THREE.ConeGeometry(0.55 * s, 1.5 * s, 6), std(0x2a1d38, { emissive: col(g.glow).multiplyScalar(0.06) }), 0, 0.75 * s, 0, root);
  robe.rotation.y = Math.PI / 6;
  const head = m(new THREE.OctahedronGeometry(0.22 * s, 0), std(0x3a2d50, { emissive: col(g.glow).multiplyScalar(0.3) }), 0, 1.85 * s, 0, root);
  m(new THREE.SphereGeometry(0.06 * s, 6, 4), glow(hot(g.glow, 3)), 0.18 * s, 1.87 * s, 0, root);
  const halo = m(new THREE.TorusGeometry(0.34 * s, 0.025 * s, 4, 24), glow(hot(g.glow, 2)), -0.05 * s, 2.15 * s, 0, root);
  halo.rotation.x = Math.PI / 2;
  const staff = m(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 1.9 * s, 5), std(DARK), 0.3 * s, 1.0 * s, 0.45 * s, root);
  const orb = m(new THREE.OctahedronGeometry(0.1 * s, 0), glow(hot(g.glow, 2.5)), 0.3 * s, 2.0 * s, 0.45 * s, root);
  const extra = [];
  if (crown) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const sp = m(new THREE.ConeGeometry(0.05 * s, 0.3 * s, 4), glow(hot(g.glow, 2)), Math.cos(a) * 0.3 * s, 2.35 * s, Math.sin(a) * 0.3 * s, root);
      extra.push(sp);
    }
    for (let k = 0; k < 2; k++) {
      const r = m(new THREE.TorusGeometry((0.85 + k * 0.25) * s, 0.02 * s, 4, 40), glow(hot(g.glow, 1.4), 0.7), 0, 1.2 * s, 0, root);
      extra.push(r);
    }
  }
  return {
    root, height: 2.4 * s, width: 1.1 * s,
    update(t) {
      head.position.y = 1.85 * s + Math.sin(t * 1.6) * 0.05 * s;
      halo.rotation.z = t;
      orb.rotation.y = t * 2;
      staff.rotation.z = Math.sin(t) * 0.05;
      if (crown) {
        extra[7].rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.3, t * 0.4, 0);
        extra[8].rotation.set(Math.PI / 2 + Math.cos(t * 0.5) * 0.4, -t * 0.3, 0);
      }
    },
  };
}

function eel(g, { scale = 1, big = false } = {}) {
  const root = new THREE.Group();
  const s = scale;
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.9) * 0.35 * s, i * 0.26 * s, Math.cos(i * 0.7) * 0.2 * s));
  const curve = new THREE.CatmullRomCurve3(pts);
  const bodyMat = std(0x16323a, { emissive: col(g.glow).multiplyScalar(0.12) });
  const tube = m(new THREE.TubeGeometry(curve, 40, 0.18 * s, 6, false), bodyMat, 0, 0, 0, root);
  const top = pts[pts.length - 1];
  const head = new THREE.Group();
  head.position.copy(top);
  root.add(head);
  m(new THREE.ConeGeometry(0.26 * s, 0.7 * s, 5), bodyMat, 0.25 * s, 0, 0, head).rotation.z = -Math.PI / 2;
  m(new THREE.SphereGeometry(0.06 * s, 6, 4), glow(hot(g.glow, 3)), 0.28 * s, 0.12 * s, 0.12 * s, head);
  m(new THREE.SphereGeometry(0.06 * s, 6, 4), glow(hot(g.glow, 3)), 0.28 * s, 0.12 * s, -0.12 * s, head);
  const fins = [];
  for (let i = 1; i < 7; i++) {
    const fin = m(new THREE.ConeGeometry(0.1 * s, 0.35 * s, 3), glow(hot(g.glow, 1.4), 0.8), 0, 0, 0, root);
    fin.position.copy(curve.getPoint(i / 8)).add(new THREE.Vector3(-0.15 * s, 0, 0));
    fin.rotation.z = Math.PI / 2;
    fins.push(fin);
  }
  if (big) {
    for (let i = 0; i < 3; i++) {
      const coil = m(new THREE.TorusGeometry(0.9 * s - i * 0.1, 0.16 * s, 6, 16, Math.PI * 1.2), bodyMat, -0.8 * s + i * 0.6, 0.1, (i - 1) * 0.9, root);
      coil.rotation.set(0, Math.PI / 2, 0);
    }
  }
  return {
    root, height: 2.35 * s, width: (big ? 2.4 : 1.1) * s,
    update(t) {
      tube.rotation.y = Math.sin(t * 0.8) * 0.2;
      head.rotation.z = Math.sin(t * 1.2) * 0.15;
      head.position.x = top.x + Math.sin(t * 0.8) * 0.1;
      fins.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 4 + i) * 0.25; });
    },
  };
}

function shade(g) {
  const root = new THREE.Group();
  const glass = std(0x9fd8ff, { opacity: 0.42, metal: 0.9, rough: 0.1, emissive: col(g.glow).multiplyScalar(0.2) });
  const shards = [];
  const spec = [[0, 0.5, 0, 0.3, 2.2], [0, 1.35, 0, 0.36, 1.2], [0, 1.85, 0, 0.2, 1.3], [0, 1.35, 0.45, 0.16, 2], [0, 1.35, -0.45, 0.16, 2]];
  for (const [x, y, z, r, sy] of spec) {
    const sh = m(new THREE.OctahedronGeometry(r, 0), glass, x, y, z, root);
    sh.scale.y = sy;
    shards.push(sh);
  }
  const mirror = m(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshBasicMaterial({ color: g.glow, transparent: true, opacity: 0.12, side: THREE.DoubleSide }), -0.3, 1.2, 0, root);
  mirror.rotation.y = Math.PI / 2;
  m(new THREE.SphereGeometry(0.05, 6, 4), glow(hot(g.glow, 3)), 0.15, 1.9, 0, root);
  return {
    root, height: 2.15, width: 1.0,
    update(t) {
      shards.forEach((s, i) => { s.rotation.y = t * (0.4 + i * 0.15); });
      mirror.material.opacity = 0.08 + Math.sin(t * 2) * 0.05;
    },
  };
}

function knight(g, { halo = false } = {}) {
  const root = new THREE.Group();
  const armor = std(0x262c48, { metal: 0.8, rough: 0.35 });
  const dark = std(0x171b2d);
  m(new THREE.BoxGeometry(0.22, 0.95, 0.24), dark, 0, 0.48, -0.18, root);
  m(new THREE.BoxGeometry(0.22, 0.95, 0.24), dark, 0, 0.48, 0.18, root);
  const torso = m(new THREE.CylinderGeometry(0.42, 0.3, 0.85, 6), armor, 0, 1.35, 0, root);
  torso.rotation.y = Math.PI / 6;
  m(new THREE.ConeGeometry(0.28, 0.35, 4), armor, 0, 1.85, -0.5, root).rotation.x = -0.6;
  m(new THREE.ConeGeometry(0.28, 0.35, 4), armor, 0, 1.85, 0.5, root).rotation.x = 0.6;
  const helm = m(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 6), armor, 0, 2.05, 0, root);
  m(new THREE.BoxGeometry(0.05, 0.05, 0.26), glow(hot(g.glow, 3)), 0.2, 2.07, 0, root);
  const blade = new THREE.Group();
  blade.position.set(0.3, 1.2, 0.55);
  root.add(blade);
  m(new THREE.BoxGeometry(0.08, 0.3, 0.08), dark, 0, 0, 0, blade);
  m(new THREE.BoxGeometry(0.3, 0.06, 0.06), armor, 0, 0.16, 0, blade);
  m(new THREE.BoxGeometry(0.1, 1.5, 0.03), std(0x303a60, { metal: 0.9, emissive: col(g.glow).multiplyScalar(0.5) }), 0, 0.95, 0, blade);
  m(new THREE.BoxGeometry(0.02, 1.4, 0.04), glow(hot(g.glow, 2.2)), 0.06, 0.95, 0, blade);
  let ring = null;
  if (halo) {
    ring = m(new THREE.TorusGeometry(0.45, 0.03, 4, 24), glow(hot(g.glow, 2)), -0.1, 2.35, 0, root);
    ring.rotation.y = Math.PI / 2;
    const disc = m(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 8), std(0x2b3558, { metal: 0.8, emissive: col(g.glow).multiplyScalar(0.25) }), 0.2, 1.3, -0.62, root);
    disc.rotation.x = Math.PI / 2;
  }
  return {
    root, height: 2.35, width: 1.2,
    update(t) {
      blade.rotation.z = -0.3 + Math.sin(t * 1.2) * 0.06;
      helm.rotation.y = Math.sin(t * 0.5) * 0.15;
      if (ring) ring.rotation.x = t;
    },
  };
}

function seraph(g) {
  const root = new THREE.Group();
  const hover = new THREE.Group();
  hover.position.y = 1.2;
  root.add(hover);
  m(new THREE.OctahedronGeometry(0.36, 0), std(0x33304a, { metal: 0.8, emissive: col(g.glow).multiplyScalar(0.35) }), 0, 0, 0, hover).scale.y = 1.6;
  m(new THREE.SphereGeometry(0.12, 8, 6), glow(hot(g.glow, 3)), 0.2, 0.15, 0, hover);
  const wings = [];
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const w = m(new THREE.BoxGeometry(0.12, 0.05, 0.9 - i * 0.18), glow(hot(g.glow, 1.3 - i * 0.2), 0.85), -0.15, 0.3 - i * 0.28, side * (0.55 - i * 0.05), hover);
      w.userData = { side, i };
      wings.push(w);
    }
  }
  const halo = m(new THREE.TorusGeometry(0.34, 0.025, 4, 28), glow(hot(g.glow, 2.4)), 0, 0.85, 0, hover);
  halo.rotation.x = Math.PI / 2;
  return {
    root, height: 2.35, width: 1.3,
    update(t) {
      hover.position.y = 1.2 + Math.sin(t * 1.5) * 0.12;
      wings.forEach((w) => { w.rotation.x = w.userData.side * (0.25 + Math.sin(t * 2.5 + w.userData.i) * 0.2); });
      halo.rotation.z = t * 0.8;
    },
  };
}

function sentinel(g) {
  const root = new THREE.Group();
  const mat = std(0x262c48, { metal: 0.7 });
  m(new THREE.BoxGeometry(0.9, 0.5, 0.9), mat, 0, 0.25, 0, root);
  m(new THREE.BoxGeometry(0.6, 1.2, 0.6), mat, 0, 1.1, 0, root);
  const core = m(new THREE.OctahedronGeometry(0.26, 0), glow(hot(g.glow, 2.4)), 0.3, 1.2, 0, root);
  m(new THREE.BoxGeometry(0.5, 0.35, 0.5), mat, 0, 1.9, 0, root);
  m(new THREE.BoxGeometry(0.05, 0.08, 0.36), glow(hot(g.glow, 3)), 0.26, 1.92, 0, root);
  const plates = [];
  for (let i = 0; i < 3; i++) plates.push(m(new THREE.BoxGeometry(0.08, 0.8, 0.5), std(0x343d60, { metal: 0.8, emissive: col(g.glow).multiplyScalar(0.15) }), 0, 1.2, 0, root));
  return {
    root, height: 2.3, width: 1.4,
    update(t) {
      core.rotation.y = t * 2;
      plates.forEach((p, i) => {
        const a = t * 0.8 + (i / 3) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.7, 1.2 + Math.sin(t * 1.5 + i) * 0.1, Math.sin(a) * 0.7);
        p.rotation.y = -a;
      });
    },
  };
}

function mite(g) {
  const root = new THREE.Group();
  const body = m(new THREE.TetrahedronGeometry(0.28, 0), std(0x2a2020, { emissive: col(g.glow).multiplyScalar(0.3) }), 0, 0.35, 0, root);
  m(new THREE.SphereGeometry(0.05, 6, 4), glow(hot(g.glow, 3)), 0.2, 0.4, 0, root);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const leg = m(new THREE.CylinderGeometry(0.02, 0.015, 0.35, 4), std(DARK), (i < 2 ? 0.1 : -0.1), 0.15, (i % 2 ? 0.18 : -0.18), root);
    leg.rotation.x = i % 2 ? 0.7 : -0.7;
    legs.push(leg);
  }
  return {
    root, height: 0.7, width: 0.7,
    update(t) {
      body.rotation.y = t * 1.5;
      body.position.y = 0.35 + Math.abs(Math.sin(t * 5)) * 0.06;
      legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 10 + i) * 0.3; });
    },
  };
}

function weaver(g) {
  const root = new THREE.Group();
  const body = m(new THREE.IcosahedronGeometry(0.34, 0), std(0x2a1d38, { emissive: col(g.glow).multiplyScalar(0.25) }), 0, 1.6, 0, root);
  m(new THREE.SphereGeometry(0.08, 8, 6), glow(hot(g.glow, 3)), 0.28, 1.62, 0, root);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const leg = m(new THREE.CylinderGeometry(0.025, 0.015, 1.9, 4), std(0x3a2d50), Math.cos(a) * 0.55, 0.85, Math.sin(a) * 0.55, root);
    leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    legs.push(leg);
  }
  const threadMat = new THREE.LineBasicMaterial({ color: g.glow, transparent: true, opacity: 0.6 });
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1));
  }
  const threads = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), threadMat);
  root.add(threads);
  return {
    root, height: 2.1, width: 1.5,
    update(t) {
      body.position.y = 1.6 + Math.sin(t * 1.4) * 0.08;
      body.rotation.y = t * 0.6;
      threadMat.opacity = 0.35 + Math.sin(t * 3) * 0.2;
    },
  };
}

function heart(g) {
  const root = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.95, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = 1 + Math.sin(v.x * 5) * 0.08 + Math.cos(v.y * 4) * 0.08;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y * 1.2, v.z);
  }
  geo.computeVertexNormals();
  const core = m(geo, std(0x3a0f1e, { emissive: col(g.glow).multiplyScalar(0.55), metal: 0.5, rough: 0.3 }), 0, 1.9, 0, root);
  const veins = m(geo, new THREE.MeshBasicMaterial({ color: hot(g.glow, 1.6), wireframe: true, transparent: true, opacity: 0.55, toneMapped: false }), 0, 1.9, 0, root);
  veins.scale.setScalar(1.02);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Group();
    ring.position.y = 1.9;
    root.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sh = m(new THREE.OctahedronGeometry(0.1 + (i % 3) * 0.04, 0), std(0x2b3558, { emissive: col(g.glow).multiplyScalar(0.4) }), Math.cos(a) * (1.5 + k * 0.35), 0, Math.sin(a) * (1.5 + k * 0.35), ring);
      sh.scale.y = 1.8;
    }
    ring.rotation.x = 0.5 + k * 0.5;
    rings.push(ring);
  }
  for (const z of [-1.3, 1.3]) {
    const pillar = m(new THREE.ConeGeometry(0.3, 2.2, 5), std(0x1f1a2e), 0, 1.1, z, root);
    pillar.rotation.x = z > 0 ? 0.25 : -0.25;
  }
  return {
    root, height: 3.4, width: 3.2,
    update(t) {
      const beat = 1 + Math.max(0, Math.sin(t * 3.2)) ** 6 * 0.08;
      core.scale.setScalar(beat);
      veins.scale.setScalar(beat * 1.02);
      core.rotation.y = t * 0.15;
      veins.rotation.y = t * 0.15;
      rings.forEach((r, i) => { r.rotation.y = t * (0.25 + i * 0.12) * (i % 2 ? -1 : 1); });
    },
  };
}

// ------------------------------------------------------------ registry ---

const GLOW = {
  shardling: '#4fe3ff', drone: '#ffb347', leech: '#ff4f9a', wisp: '#9ff0ff', crawler: '#ff7a2f',
  warden: '#ff3b4f', sentry: '#36c9f0', brood: '#c07bff', gatekeeper: '#4fe3ff',
  hound: '#b98cff', mine: '#ff3b4f', cultist: '#ffb347', eel: '#5be39b', shade: '#bfe8ff',
  knight: '#8f5bff', mother: '#ff4f9a', seraph: '#ffe6a8', leviathan: '#4fb8ff',
  sentinel: '#ff3b4f', mite: '#ffb347', hulk: '#ff7a2f', weaver: '#c38bff',
  sovereign: '#ffc84a', archon: '#9ff0ff', colossus: '#ff3b4f', heart: '#ff2f5a',
};

const BUILDERS = {
  shardling: crystals,
  drone,
  leech,
  wisp,
  crawler,
  warden: (g) => golem(g, { scale: 1 }),
  sentry,
  brood: (g) => beast(g, { scale: 1.3, spikes: true, legs: 8 }),
  gatekeeper,
  hound: (g) => beast(g, { scale: 1 }),
  mine,
  cultist: (g) => robed(g, { scale: 0.9 }),
  eel: (g) => eel(g, { scale: 0.9 }),
  shade,
  knight: (g) => knight(g),
  mother: (g) => beast(g, { scale: 1.8, spikes: true }),
  seraph,
  leviathan: (g) => eel(g, { scale: 1.45, big: true }),
  sentinel,
  mite,
  hulk: (g) => golem(g, { scale: 1.2, spikes: true }),
  weaver,
  sovereign: (g) => robed(g, { scale: 1.15, crown: true }),
  archon: (g) => knight(g, { halo: true }),
  colossus: (g) => golem(g, { scale: 1.5, spikes: true }),
  heart,
};

/** Build an enemy model from its definition ({ model, tint, size }). */
export function buildEnemy(def) {
  const glowColor = def.tint || GLOW[def.model] || '#ff4f6e';
  const built = (BUILDERS[def.model] || crystals)({ glow: glowColor });
  const size = def.size || 1;
  built.root.scale.setScalar(size);
  built.height *= size;
  built.width *= size;
  built.glow = glowColor;
  return built;
}
