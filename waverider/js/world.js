// Endless river generator: chunks, biomes (zones), obstacles, collectibles.
(function () {
  const WR = window.WR;
  const { clamp, lerp, rand, randi, pick, chance, mat, sub, G, Builder, TAU } = WR;

  const L = 60; // chunk length (world units, 5 units = 1 meter)
  const AHEAD = 8; // chunks kept ahead of the player
  const FALL_H = 10; // waterfall drop height
  WR.CHUNK = L;
  WR.FALL_H = FALL_H;

  const ZONES = {
    start: { width: 30, len: 1 },
    jungle: { width: 26, len: 3 },
    logs: { width: 28, len: 3 },
    village: { width: 26, len: 3 },
    city: { width: 30, len: 3 },
    ravine: { width: 15, len: 2 },
    sewer: { width: 14, len: 2 },
    waterfall: { width: 24, len: 1 },
  };
  WR.ZONES = ZONES;

  const ROCK = ['#8e8a85', '#7d7974', '#a19c96', '#87837e'];
  const CLIFF = ['#77716c', '#8a837d', '#6d6863', '#948c84', '#7f766c'];
  const LEAF = ['#3fae2c', '#4cc232', '#36a02a', '#5ccf3c'];
  const TRUNK = ['#a65f2a', '#b86f35'];
  const GRASS = '#5ec23c';

  // ---------------- water + waterfall shaders ----------------
  const WATER_VS = `
    uniform float uTime;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      wp.y += sin(wp.x * 0.35 + uTime * 1.3) * 0.06 + sin(wp.z * 0.25 + uTime * 1.7) * 0.07;
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const WATER_FS = `
    uniform float uTime;
    uniform vec3 uBase;
    uniform vec3 uDeep;
    uniform vec3 uLine;
    varying vec3 vWorld;
    #include <fog_pars_fragment>
    vec2 hash2(vec2 p){
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }
    float cellEdge(vec2 x, float t){
      vec2 n = floor(x), f = fract(x);
      vec2 mg, mr; float md = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash2(n + g);
        o = 0.5 + 0.5 * sin(t + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; mg = g; }
      }
      md = 8.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec2 g = mg + vec2(float(i), float(j));
        vec2 o = hash2(n + g);
        o = 0.5 + 0.5 * sin(t + 6.2831 * o);
        vec2 r = g + o - f;
        if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
      }
      return md;
    }
    void main(){
      vec2 uv = vWorld.xz * 0.12;
      uv += vec2(sin(vWorld.z * 0.05 + uTime * 0.5), cos(vWorld.x * 0.07 + uTime * 0.4)) * 0.22;
      float e = cellEdge(uv, uTime * 0.7);
      float line = 1.0 - smoothstep(0.025, 0.08, e);
      float e2 = cellEdge(uv * 0.45 + 3.7, uTime * 0.4);
      float line2 = 1.0 - smoothstep(0.015, 0.05, e2);
      vec3 col = mix(uDeep, uBase, 0.5 + 0.5 * sin(vWorld.x * 0.05 + vWorld.z * 0.03));
      col = mix(col, uLine, clamp(line * 0.7 + line2 * 0.35, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }`;
  const FALL_VS = `
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main(){
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const FALL_FS = `
    uniform float uTime;
    uniform vec3 uA;
    uniform vec3 uB;
    varying vec2 vUv;
    #include <fog_pars_fragment>
    void main(){
      float x = vUv.x * 14.0;
      float col = floor(x);
      float speed = 1.2 + fract(sin(col * 12.9898) * 43758.5453) * 0.8;
      float s = fract(vUv.y * 2.5 + uTime * speed + sin(col * 3.1) * 0.5);
      float streak = smoothstep(0.35, 0.5, s) * (1.0 - smoothstep(0.75, 0.95, s));
      float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
      vec3 c = mix(uA, uB, streak);
      c = mix(c, vec3(1.0), smoothstep(0.82, 1.0, vUv.y) * 0.7 + (1.0 - smoothstep(0.0, 0.15, vUv.y)) * 0.8);
      gl_FragColor = vec4(c, 0.92 * edge + 0.08);
      #include <fog_fragment>
    }`;

  function waterMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uBase: { value: new THREE.Color('#46c9d8') },
          uDeep: { value: new THREE.Color('#30b2c6') },
          uLine: { value: new THREE.Color('#c9f5f3') },
        },
      ]),
      vertexShader: WATER_VS,
      fragmentShader: WATER_FS,
      fog: true,
      side: THREE.DoubleSide,
    });
  }
  function fallMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uA: { value: new THREE.Color('#7fd8ee') }, uB: { value: new THREE.Color('#e9fbff') } },
      ]),
      vertexShader: FALL_VS,
      fragmentShader: FALL_FS,
      fog: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  // ---------------- prefabs (all write into a Builder) ----------------
  const P = {
    rock(b, x, y, z, sx, sy, sz, color, ry) {
      b.add(pick(G.rocks), mat(x, y, z, rand(-0.15, 0.15), ry == null ? rand(0, TAU) : ry, rand(-0.15, 0.15), sx, sy, sz), color || pick(ROCK), 0.14);
    },
    palm(b, x, y, z, h, lean = rand(0.3, 1)) {
      const n = Math.max(4, Math.round(h / 0.95));
      const seg = h / n;
      const a = rand(0, TAU);
      const dx = Math.cos(a), dz = Math.sin(a);
      let tx = x, tz = z;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const off = lean * t * t * h * 0.25;
        tx = x + dx * off;
        tz = z + dz * off;
        const r = 0.42 * (1 - t * 0.45);
        b.add(G.trunkSeg, mat(tx, y + k * seg + seg / 2, tz, 0, rand(0, TAU), 0, r, seg * 1.08, r), TRUNK[k % 2], 0.1);
      }
      const top = y + h;
      const m = randi(7, 9);
      const s = 0.55 + h / 12;
      for (let j = 0; j < m; j++) {
        const ang = (j / m) * TAU + rand(-0.25, 0.25);
        const len = rand(2.6, 3.4) * s;
        b.add(G.frond, mat(tx, top, tz, 0, ang, rand(-0.25, 0.25), len, len * 0.8, len * 1.25), pick(LEAF), 0.12);
      }
      for (let j = 0; j < 3; j++) b.add(G.ico, mat(tx + rand(-0.3, 0.3), top - 0.3, tz + rand(-0.3, 0.3), 0, 0, 0, 0.22), '#7a4a1e', 0.1);
    },
    deadTree(b, x, y, z, h) {
      const col = '#8b5a3a';
      b.add(G.cyl6, mat(x, y + h / 2, z, rand(-0.1, 0.1), 0, rand(-0.1, 0.1), 0.35, h, 0.35), col);
      for (let i = 0; i < 3; i++) {
        const yy = y + h * rand(0.5, 0.9);
        const a = rand(0, TAU);
        b.add(G.cyl6, mat(x + Math.cos(a) * 0.8, yy + 0.5, z + Math.sin(a) * 0.8, 0, -a, 0.9, 0.12, 2.2, 0.12), col);
      }
    },
    bush(b, x, y, z, s = 1) {
      for (let i = 0; i < 3; i++) b.add(pick(G.blobs), mat(x + rand(-0.8, 0.8) * s, y + 0.5 * s, z + rand(-0.8, 0.8) * s, 0, rand(0, TAU), 0, s * rand(0.7, 1.1)), pick(LEAF), 0.15);
    },
    reeds(b, x, y, z, n = 6, h = 2.2) {
      for (let i = 0; i < n; i++) {
        const hh = h * rand(0.6, 1.2);
        b.add(G.cone4, mat(x + rand(-0.6, 0.6), y + hh / 2, z + rand(-0.6, 0.6), rand(-0.3, 0.3), rand(0, TAU), rand(-0.3, 0.3), 0.14, hh, 0.03), pick(LEAF), 0.1);
      }
    },
    lily(b, x, y, z, s = 1, flower = false) {
      b.add(G.cyl8, mat(x, y + 0.03, z, 0, rand(0, TAU), 0, s, 0.05, s), '#4ccf35', 0.1);
      if (flower) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          b.add(G.cone4, mat(x + Math.cos(a) * 0.15, y + 0.25, z + Math.sin(a) * 0.15, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6, 0.18, 0.5, 0.06), '#ff5f88', 0.1);
        }
        b.add(G.ico, mat(x, y + 0.2, z, 0, 0, 0, 0.1), '#ffd54a');
      }
    },
    flowers(b, x, y, z) {
      for (let i = 0; i < 4; i++) b.add(G.ico, mat(x + rand(-0.6, 0.6), y + 0.3, z + rand(-0.6, 0.6), 0, 0, 0, 0.16), pick(['#ff4f6d', '#ffd54a', '#ff8f3a']));
    },
    log(b, x, y, z, len, ry = 0, r = 0.5) {
      b.add(G.cyl8, mat(x, y, z, 0, ry, Math.PI / 2, r, len, r), '#b4552c', 0.1);
      b.add(G.box, mat(x, y + r * 0.75, z, 0, ry, 0, len * 0.8, 0.2, r * 1.1), '#52b33a', 0.12);
      const cx = Math.cos(ry) * (len / 2), cz = -Math.sin(ry) * (len / 2);
      b.add(G.cyl8, mat(x + cx, y, z + cz, 0, ry, Math.PI / 2, r * 0.85, 0.06, r * 0.85), '#e0a46a');
      b.add(G.cyl8, mat(x - cx, y, z - cz, 0, ry, Math.PI / 2, r * 0.85, 0.06, r * 0.85), '#e0a46a');
      if (chance(0.5)) P.reeds(b, x + cx * 0.3, y + r * 0.5, z + cz * 0.3, 3, 1.2);
    },
    torii(b, x, y, z, ry = 0) {
      const M = mat(x, y, z, 0, ry, 0);
      const red = '#b5432a';
      b.add(G.cyl8, sub(M, -2.2, 2.6, 0, 0, 0, 0, 0.25, 5.2, 0.25), red);
      b.add(G.cyl8, sub(M, 2.2, 2.6, 0, 0, 0, 0, 0.25, 5.2, 0.25), red);
      b.add(G.box, sub(M, 0, 5.3, 0, 0, 0, 0, 6.2, 0.45, 0.6), red);
      b.add(G.box, sub(M, 0, 5.6, 0, 0, 0, 0, 6.8, 0.2, 0.7), '#3d2a1f');
      b.add(G.box, sub(M, 0, 4.4, 0, 0, 0, 0, 5, 0.3, 0.35), red);
    },
    sign(b, x, y, z, kind = 'warn', ry = 0) {
      const M = mat(x, y, z, 0, ry, 0);
      b.add(G.cyl6, sub(M, 0, 1.1, 0, 0, 0, 0, 0.12, 2.2, 0.12), '#7a4a26');
      if (kind === 'warn') {
        b.add(G.box, sub(M, 0, 2.3, 0, 0, 0, 0, 1.5, 1.1, 0.12), '#c98a3e');
        b.add(G.box, sub(M, 0, 2.3, 0.08, 0, 0, 0, 1.1, 0.8, 0.05), '#ffcc2e');
        b.add(G.box, sub(M, 0, 2.38, 0.12, 0, 0, 0, 0.14, 0.4, 0.04), '#d62b1e');
        b.add(G.box, sub(M, 0, 2.08, 0.12, 0, 0, 0, 0.14, 0.12, 0.04), '#d62b1e');
      } else {
        b.add(G.box, sub(M, 0, 2.3, 0, 0, 0, 0, 1.7, 0.7, 0.12), '#c98a3e');
        b.add(G.box, sub(M, -0.15, 2.3, 0.08, 0, 0, 0, 0.9, 0.18, 0.05), '#ffffff');
        b.add(G.cone3, sub(M, 0.45, 2.3, 0.08, 0, 0, -Math.PI / 2, 0.3, 0.4, 0.05), '#ffffff');
      }
    },
    hut(b, x, y, z, ry = 0) {
      const M = mat(x, y, z, 0, ry, 0);
      [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([a, c]) => b.add(G.cyl6, sub(M, a, 1.3, c, 0, 0, 0, 0.16, 3.4, 0.16), '#7a4a26'));
      b.add(G.box, sub(M, 0, 3.0, 0, 0, 0, 0, 4.4, 0.3, 4.4), '#a8743f');
      b.add(G.box, sub(M, 0, 4.4, 0, 0, 0, 0, 3.4, 2.5, 3.4), pick(['#c98b4a', '#d39a5c', '#b97a3d']));
      b.add(G.box, sub(M, 0, 4.1, 1.72, 0, 0, 0, 0.9, 1.6, 0.05), '#4a2c16');
      b.add(G.cone4, sub(M, 0, 6.6, 0, 0, Math.PI / 4, 0, 3.6, 2.2, 3.6), pick(['#d4a843', '#c9963a']), 0.15);
    },
    dock(b, x, y, z, len, hd = 1.2) {
      b.add(G.box, mat(x, y + 0.75, z, 0, 0, 0, len, 0.25, hd * 2), '#a8743f', 0.12);
      for (let i = -len / 2 + 0.4; i <= len / 2; i += 2) {
        b.add(G.cyl6, mat(x + i, y - 0.4, z - hd + 0.15, 0, 0, 0, 0.15, 2.6, 0.15), '#6b4123');
        b.add(G.cyl6, mat(x + i, y - 0.4, z + hd - 0.15, 0, 0, 0, 0.15, 2.6, 0.15), '#6b4123');
      }
    },
    boat(b, x, y, z, ry, rz = 0, wreck = false) {
      const M = mat(x, y, z, 0, ry, rz);
      const hull = pick(['#e8742a', '#2f6fb8', '#d9412f', '#3a9a5a', '#e0b030']);
      b.add(G.hull, sub(M, 0, 1.0, 0), hull, 0.12);
      b.add(G.box, sub(M, 0, 0.78, -0.1, 0, 0, 0, 2.56, 0.18, 5.3), '#f4f4f4');
      if (!wreck || chance(0.6)) {
        b.add(G.box, sub(M, 0, 1.65, -1.0, 0, 0, 0, 1.8, 1.3, 2.0), '#f2f2f2');
        b.add(G.box, sub(M, 0, 1.95, -1.0, 0, 0, 0, 1.85, 0.4, 1.7), '#2a4a6a');
        b.add(G.box, sub(M, 0, 2.38, -1.0, 0, 0, 0, 2.1, 0.18, 2.3), hull);
      }
      if (wreck) {
        b.add(G.box, sub(M, 0.6, 1.2, 1.2, 0.4, 0.3, 0.2, 0.15, 1.5, 0.15), '#7a4a26');
        b.add(G.torus, sub(M, -1.2, 1.3, 0.8, 0, 1.4, 0, 0.45), '#ff6a2a');
      }
    },
    building(b, x, y, z, w, h, d, rx, rz, ry = 0) {
      const M = mat(x, y, z, rx, ry, rz);
      const col = pick(['#2e5ea8', '#3b6bb5', '#3c5f8f', '#e9e4da']);
      b.add(G.box, sub(M, 0, h / 2, 0, 0, 0, 0, w, h, d), col, 0.06);
      for (let k = 1.6; k < h - 0.5; k += 2.2) b.add(G.box, sub(M, 0, k, 0, 0, 0, 0, w * 1.03, 0.6, d * 1.03), '#9fd0f2', 0.05);
      b.add(G.box, sub(M, 0, h + 0.2, 0, 0, 0, 0, w * 1.1, 0.4, d * 1.1), '#d8d2c4');
      if (chance(0.6)) b.add(G.torus, sub(M, w / 2 + 0.1, h * 0.35, 0, 0, Math.PI / 2, 0, 0.55), '#ff6a2a');
    },
    pillar(b, x, y, z, h) {
      b.add(G.cyl8, mat(x, y + h / 2, z, rand(-0.08, 0.08), 0, rand(-0.08, 0.08), 0.75, h, 0.75), '#cfc6b4', 0.08);
      b.add(G.box, mat(x, y + h, z, 0, rand(0, 1), 0, 1.8, 0.4, 1.8), '#bdb3a0');
    },
    crate(b, x, y, z, s = 1.2) {
      b.add(G.box, mat(x, y + s * 0.3, z, rand(-0.1, 0.1), rand(0, 1), rand(-0.1, 0.1), s, s, s), '#b8834a', 0.12);
      b.add(G.box, mat(x, y + s * 0.3, z, 0, 0, 0, s * 1.02, s * 0.2, s * 1.02), '#7d5428');
    },
    barrel(b, x, y, z) {
      b.add(G.cyl8, mat(x, y + 0.3, z, rand(-0.2, 0.2), 0, rand(-0.2, 0.2), 0.5, 1.2, 0.5), '#b9542c', 0.1);
      b.add(G.cyl8, mat(x, y + 0.3, z, 0, 0, 0, 0.53, 0.12, 0.53), '#4a4a4a');
    },
    buoy(b, x, y, z) {
      b.add(G.sphere, mat(x, y + 0.15, z, 0, 0, 0, 0.5), '#e8382e');
      b.add(G.cyl8, mat(x, y + 0.2, z, 0, 0, 0, 0.52, 0.18, 0.52), '#ffffff');
      b.add(G.cyl6, mat(x, y + 0.85, z, 0, 0, 0, 0.05, 0.8, 0.05), '#555555');
    },
  };
  WR.P = P;

  // ---------------- dynamic item geometry ----------------
  function itemGeos() {
    const shell = new Builder();
    const half = WR.flat(new THREE.CylinderGeometry(1, 1, 0.22, 9, 1, false, -Math.PI / 2, Math.PI));
    shell.add(half, mat(0, 0, 0, Math.PI / 2, 0, 0, 0.62, 0.62, 0.62), '#ffad33', 0.18);
    shell.add(half, mat(0, 0.02, -0.12, Math.PI / 2 - 0.9, 0, 0, 0.58, 0.58, 0.58), '#ff9a1f', 0.18);
    shell.add(G.sphere, mat(0, 0.08, 0.05, 0, 0, 0, 0.17), '#fff2a0', 0);

    const turtle = new Builder();
    turtle.add(G.halfSphere, mat(0, -0.05, 0, 0, 0, 0, 1.25, 0.7, 1.55), '#3f9a3a', 0.25);
    turtle.add(G.cyl12, mat(0, -0.05, 0, 0, 0, 0, 1.3, 0.12, 1.6), '#d9c06a', 0.1);
    turtle.add(G.sphere, mat(0, 0.05, 1.85, 0, 0, 0, 0.42, 0.38, 0.5), '#86cf5e', 0.1);
    turtle.add(G.sphere, mat(0.16, 0.18, 2.2, 0, 0, 0, 0.06), '#111111', 0);
    turtle.add(G.sphere, mat(-0.16, 0.18, 2.2, 0, 0, 0, 0.06), '#111111', 0);
    [[1.2, 0.9, -0.6], [-1.2, 0.9, 0.6], [1.0, -1.0, -0.3], [-1.0, -1.0, 0.3]].forEach(([x, z, r]) =>
      turtle.add(G.box, mat(x, -0.1, z, 0, r, 0, 0.9, 0.12, 0.45), '#86cf5e', 0.1)
    );

    const trash = [new Builder(), new Builder(), new Builder()];
    trash[0].add(G.cyl8, mat(0, 0, 0, 0, 0, Math.PI / 2 - 0.3, 0.22, 0.8, 0.22), '#3fa65a');
    trash[0].add(G.cyl8, mat(0.48, 0.15, 0, 0, 0, Math.PI / 2 - 0.3, 0.09, 0.3, 0.09), '#3fa65a');
    trash[1].add(G.cyl8, mat(0, 0, 0, 0, 0, 1.2, 0.25, 0.6, 0.25), '#d9342b');
    trash[1].add(G.cyl8, mat(0, 0, 0, 0, 0, 1.2, 0.26, 0.2, 0.26), '#f2f2f2');
    trash[2].add(pick(G.blobs), mat(0, 0, 0, 0, 0, 0, 0.45, 0.3, 0.4), '#e7e7e0', 0.2);
    trash[2].add(G.box, mat(0, 0.15, 0, 0.2, 0.5, 0, 0.5, 0.06, 0.3), '#3d7fd0');

    return {
      shell: shell.geometry(),
      turtle: turtle.geometry(),
      trash: trash.map((t) => t.geometry()),
      bubble: new THREE.SphereGeometry(1, 18, 12),
    };
  }

  // ---------------- World ----------------
  class World {
    constructor(scene) {
      this.scene = scene;
      this.chunks = [];
      this.staticMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this.itemMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#222222') });
      this.shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#6a3a00') });
      this.bubbleMat = new THREE.MeshPhongMaterial({ color: '#dff7ff', transparent: true, opacity: 0.35, shininess: 120, specular: '#ffffff', depthWrite: false });
      this.waterMat = waterMaterial();
      this.fallMat = fallMaterial();
      this.geos = itemGeos();
      this.glowMat = new THREE.SpriteMaterial({ map: WR.Tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
      this.mistMat = new THREE.SpriteMaterial({ map: WR.Tex.mist, transparent: true, depthWrite: false, opacity: 0.7, fog: true });
      this.iconMats = {};
      ['wrench', 'freeze', 'shield', 'magnet', 'star'].forEach((k) => {
        this.iconMats[k] = new THREE.SpriteMaterial({ map: WR.Tex.iconTexture(k === 'star' ? 'star' : k), transparent: true, depthWrite: false });
      });
      this.time = 0;
    }

    setMode(mode) {
      this.mode = mode;
      const u = this.waterMat.uniforms;
      if (mode === 'hard') {
        u.uBase.value.set('#2b6b40');
        u.uDeep.value.set('#1d5131');
        u.uLine.value.set('#a6cdb0');
      } else {
        u.uBase.value.set('#46c9d8');
        u.uDeep.value.set('#30b2c6');
        u.uLine.value.set('#c9f5f3');
      }
    }

    reset(opts) {
      this.chunks.forEach((c) => this.disposeChunk(c));
      this.chunks = [];
      this.setMode(opts.mode);
      this.tutorial = !!opts.tutorial;
      this.next = 0;
      this.queue = [{ zone: 'start', end: true, start: true }];
      if (this.tutorial) {
        this.queue.push({ zone: 'jungle', start: true, tut: 'A' }, { zone: 'jungle', tut: 'B' }, { zone: 'jungle', end: true });
      } else {
        this.queue.push({ zone: 'jungle', start: true }, { zone: 'jungle' }, { zone: 'jungle', end: true });
      }
      this.lastZone = 'jungle';
      this.lastGap = 0;
      this.maxShift = 8;
      for (let i = 0; i <= AHEAD; i++) this.makeChunk();
    }

    diffAt(z) {
      return clamp(-z / (5 * 1100), 0, 1);
    }

    pickZone() {
      const w = { jungle: 2, logs: 2, village: 2, city: 2, ravine: 1.4, sewer: 1.2, waterfall: 1.6 };
      delete w[this.lastZone];
      if (this.lastZone === 'sewer') delete w.ravine;
      if (this.lastZone === 'ravine') delete w.sewer;
      return WR.weighted(w);
    }

    enqueueZone() {
      const z = this.pickZone();
      this.lastZone = z;
      let n = ZONES[z].len;
      if (['jungle', 'logs', 'village', 'city'].includes(z)) n += randi(-1, 1);
      n = Math.max(1, n);
      const bridgeAt = ['jungle', 'logs', 'village', 'city'].includes(z) && chance(z === 'city' ? 0.8 : 0.45) ? randi(0, n - 1) : -1;
      for (let k = 0; k < n; k++) this.queue.push({ zone: z, start: k === 0, end: k === n - 1, bridge: k === bridgeAt });
    }

    makeChunk() {
      if (!this.queue.length) this.enqueueZone();
      const spec = this.queue.shift();
      const i = this.next++;
      const prev = this.chunks[this.chunks.length - 1];
      const level = prev ? prev.level - (prev.zone === 'waterfall' ? FALL_H : 0) : 0;
      const c = {
        i,
        z0: -i * L,
        z1: -(i + 1) * L,
        level,
        zone: spec.zone,
        width: ZONES[spec.zone].width,
        spec,
        obstacles: [],
        items: [],
        anim: [],
        group: new THREE.Group(),
        passed: false,
        bridgeZ: null,
        bridgeCounted: false,
        afterFall: !!(prev && prev.zone === 'waterfall'),
      };
      const b = new Builder();
      this.buildBanks(c, b);
      GEN[c.zone](this, c, b, spec);
      if (spec.bridge) this.buildBridge(c, b);
      this.buildWater(c);
      if (!b.empty) {
        const m = b.build(this.staticMat);
        m.userData.own = true;
        c.group.add(m);
      }
      this.scene.add(c.group);
      this.chunks.push(c);
      return c;
    }

    disposeChunk(c) {
      this.scene.remove(c.group);
      c.group.traverse((o) => {
        if (o.userData.own && o.geometry) o.geometry.dispose();
      });
    }

    buildWater(c) {
      const zFront = c.zone === 'start' ? 60 : c.z0 + 0.3;
      const len = zFront - c.z1;
      const w = c.width + 70;
      const g = new THREE.PlaneGeometry(w, len, 16, Math.max(4, Math.round(len / 6)));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.waterMat);
      m.position.set(0, c.level, (zFront + c.z1) / 2);
      m.userData.own = true;
      c.group.add(m);
    }

    curtain(c, x, yTop, z, w, h, ry = 0) {
      const g = new THREE.PlaneGeometry(w, h, 1, 1);
      const m = new THREE.Mesh(g, this.fallMat);
      m.position.set(x, yTop - h / 2, z);
      m.rotation.y = ry;
      m.userData.own = true;
      c.group.add(m);
      return m;
    }

    mist(c, x, y, z, s = 6, n = 4) {
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Sprite(this.mistMat);
        sp.position.set(x + rand(-s * 0.4, s * 0.4), y + rand(0, s * 0.3), z + rand(-1, 1));
        sp.scale.setScalar(s * rand(0.7, 1.2));
        c.group.add(sp);
        c.anim.push({ kind: 'mist', o: sp, base: sp.position.y, ph: rand(0, TAU) });
      }
    }

    buildBanks(c, b) {
      const hw = c.width / 2;
      const lvl = c.level;
      const zFront = c.zone === 'start' ? 50 : c.z0;
      const len = zFront - c.z1;
      const zm = (zFront + c.z1) / 2;
      const ravine = c.zone === 'ravine';
      const sewer = c.zone === 'sewer';
      for (const s of [-1, 1]) {
        b.add(G.box, mat(s * (hw + 30), lvl + 0.6 - 2, zm, 0, 0, 0, 60, 4, len + 0.6), c.zone === 'city' ? '#79b845' : GRASS, 0.1);
        if (sewer) continue;
        for (let z = zFront; z > c.z1; z -= rand(3, 5.5)) {
          P.rock(b, s * (hw + rand(0.7, 1.5)), lvl + rand(-0.4, 0.15), z, rand(1.2, 2.2), rand(0.8, 1.5), rand(1.4, 2.4));
        }
        for (let z = zFront + 5; z > c.z1 - 5; z -= ravine ? rand(4, 7) : rand(8, 15)) {
          const sx = rand(5, 11);
          const sy = ravine ? rand(14, 26) : rand(6, 20);
          const x = s * (hw + (ravine ? rand(1.5, 4) : rand(12, 28)) + sx * 0.5);
          P.rock(b, x, lvl, z, sx, sy, rand(5, 10), pick(CLIFF));
          if (chance(ravine ? 0.3 : 0.55)) {
            P.rock(b, x, lvl + sy * 0.86, z, sx * 0.85, 1.3, sx * 0.8, pick(LEAF));
            if (chance(0.4)) P.palm(b, x + rand(-2, 2), lvl + sy * 0.9, z + rand(-2, 2), rand(4, 7));
          }
        }
      }
    }

    // ---- helpers used by zone generators ----
    addOb(c, o) {
      o.level = c.level;
      o.hitT = -99;
      c.obstacles.push(o);
      return o;
    }
    addItem(c, type, x, yRel, z, extra = {}) {
      let mesh;
      if (type === 'shell') {
        mesh = new THREE.Group();
        const s = new THREE.Mesh(this.geos.shell, this.shellMat);
        mesh.add(s);
        const glow = new THREE.Sprite(this.glowMat);
        glow.scale.setScalar(2.2);
        mesh.add(glow);
      } else if (type === 'bubble') {
        mesh = new THREE.Group();
        const s = new THREE.Mesh(this.geos.bubble, this.bubbleMat);
        mesh.add(s);
        const ic = new THREE.Sprite(this.iconMats[extra.power]);
        ic.scale.setScalar(1.15);
        mesh.add(ic);
      } else if (type === 'turtle') {
        mesh = new THREE.Mesh(this.geos.turtle, this.itemMat);
      } else if (type === 'trash') {
        mesh = new THREE.Mesh(pick(this.geos.trash), this.itemMat);
        mesh.rotation.y = rand(0, TAU);
      }
      mesh.position.set(x, c.level + yRel, z);
      c.group.add(mesh);
      const it = Object.assign({ type, x, z, y: yRel, baseY: yRel, x0: x, mesh, alive: true, level: c.level, ph: rand(0, TAU) }, extra);
      c.items.push(it);
      return it;
    }
    shellLine(c, x, z, n = 4, step = 3, yFn) {
      for (let k = 0; k < n; k++) {
        const zz = z - k * step;
        if (zz < c.z1 + 1) break;
        this.addItem(c, 'shell', x, yFn ? yFn(k) : 0.9, zz);
      }
    }
    maybePowerup(c, x, z) {
      const p = this.mode === 'hard' ? 0.12 : 0.3;
      if (!chance(p)) return;
      const power = WR.weighted({ wrench: 1.3, freeze: 1, shield: 1.1, magnet: 1.1, star: 1 });
      this.addItem(c, 'bubble', x, 1.3, z, { power });
    }
    rows(c, fn, opts = {}) {
      const d = this.diffAt(c.z0);
      const hard = this.mode === 'hard';
      const meters = -c.z0 / 5;
      // rows are spaced in time (not distance) so they stay reachable at high speed
      const v = (hard ? 26 : 22) * (1 + 0.55 * clamp(meters / 1300, 0, 1));
      const tgap = lerp(0.85, 0.55, d) * (hard ? 0.85 : 1) * (opts.spacing || 1);
      const spacing = Math.max(9, v * tgap);
      this.maxShift = clamp(15 * tgap * 0.75, 4, 9);
      let z = c.z0 - (opts.startPad != null ? opts.startPad : c.afterFall ? 34 : 7);
      const end = c.z1 + (opts.endPad == null ? 3 : opts.endPad);
      while (z > end) {
        const skip = c.bridgeZ != null && Math.abs(z - c.bridgeZ) < 9;
        if (!skip) fn(z, d);
        z -= spacing * rand(0.85, 1.2);
      }
    }
    gap(c) {
      const hw = c.width / 2;
      const prev = this.lastGap == null ? 0 : this.lastGap;
      const g = clamp(prev + rand(-this.maxShift, this.maxShift), -hw + 2.6, hw - 2.6);
      this.lastGap = g;
      return g;
    }
    gapHalf() {
      return this.mode === 'hard' ? 1.8 : 2.3;
    }
    freeX(c, gx, ohw, tries = 12) {
      const hw = c.width / 2;
      for (let t = 0; t < tries; t++) {
        const x = rand(-hw + ohw + 0.3, hw - ohw - 0.3);
        if (Math.abs(x - gx) > this.gapHalf() + ohw) return x;
      }
      return null;
    }
    rockOb(c, b, x, z, big) {
      if (big) {
        const r = rand(1.2, 1.8);
        P.rock(b, x, c.level + 0.2, z, r * 1.1, r * 1.3, r * 1.1);
        this.addOb(c, { kind: 'rock', x, z, hw: r * 0.95, hd: r * 0.95, yMin: -3, yMax: r * 1.3 });
      } else {
        const r = rand(0.6, 0.95);
        P.rock(b, x, c.level - 0.15, z, r * 1.15, r * 0.95, r * 1.15);
        this.addOb(c, { kind: 'rock', x, z, hw: r * 0.95, hd: r * 0.95, yMin: -3, yMax: 0.75 });
      }
    }
    floatingLog(c, b, x, z, len) {
      P.log(b, x, c.level + 0.05, z, len, rand(-0.06, 0.06));
      this.addOb(c, { kind: 'log', x, z, hw: len / 2, hd: 0.5, yMin: -0.45, yMax: 0.55 });
    }
    hangingTrunk(c, b, z) {
      const hw = c.width / 2;
      const y = c.level + 1.65;
      b.add(G.cyl8, mat(0, y, z, 0, 0, Math.PI / 2, 0.55, c.width + 6, 0.55), '#9a4f2a', 0.1);
      b.add(G.box, mat(0, y + 0.45, z, 0, 0, 0, c.width + 4, 0.25, 0.7), '#52b33a', 0.12);
      for (let x = -hw; x < hw; x += rand(1.5, 3)) b.add(G.cone4, mat(x, y - 0.6, z, Math.PI, rand(0, TAU), rand(-0.3, 0.3), 0.3, 1.0, 0.08), pick(LEAF));
      P.rock(b, -hw - 0.5, c.level + 0.4, z, 2, 1.6, 2);
      P.rock(b, hw + 0.5, c.level + 0.4, z, 2, 1.6, 2);
      P.sign(b, -hw - 2.5, c.level + 0.5, z + 16, 'warn');
      P.sign(b, hw + 2.5, c.level + 0.5, z + 16, 'warn');
      return this.addOb(c, { kind: 'trunk', x: 0, z, hw: hw + 2, hd: 0.6, yMin: 0.95, yMax: 2.4 });
    }
    turtle(c, x, z) {
      this.addItem(c, 'turtle', x, -0.15, z, { r: 1.4, used: false, swim: rand(1, 2.2) });
      for (let k = 0; k < 6; k++) this.addItem(c, 'shell', x, 2 + Math.sin((k / 5) * Math.PI) * 5, z - 6 - k * 4);
    }

    buildBridge(c, b) {
      const z = c.z0 - L / 2;
      c.bridgeZ = z;
      const hw = c.width / 2;
      const lvl = c.level;
      const stone = '#9b948b';
      const span = c.width + 2;
      const n = Math.max(3, Math.round(span / 7.5));
      const pw = 2.4;
      const ow = (span - (n + 1) * pw) / n;
      const deckY = lvl + 6.8;
      b.add(G.box, mat(0, deckY, z, 0, 0, 0, c.width + 60, 1.4, 4.2), stone, 0.08);
      for (let x = -hw - 30; x < hw + 30; x += 1.3) b.add(G.box, mat(x, deckY + 1.1, z + 1.9, 0, 0, 0, 0.35, 0.9, 0.35), '#b5aea4');
      b.add(G.box, mat(0, deckY + 1.6, z + 1.9, 0, 0, 0, c.width + 60, 0.25, 0.5), '#b5aea4');
      for (let i = 0; i <= n; i++) {
        const x = -span / 2 + pw / 2 + i * (pw + ow);
        b.add(G.box, mat(x, lvl + 1.8, z, 0, 0, 0, pw, 10, 3.6), stone, 0.1);
        this.addOb(c, { kind: 'pillar', x, z, hw: pw / 2, hd: 1.8, yMin: -3, yMax: 20 });
        if (i < n) {
          const ax = x + pw / 2 + ow / 2;
          b.add(G.arch, mat(ax, lvl + 3.7, z, 0, 0, 0, ow / 2, ow / 2, 6.5), '#8a837a');
          b.add(G.box, mat(ax, lvl + 3.7 + ow / 2 + 0.6, z, 0, 0, 0, ow, deckY - (lvl + 3.7 + ow / 2) + 0.2, 3.4), stone, 0.1);
        }
      }
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.add(G.box, mat(s * (hw + 4 + k * 5), lvl + 3, z, 0, 0, 0, 2.5, 7, 3.6), stone, 0.1);
      // keep shells flowing through one arch
      const ax = -span / 2 + pw + ow / 2 + randi(0, n - 1) * (pw + ow);
      this.shellLine(c, ax, z + 8, 6, 3);
    }
  }

  // ---------------- zone generators ----------------
  const GEN = {
    start(W, c, b) {
      const lvl = c.level;
      const hw = c.width / 2;
      // cliff behind the start with a waterfall and water wheel
      for (let x = -40; x <= 40; x += rand(5, 8)) P.rock(b, x, lvl - 2, rand(30, 40), rand(6, 10), rand(16, 24), rand(6, 9), pick(CLIFF));
      P.rock(b, -4, lvl + 15, 25, 9, 3, 7, pick(LEAF));
      P.rock(b, 10, lvl + 16, 24, 8, 2.5, 6, pick(LEAF));
      P.rock(b, 4, lvl + 2, 21, 4, 4, 3, pick(CLIFF));
      W.curtain(c, -4, lvl + 15.5, 20.5, 7, 15.6);
      W.mist(c, -4, lvl + 0.5, 18.5, 7, 6);
      P.palm(b, 12, lvl + 16, 25, 6);
      P.palm(b, -12, lvl + 14, 27, 7);
      P.bush(b, 6, lvl + 16.5, 23, 1.6);
      // water wheel
      const wheel = new THREE.Group();
      const wb = new Builder();
      wb.add(G.torus, mat(0, 0, 0, 0, Math.PI / 2, 0, 3.2, 3.2, 3.2), '#8a4f26');
      wb.add(G.torus, mat(0.9, 0, 0, 0, Math.PI / 2, 0, 3.2, 3.2, 3.2), '#8a4f26');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        wb.add(G.box, mat(0.45, Math.sin(a) * 1.6, Math.cos(a) * 1.6, a, 0, 0, 0.2, 0.25, 3.2), '#a8622c');
        wb.add(G.box, mat(0.45, Math.sin(a) * 3.3, Math.cos(a) * 3.3, a, 0, 0, 1.4, 0.15, 1.1), '#b8703a');
      }
      wb.add(G.cyl8, mat(0.45, 0, 0, 0, 0, Math.PI / 2, 0.35, 2.4, 0.35), '#4a4a4a');
      const wm = wb.build(W.staticMat);
      wm.userData.own = true;
      wheel.add(wm);
      wheel.position.set(9, lvl + 16.5, 20.5);
      c.group.add(wheel);
      c.anim.push({ kind: 'wheel', o: wheel });
      b.add(G.box, mat(9, lvl + 19.5, 22.5, 0, 0, -0.2, 6, 0.4, 0.8), '#8a4f26');
      // grassy islands in the lagoon
      [[5, 7, 4, 3], [-9, 2, 3, 2.4], [7.5, -6, 2.6, 2]].forEach(([x, z, sx, sz]) => {
        b.add(pick(G.rocks), mat(x, lvl - 0.6, z, 0, rand(0, TAU), 0, sx, 0.9, sz), '#55c835', 0.08);
        P.reeds(b, x + sx * 0.4, lvl + 0.2, z, 5, 2.4);
      });
      P.rock(b, -hw + 2, lvl + 0.5, 10, 3, 2.5, 3);
      for (let z = 30; z > c.z1; z -= 6) {
        P.palm(b, -hw - rand(3, 10), lvl + 0.6, z, rand(6, 9));
        P.palm(b, hw + rand(3, 10), lvl + 0.6, z, rand(6, 9));
        if (chance(0.6)) P.reeds(b, (chance(0.5) ? -1 : 1) * (hw - 0.5), lvl, z, 5);
      }
      for (let k = 0; k < 6; k++) P.lily(b, (chance(0.5) ? -1 : 1) * rand(hw - 5, hw - 1), lvl, rand(c.z1, 15), rand(0.6, 1.1), chance(0.3));
      W.shellLine(c, 0, -20, 6, 3.5);
    },

    jungle(W, c, b, spec) {
      const hw = c.width / 2;
      const lvl = c.level;
      for (let z = c.z0; z > c.z1; z -= rand(4, 7)) {
        for (const s of [-1, 1]) {
          if (chance(0.75)) P.palm(b, s * (hw + rand(2, 11)), lvl + 0.6, z + rand(-2, 2), rand(5.5, 9.5));
          if (chance(0.4)) P.bush(b, s * (hw + rand(2, 8)), lvl + 0.6, z, rand(0.8, 1.4));
          if (chance(0.45)) P.reeds(b, s * (hw - rand(0, 1.2)), lvl, z + rand(-2, 2), randi(4, 7), rand(1.6, 2.6));
          if (chance(0.3)) P.lily(b, s * (hw - rand(1, 3.5)), lvl, z + rand(-2, 2), rand(0.6, 1.1), chance(0.35));
          if (chance(0.15)) P.flowers(b, s * (hw + rand(1, 4)), lvl + 0.6, z);
        }
      }
      if (chance(0.5)) {
        const z = rand(c.z1 + 10, c.z0 - 10);
        for (const s of [-1, 1]) P.torii(b, s * (hw + 3.5), lvl + 0.6, z, Math.PI / 2);
      }
      if (chance(0.3)) {
        const s = chance(0.5) ? -1 : 1;
        W.curtain(c, s * (hw + 18), lvl + 16, rand(c.z1 + 10, c.z0 - 10), 4, 16, s * Math.PI / 2);
      }

      if (spec.tut === 'A') {
        // steer lesson: wall of rocks in the middle, open sides
        const z = c.z0 - 26;
        for (let x = -7; x <= 7; x += 2.3) W.rockOb(c, b, x, z, true);
        c.obstacles[c.obstacles.length - 1].tut = 'steer';
        W.shellLine(c, -10, z + 6, 4, 3);
        W.shellLine(c, 10, z + 6, 4, 3);
        // jump lesson: log across the whole river
        const zj = c.z0 - 52;
        P.log(b, 0, lvl + 0.05, zj, c.width + 3, 0);
        W.addOb(c, { kind: 'log', x: 0, z: zj, hw: hw + 1.5, hd: 0.5, yMin: -0.45, yMax: 0.55, tut: 'jump' });
        for (let k = 0; k < 3; k++) W.addItem(c, 'shell', 0, 1.6 + k * 0.4, zj + 2 - k * 2);
        return;
      }
      if (spec.tut === 'B') {
        const o = W.hangingTrunk(c, b, c.z0 - 25);
        o.tut = 'dive';
        W.turtle(c, 0, c.z0 - 48);
        return;
      }

      const early = c.z0 > -L * 1.5;
      W.rows(c, (z, d) => {
        const g = W.gap(c);
        const type = WR.weighted({ rocks: 3, palms: 2.5, log: 1.3, turtle: early ? 0 : 0.5, clear: early ? 1.2 : 0.4 });
        if (type === 'rocks') {
          const n = randi(2, 3 + Math.round(d * 2));
          for (let k = 0; k < n; k++) {
            const x = W.freeX(c, g, 1.2);
            if (x != null) W.rockOb(c, b, x, z + rand(-1.5, 1.5), chance(0.4));
          }
        } else if (type === 'palms') {
          const n = randi(1, 3);
          for (let k = 0; k < n; k++) {
            const x = W.freeX(c, g, 0.6);
            if (x == null) continue;
            const zz = z + rand(-2, 2);
            P.palm(b, x, lvl - 0.5, zz, rand(6, 10));
            P.rock(b, x, lvl - 0.2, zz, 1, 0.5, 1);
            W.addOb(c, { kind: 'palm', x, z: zz, hw: 0.55, hd: 0.55, yMin: -3, yMax: 30 });
          }
          const rx = W.freeX(c, g, 1);
          if (rx != null && chance(0.5)) W.rockOb(c, b, rx, z + 3, false);
        } else if (type === 'log') {
          const len = rand(5, 9);
          const side = g > 0 ? -1 : 1;
          const x = clamp(g + side * (W.gapHalf() + len / 2), -hw + len / 2 - 1, hw - len / 2 + 1);
          W.floatingLog(c, b, x, z, len);
        } else if (type === 'turtle') {
          W.turtle(c, g, z);
          return;
        }
        if (chance(0.7)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.25)) W.maybePowerup(c, g, z - 2);
      });
    },

    logs(W, c, b, spec) {
      const hw = c.width / 2;
      const lvl = c.level;
      for (let z = c.z0; z > c.z1; z -= rand(5, 8)) {
        for (const s of [-1, 1]) {
          if (chance(0.4)) P.deadTree(b, s * (hw + rand(2, 10)), lvl + 0.6, z, rand(4, 7));
          if (chance(0.35)) P.palm(b, s * (hw + rand(3, 12)), lvl + 0.6, z, rand(5, 8));
          if (chance(0.5)) P.log(b, s * (hw + rand(0.5, 3)), lvl + 0.4, z, rand(4, 8), rand(-0.8, 0.8));
          if (chance(0.25)) P.sign(b, s * (hw + 1.5), lvl + 0.6, z, chance(0.5) ? 'warn' : 'arrow', s > 0 ? -0.3 : 0.3);
          if (chance(0.3)) P.reeds(b, s * (hw - rand(0, 1)), lvl, z, 4);
        }
      }
      for (const s of [-1, 1]) if (chance(0.5)) W.curtain(c, s * (hw + 20), lvl + 18, rand(c.z1 + 10, c.z0 - 10), 5, 18, s * Math.PI / 2);
      let trunks = 0;
      W.rows(c, (z, d) => {
        const g = W.gap(c);
        const type = WR.weighted({ logs: 3, trunk: trunks === 0 && d > 0.02 ? 1.0 : 0, stumps: 2, rocks: 1 });
        if (type === 'trunk') {
          trunks++;
          W.hangingTrunk(c, b, z);
          W.shellLine(c, rand(-hw + 3, hw - 3), z - 3, 4, 3, () => 0.3);
          return;
        }
        if (type === 'logs') {
          const len = rand(6, 11);
          const side = g > 0 ? -1 : 1;
          const x = clamp(g + side * (W.gapHalf() + len / 2), -hw + len / 2 - 1, hw - len / 2 + 1);
          W.floatingLog(c, b, x, z, len);
          if (chance(0.5)) {
            const len2 = rand(4, 6);
            const x2 = clamp(g - side * (W.gapHalf() + len2 / 2), -hw + len2 / 2 - 1, hw - len2 / 2 + 1);
            if (Math.abs(x2 - x) > (len + len2) / 2) W.floatingLog(c, b, x2, z - 4, len2);
          }
        } else if (type === 'stumps') {
          const n = randi(2, 4);
          for (let k = 0; k < n; k++) {
            const x = W.freeX(c, g, 0.5);
            if (x == null) continue;
            const zz = z + rand(-2, 2);
            b.add(G.cyl6, mat(x, lvl + 1.2, zz, rand(-0.4, 0.4), 0, rand(-0.4, 0.4), 0.35, 3.2, 0.35), '#9a4f2a');
            W.addOb(c, { kind: 'stump', x, z: zz, hw: 0.45, hd: 0.45, yMin: -3, yMax: 3 });
          }
        } else {
          for (let k = 0; k < 2; k++) {
            const x = W.freeX(c, g, 1.2);
            if (x != null) W.rockOb(c, b, x, z, chance(0.4));
          }
        }
        if (chance(0.7)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.25)) W.maybePowerup(c, g, z - 2);
      });
    },

    village(W, c, b) {
      const hw = c.width / 2;
      const lvl = c.level;
      for (let z = c.z0 - 4; z > c.z1; z -= rand(9, 14)) {
        for (const s of [-1, 1]) {
          if (chance(0.75)) P.hut(b, s * (hw + rand(3.5, 7)), lvl + 0.6, z, rand(-0.3, 0.3));
          if (chance(0.5)) P.dock(b, s * (hw + 0.5), lvl, z + rand(-4, 4), 5);
          if (chance(0.4)) P.palm(b, s * (hw + rand(8, 14)), lvl + 0.6, z + 3, rand(6, 9));
          if (chance(0.4)) P.barrel(b, s * (hw + rand(1, 3)), lvl + 0.6, z + rand(-3, 3));
          if (chance(0.3)) P.crate(b, s * (hw + rand(1, 3)), lvl + 0.6, z + rand(-3, 3));
          if (chance(0.3)) P.boat(b, s * (hw + 1.5), lvl - 0.3, z + rand(-4, 4), rand(-0.2, 0.2));
        }
      }
      W.rows(c, (z, d) => {
        const g = W.gap(c);
        const type = WR.weighted({ boat: 2.5, dock: 1.4, buoys: 1.4, trash: 1.6, rocks: 0.7 });
        if (type === 'boat') {
          const n = c.width > 24 && chance(0.4) ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const x = W.freeX(c, g, 1.5);
            if (x == null) continue;
            const zz = z + rand(-2, 2) - k * 5;
            P.boat(b, x, lvl - 0.25, zz, rand(-0.12, 0.12) + (chance(0.5) ? Math.PI : 0));
            W.addOb(c, { kind: 'boat', x, z: zz, hw: 1.3, hd: 2.9, yMin: -3, yMax: 0.8, top: 0.8, boat: true });
            if (chance(0.5)) W.addItem(c, 'shell', x, 2.0, zz);
          }
        } else if (type === 'dock') {
          const s = g > 0 ? -1 : 1;
          const len = Math.min(rand(6, 10), hw - W.gapHalf() + Math.abs(g) - 1);
          const x = s * (hw - len / 2 + 1.5);
          P.dock(b, x, lvl, z, len + 3);
          W.addOb(c, { kind: 'dock', x, z, hw: (len + 3) / 2, hd: 1.2, yMin: -3, yMax: 0.85, top: 0.85 });
          if (chance(0.5)) W.shellLine(c, x, z + 0.5, 1, 3, () => 2.0);
        } else if (type === 'buoys') {
          const n = randi(2, 4);
          for (let k = 0; k < n; k++) {
            const x = W.freeX(c, g, 0.5);
            if (x == null) continue;
            P.buoy(b, x, lvl, z + rand(-1, 1));
            W.addOb(c, { kind: 'buoy', x, z, hw: 0.5, hd: 0.5, yMin: -3, yMax: 0.7 });
          }
        } else if (type === 'trash') {
          for (let k = 0; k < randi(3, 6); k++) W.addItem(c, 'trash', clamp(g + rand(-3, 3), -hw + 1, hw - 1), 0.05, z + rand(-4, 4), { r: 0.6 });
        } else {
          for (let k = 0; k < 2; k++) {
            const x = W.freeX(c, g, 1.2);
            if (x != null) W.rockOb(c, b, x, z, chance(0.4));
          }
        }
        if (chance(0.3)) W.addItem(c, 'trash', rand(-hw + 1, hw - 1), 0.05, z - rand(3, 6), { r: 0.6 });
        if (chance(0.65)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.25)) W.maybePowerup(c, g, z - 2);
      });
    },

    city(W, c, b) {
      const hw = c.width / 2;
      const lvl = c.level;
      for (let z = c.z0 - 3; z > c.z1; z -= rand(8, 13)) {
        for (const s of [-1, 1]) {
          if (chance(0.7)) P.building(b, s * (hw + rand(3, 10)), lvl - 1, z, rand(4, 6), rand(10, 22), rand(4, 6), rand(-0.15, 0.15), -s * rand(0.1, 0.45));
          if (chance(0.4)) P.pillar(b, s * (hw + rand(1, 3)), lvl, z + rand(-3, 3), rand(2, 5));
          if (chance(0.4)) P.rock(b, s * (hw + rand(1, 5)), lvl + 0.5, z, rand(1, 2), 0.8, rand(1, 2), '#bdb3a0');
          if (chance(0.3)) P.palm(b, s * (hw + rand(4, 12)), lvl + 0.6, z + 4, rand(5, 8));
        }
      }
      W.rows(c, (z, d) => {
        const g = W.gap(c);
        const type = WR.weighted({ tower: 1.3, slab: 1.2, wreck: 2, crates: 1.4, pillar: 1.4, trash: 0.8 });
        if (type === 'tower') {
          const s = g > 0 ? -1 : 1;
          const x = s * rand(hw - 6, hw - 3.5);
          if (Math.abs(x - g) > W.gapHalf() + 3) {
            P.building(b, x, lvl - 1.5, z, 5, rand(14, 22), 5, rand(-0.1, 0.1), -s * rand(0.2, 0.4));
            W.addOb(c, { kind: 'tower', x, z, hw: 2.7, hd: 2.7, yMin: -3, yMax: 40 });
          }
        } else if (type === 'slab') {
          const s = g > 0 ? -1 : 1;
          const len = rand(7, 11);
          const x = clamp(g + s * (W.gapHalf() + len / 2), -hw + len / 2 - 1, hw - len / 2 + 1);
          b.add(G.box, mat(x, lvl + 0.1, z, 0, 0, rand(-0.04, 0.04), len, 1.6, 4.4), '#3b6bb5', 0.08);
          for (let k = -len / 2 + 1; k < len / 2; k += 2) b.add(G.box, mat(x + k, lvl + 0.92, z, 0, 0, 0, 1.1, 0.06, 4.0), '#9fd0f2');
          W.addOb(c, { kind: 'slab', x, z, hw: len / 2, hd: 2.2, yMin: -3, yMax: 0.9, top: 0.9 });
        } else if (type === 'wreck') {
          const x = W.freeX(c, g, 1.6);
          if (x != null) {
            P.boat(b, x, lvl - 0.5, z, rand(-0.6, 0.6) + (chance(0.5) ? Math.PI : 0), rand(-0.45, 0.45), true);
            W.addOb(c, { kind: 'wreck', x, z, hw: 1.6, hd: 2.8, yMin: -3, yMax: 2.5 });
          }
        } else if (type === 'crates') {
          for (let k = 0; k < randi(2, 4); k++) {
            const x = W.freeX(c, g, 0.7);
            if (x == null) continue;
            const zz = z + rand(-1.5, 1.5);
            P.crate(b, x, lvl - 0.2, zz, 1.2);
            W.addOb(c, { kind: 'crate', x, z: zz, hw: 0.7, hd: 0.7, yMin: -3, yMax: 0.75 });
          }
        } else if (type === 'pillar') {
          for (let k = 0; k < randi(1, 3); k++) {
            const x = W.freeX(c, g, 0.8);
            if (x == null) continue;
            P.pillar(b, x, lvl - 0.5, z, rand(3, 7));
            W.addOb(c, { kind: 'pillar', x, z, hw: 0.8, hd: 0.8, yMin: -3, yMax: 20 });
          }
        } else {
          for (let k = 0; k < randi(3, 5); k++) W.addItem(c, 'trash', clamp(g + rand(-3, 3), -hw + 1, hw - 1), 0.05, z + rand(-3, 3), { r: 0.6 });
        }
        if (chance(0.7)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.25)) W.maybePowerup(c, g, z - 2);
      });
    },

    ravine(W, c, b) {
      const hw = c.width / 2;
      for (let z = c.z0; z > c.z1; z -= rand(6, 10)) if (chance(0.5)) P.reeds(b, (chance(0.5) ? -1 : 1) * (hw - 0.4), c.level, z, 4);
      W.rows(c, (z) => {
        const g = W.gap(c);
        const n = randi(1, 3);
        for (let k = 0; k < n; k++) {
          const x = W.freeX(c, g, 1.0);
          if (x != null) W.rockOb(c, b, x, z + rand(-1, 1), chance(0.45));
        }
        if (chance(0.75)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.2)) W.maybePowerup(c, g, z - 2);
      }, { spacing: 0.9 });
    },

    sewer(W, c, b, spec) {
      const hw = c.width / 2;
      const lvl = c.level;
      const brick = ['#6f625a', '#665a52', '#5d524b'];
      const z0 = c.z0, z1 = c.z1, zm = (z0 + z1) / 2, len = z0 - z1;
      for (const s of [-1, 1]) {
        b.add(G.box, mat(s * (hw + 1.3), lvl + 0.55, zm, 0, 0, 0, 2.6, 1.1, len), '#857a70', 0.08);
        for (let z = z0; z > z1; z -= 3) b.add(G.box, mat(s * (hw + 3), lvl + 4, z - 1.5, 0, 0, 0, 1.4, 9, 3.02), pick(brick), 0.12);
        b.add(G.cyl8, mat(s * (hw + 2), lvl + 5.5, zm, Math.PI / 2, 0, 0, 0.45, len, 0.45), '#4f6a5a');
        b.add(G.cyl8, mat(s * (hw + 2.1), lvl + 2.4, zm, Math.PI / 2, 0, 0, 0.3, len, 0.3), '#7a5a3a');
        for (let z = z0 - 5; z > z1; z -= 10) b.add(G.box, mat(s * (hw + 2.25), lvl + 6.8, z, 0, 0, 0, 0.15, 0.6, 0.6), '#ffe38a', 0);
      }
      for (let z = z0; z > z1; z -= 3) b.add(G.box, mat(0, lvl + 8.6, z - 1.5, 0, 0, 0, c.width + 8, 1.4, 3.02), pick(brick), 0.12);
      for (let z = z0 - 1; z > z1; z -= 6) b.add(G.box, mat(0, lvl + 7.8, z, 0, 0, 0, c.width + 6, 0.3, 0.5), '#4a403a');
      const facade = (z) => {
        b.add(G.box, mat(0, lvl + 15, z, 0, 0, 0, c.width + 60, 13, 3), '#8d857b', 0.1);
        for (const s of [-1, 1]) b.add(G.box, mat(s * (hw + 16), lvl + 4, z, 0, 0, 0, 28, 10, 3), '#8d857b', 0.1);
        b.add(G.arch, mat(0, lvl + 6.5, z + 1.6, 0, 0, 0, hw + 1, 2.2, 3), '#a39a8f');
      };
      if (spec.start) facade(z0 - 1);
      if (spec.end) facade(z1 + 1);
      W.rows(c, (z, d) => {
        const g = W.gap(c);
        const type = WR.weighted({ pipe: 1.3, grate: 1.3, barrels: 1.5, trash: 1.8 });
        if (type === 'pipe') {
          const full = chance(0.35);
          if (full) {
            b.add(G.cyl8, mat(0, lvl + 1.6, z, 0, 0, Math.PI / 2, 0.5, c.width + 4, 0.5), '#5a7a68', 0.08);
            W.addOb(c, { kind: 'pipe', x: 0, z, hw: hw + 1, hd: 0.5, yMin: 1.0, yMax: 2.3 });
          } else {
            const s = g > 0 ? -1 : 1;
            const len = hw + Math.abs(g) - W.gapHalf();
            const x = s * (hw - len / 2);
            b.add(G.cyl8, mat(x, lvl + 0.35, z, 0, 0, Math.PI / 2, 0.5, len, 0.5), '#5a7a68', 0.08);
            W.addOb(c, { kind: 'pipe', x, z, hw: len / 2, hd: 0.5, yMin: -0.2, yMax: 0.85 });
          }
        } else if (type === 'grate') {
          const s = g > 0 ? -1 : 1;
          const len = hw + Math.abs(g) - W.gapHalf();
          const x = s * (hw - len / 2);
          b.add(G.box, mat(x, lvl + 0.2, z, 0, 0, 0, len, 1.0, 0.3), '#3d3d3d');
          for (let k = -len / 2; k < len / 2; k += 0.6) b.add(G.box, mat(x + k, lvl + 0.2, z, 0, 0, 0, 0.12, 1.1, 0.36), '#555555');
          W.addOb(c, { kind: 'grate', x, z, hw: len / 2, hd: 0.3, yMin: -3, yMax: 0.75 });
        } else if (type === 'barrels') {
          for (let k = 0; k < randi(2, 3); k++) {
            const x = W.freeX(c, g, 0.6);
            if (x == null) continue;
            P.barrel(b, x, lvl - 0.2, z);
            W.addOb(c, { kind: 'barrel', x, z, hw: 0.55, hd: 0.55, yMin: -3, yMax: 0.75 });
          }
        } else {
          for (let k = 0; k < randi(3, 6); k++) W.addItem(c, 'trash', clamp(g + rand(-3, 3), -hw + 1, hw - 1), 0.05, z + rand(-3, 3), { r: 0.6 });
        }
        if (chance(0.7)) W.shellLine(c, g, z - 4, randi(3, 5), 3);
        if (chance(0.2)) W.maybePowerup(c, g, z - 2);
      }, { spacing: 0.95 });
    },

    waterfall(W, c, b) {
      const hw = c.width / 2;
      const lvl = c.level;
      W.rows(c, (z) => {
        const g = W.gap(c);
        for (let k = 0; k < 2; k++) {
          const x = W.freeX(c, g, 1);
          if (x != null) W.rockOb(c, b, x, z, chance(0.3));
        }
        W.shellLine(c, g, z - 4, 3, 3);
      }, { endPad: 28 });
      for (const s of [-1, 1]) {
        P.sign(b, s * (hw + 1.8), lvl + 0.6, c.z1 + 22, 'warn', s * -0.3);
        P.rock(b, s * (hw - 0.5), lvl + 0.5, c.z1 + 0.5, 2.4, 2.2, 2.4);
        for (let k = 0; k < 8; k++) P.rock(b, s * (hw + 1 + k * 5), lvl - FALL_H / 2, c.z1 + rand(-1.5, 1.5), rand(3, 5), FALL_H / 2 + rand(1, 3), rand(3, 4), pick(CLIFF));
        P.palm(b, s * (hw + 4), lvl + 0.6, c.z1 + 6, 8);
      }
      // the drop: curtain over the edge, foam and mist below
      const cur = W.curtain(c, 0, lvl + 0.1, c.z1 - 0.6, c.width + 1, FALL_H + 0.6);
      cur.rotation.x = 0.12;
      b.add(G.box, mat(0, lvl + 0.08, c.z1 + 0.4, 0, 0, 0, c.width, 0.12, 0.9), '#f4ffff', 0);
      W.mist(c, 0, lvl - FALL_H + 0.5, c.z1 - 3, 9, 7);
      // shells tracing the fall
      for (let k = 0; k < 8; k++) {
        const t = k * 0.13;
        W.addItem(c, 'shell', 0, 1 - 0.5 * 26 * t * t, c.z1 - 3 - k * 3.4);
      }
      W.addItem(c, 'shell', 0, 0.9, c.z1 + 8);
      W.addItem(c, 'shell', 0, 0.9, c.z1 + 4);
    },
  };

  World.prototype.update = function (playerZ, dt) {
    this.time += dt;
    this.waterMat.uniforms.uTime.value = this.time;
    this.fallMat.uniforms.uTime.value = this.time;
    while (this.chunks.length && this.chunks[this.chunks.length - 1].z1 > playerZ - AHEAD * L) this.makeChunk();
    while (this.chunks.length > 2 && this.chunks[0].z1 > playerZ + 60) this.disposeChunk(this.chunks.shift());
    const t = this.time;
    for (const c of this.chunks) {
      for (const a of c.anim) {
        if (a.kind === 'wheel') a.o.rotation.x -= dt * 0.6;
        else if (a.kind === 'mist') {
          a.o.position.y = a.base + Math.sin(t * 0.8 + a.ph) * 0.6;
          a.o.material.opacity = 0.6;
        }
      }
      for (const it of c.items) {
        if (!it.alive) continue;
        const m = it.mesh;
        if (it.type === 'shell') {
          m.children[0].rotation.y = t * 2.4 + it.ph;
          if (!it.pulled) m.position.y = it.level + it.y + Math.sin(t * 3 + it.ph) * 0.12;
        } else if (it.type === 'bubble') {
          m.position.y = it.level + it.y + Math.sin(t * 2 + it.ph) * 0.2;
          m.children[1].material.rotation = Math.sin(t * 2 + it.ph) * 0.2;
        } else if (it.type === 'turtle') {
          it.x = it.x0 + Math.sin(t * 0.6 + it.ph) * it.swim;
          m.position.x = it.x;
          m.rotation.y = Math.PI + Math.cos(t * 0.6 + it.ph) * 0.5;
          m.position.y = it.level + it.y + Math.sin(t * 2 + it.ph) * 0.05;
        } else if (it.type === 'trash') {
          m.position.y = it.level + it.y + Math.sin(t * 2.2 + it.ph) * 0.08;
          m.rotation.z = Math.sin(t * 1.7 + it.ph) * 0.2;
        }
      }
    }
  };

  World.prototype.chunkAt = function (z) {
    const cs = this.chunks;
    if (!cs.length) return null;
    if (z > cs[0].z0) return cs[0];
    for (const c of cs) if (z <= c.z0 && z > c.z1) return c;
    return cs[cs.length - 1];
  };
  World.prototype.levelAt = function (z) {
    const c = this.chunkAt(z);
    return c ? c.level : 0;
  };

  WR.World = World;
})();
