// Shared helpers: math, random, low-poly geometry builder.
(function () {
  const WR = (window.WR = window.WR || {});
  const TAU = Math.PI * 2;

  WR.TAU = TAU;
  WR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  WR.lerp = (a, b, t) => a + (b - a) * t;
  WR.rand = (a, b) => a + Math.random() * (b - a);
  WR.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  WR.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  WR.chance = (p) => Math.random() < p;
  WR.damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
  WR.weighted = (table) => {
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) {
      r -= table[k];
      if (r <= 0) return k;
    }
    return Object.keys(table)[0];
  };

  // Deterministic RNG (mulberry32) for daily missions etc.
  WR.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  WR.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  // Build a transform matrix (rotation order XYZ: z tilt applied first, then yaw).
  WR.mat = function (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  };
  // base * local transform
  WR.sub = function (base, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return base.clone().multiply(WR.mat(x, y, z, rx, ry, rz, sx, sy, sz));
  };

  // Turn any geometry into a flat-shaded, non-indexed one.
  function flat(g) {
    if (g.index) g = g.toNonIndexed();
    if (g.attributes.uv) g.deleteAttribute('uv');
    g.computeVertexNormals();
    return g;
  }
  WR.flat = flat;

  // Push vertices around randomly (consistently for shared corners) to get rocky shapes.
  function jitter(g, amt, seed) {
    const rnd = WR.seeded(seed);
    const pos = g.attributes.position;
    const map = {};
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
      if (!map[k]) map[k] = [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt];
      const d = map[k];
      pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
    }
    return g;
  }

  // Drooping palm frond, spine along +x, width along z.
  function frondGeo() {
    const N = 7;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = -0.55 * t * t;
      const w = 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)) + 0.015;
      pts.push({ c: [t, y + 0.04, 0], l: [t, y - 0.05, -w], r: [t, y - 0.05, w] });
    }
    const v = [];
    const tri = (a, b, c) => v.push(...a, ...b, ...c);
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1];
      tri(a.c, a.l, b.l); tri(a.c, b.l, b.c);
      tri(a.c, b.r, a.r); tri(a.c, b.c, b.r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }

  // Simple boat hull: deck outline with pointed bow, extruded downward.
  function hullGeo() {
    const s = new THREE.Shape();
    s.moveTo(-1.2, -2.6);
    s.lineTo(1.2, -2.6);
    s.lineTo(1.25, 1.0);
    s.quadraticCurveTo(1.0, 2.3, 0, 3.1);
    s.quadraticCurveTo(-1.0, 2.3, -1.25, 1.0);
    s.lineTo(-1.2, -2.6);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: false, curveSegments: 3 });
    g.rotateX(Math.PI / 2);
    return flat(g);
  }

  WR.G = {
    box: flat(new THREE.BoxGeometry(1, 1, 1)),
    cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6)),
    cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8)),
    cyl12: flat(new THREE.CylinderGeometry(1, 1, 1, 12)),
    trunkSeg: flat(new THREE.CylinderGeometry(0.72, 1, 1, 6)),
    cone4: flat(new THREE.ConeGeometry(1, 1, 4)),
    cone5: flat(new THREE.ConeGeometry(1, 1, 5)),
    cone3: flat(new THREE.ConeGeometry(1, 1, 3)),
    ico: flat(new THREE.IcosahedronGeometry(1, 0)),
    dodec: flat(new THREE.DodecahedronGeometry(1, 0)),
    rocks: [1, 2, 3, 4, 5, 6].map((s) => flat(jitter(new THREE.IcosahedronGeometry(1, 1), 0.55, s * 977))),
    blobs: [1, 2, 3].map((s) => flat(jitter(new THREE.IcosahedronGeometry(1, 0), 0.4, s * 131))),
    halfSphere: flat(new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI / 2)),
    sphere: flat(new THREE.SphereGeometry(1, 8, 6)),
    torus: flat(new THREE.TorusGeometry(1, 0.28, 5, 12)),
    arch: flat(new THREE.TorusGeometry(1, 0.22, 4, 10, Math.PI)),
    frond: frondGeo(),
    hull: hullGeo(),
  };

  // Accumulates many small flat-shaded pieces into one vertex-coloured mesh (one draw call).
  class Builder {
    constructor() {
      this.pos = [];
      this.nor = [];
      this.col = [];
    }
    add(geo, m, color, jit = 0.08) {
      const p = geo.attributes.position.array;
      const n = geo.attributes.normal.array;
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      const v = new THREE.Vector3();
      const c = color instanceof THREE.Color ? color : new THREE.Color(color);
      for (let i = 0; i < p.length; i += 9) {
        const j = jit ? 1 + (Math.random() - 0.5) * jit : 1;
        const r = Math.min(1, c.r * j), g = Math.min(1, c.g * j), b = Math.min(1, c.b * j);
        for (let k = 0; k < 9; k += 3) {
          v.set(p[i + k], p[i + k + 1], p[i + k + 2]).applyMatrix4(m);
          this.pos.push(v.x, v.y, v.z);
          v.set(n[i + k], n[i + k + 1], n[i + k + 2]).applyMatrix3(nm).normalize();
          this.nor.push(v.x, v.y, v.z);
          this.col.push(r, g, b);
        }
      }
    }
    get empty() {
      return this.pos.length === 0;
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.computeBoundingSphere();
      return g;
    }
    build(material) {
      return new THREE.Mesh(this.geometry(), material);
    }
  }
  WR.Builder = Builder;

  WR.storage = {
    get(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) {
        return null;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (e) {}
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },
  };
})();
