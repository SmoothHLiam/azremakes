// Core game: renderer, sky, player physics, collisions, camera, HUD, run lifecycle.
(function () {
  const WR = window.WR;
  const { clamp, lerp, rand, damp, TAU } = WR;
  const UNIT_PER_M = 5;
  const JUMP_V = 10;
  const GRAV = 24;
  const DIVE_DEPTH = 1.7;
  const DIVE_TIME = 0.75;
  const POWER_TIME = 15;

  // ---------------- board meshes ----------------
  function boardShape() {
    const s = new THREE.Shape();
    const N = 24;
    const hw = (u) => 0.75 * Math.sqrt(Math.sin(Math.PI * (0.08 + 0.92 * u)));
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      s[i ? 'lineTo' : 'moveTo'](hw(u), -3 + u * 6);
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N;
      s.lineTo(-hw(u), -3 + u * 6);
    }
    return s;
  }
  function boardMesh() {
    const g = new THREE.ExtrudeGeometry(boardShape(), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: WR.Tex.boardTexture('classic') });
    const m = new THREE.Mesh(g, mat);
    return m;
  }
  function applyBoardTexture(mesh, id, broken) {
    const t = WR.Tex.boardTexture(id, broken);
    t.repeat.set(1 / 1.5, 1 / 6);
    t.offset.set(0.5, 0.5);
    mesh.material.map = t;
    mesh.material.needsUpdate = true;
  }

  // ---------------- particles ----------------
  class Particles {
    constructor(scene, max = 500) {
      this.max = max;
      this.pos = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.vel = new Float32Array(max * 3);
      this.life = new Float32Array(max);
      this.grav = new Float32Array(max);
      this.n = 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      this.geo = g;
      this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.3, map: WR.Tex.dot, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 }));
      this.points.frustumCulled = false;
      scene.add(this.points);
      this.cursor = 0;
    }
    emit(x, y, z, vx, vy, vz, color, life = 0.6, grav = 12) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      this.col[i * 3] = color.r;
      this.col[i * 3 + 1] = color.g;
      this.col[i * 3 + 2] = color.b;
      this.life[i] = life;
      this.grav[i] = grav;
    }
    burst(x, y, z, n, color, spd = 5, life = 0.7, grav = 14) {
      for (let k = 0; k < n; k++) {
        const a = rand(0, TAU);
        const s = rand(0.3, 1) * spd;
        this.emit(x, y, z, Math.cos(a) * s, rand(0.4, 1.2) * spd, Math.sin(a) * s, color, life * rand(0.6, 1.2), grav);
      }
    }
    update(dt) {
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) {
          this.pos[i * 3 + 1] = -9999;
          continue;
        }
        this.life[i] -= dt;
        this.vel[i * 3 + 1] -= this.grav[i] * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    clear() {
      this.life.fill(0);
    }
  }

  // ---------------- sky ----------------
  function makeSky(scene) {
    const g = new THREE.SphereGeometry(900, 24, 12);
    const m = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#3fb4ec') }, mid: { value: new THREE.Color('#8fdcf5') }, bottom: { value: new THREE.Color('#d6f4f6') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(g, m);
    sky.renderOrder = -10;
    scene.add(sky);

    const clouds = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: WR.pick(WR.Tex.clouds), fog: false, depthWrite: false, transparent: true }));
      const a = rand(-1.2, 1.2) + (i % 2 ? Math.PI : 0);
      const d = rand(420, 700);
      sp.position.set(Math.sin(a) * d, rand(80, 260), -Math.cos(a) * d);
      const s = rand(140, 260);
      sp.scale.set(s, s * 0.5, 1);
      clouds.add(sp);
    }
    scene.add(clouds);

    // rainbow near the start of every run
    const rg = new THREE.RingGeometry(150, 175, 64, 1, 0, Math.PI);
    const rm = new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform float uFade; varying vec2 vP; vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); } void main(){ float r = (length(vP)-150.0)/25.0; float a = smoothstep(0.0,0.15,r)*smoothstep(1.0,0.85,r)*0.35*uFade; a *= smoothstep(0.0, 60.0, vP.y); gl_FragColor = vec4(hue(0.8 - r*0.8), a); }',
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const rainbow = new THREE.Mesh(rg, rm);
    rainbow.renderOrder = -9;
    scene.add(rainbow);
    return { sky, clouds, rainbow };
  }

  // ---------------- Game ----------------
  const Game = {
    state: 'boot',
    init() {
      const canvas = document.getElementById('c');
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.scene = new THREE.Scene();
      this.fogColor = new THREE.Color('#cdeff4');
      this.scene.fog = new THREE.Fog(this.fogColor, 90, 440);
      this.scene.background = this.fogColor;
      this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
      this.scene.add(this.camera);
      this.hemi = new THREE.HemisphereLight('#ffffff', '#6b8f5a', 0.85);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight('#fff4e0', 0.75);
      this.sun.position.set(-40, 80, 30);
      this.scene.add(this.sun);
      this.skyObjs = makeSky(this.scene);

      this.world = new WR.World(this.scene);
      this.fx = new Particles(this.scene);

      // first-person board nose (child of the camera)
      this.nose = boardMesh();
      this.noseHolder = new THREE.Group();
      this.noseHolder.add(this.nose);
      this.camera.add(this.noseHolder);
      // third-person board used on the title screen and in the shop
      this.showBoard = boardMesh();
      this.scene.add(this.showBoard);
      this.shopBoard = boardMesh();
      this.shopBoard.visible = false;
      this.camera.add(this.shopBoard);

      this.keys = {};
      this.bindInput();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      this.refreshBoard();
      this.toTitle();
      this.last = performance.now();
      const loop = (t) => {
        const dt = Math.min(0.05, (t - this.last) / 1000);
        this.last = t;
        this.frame(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w / h < 1 ? 85 : 70;
      this.camera.updateProjectionMatrix();
    },

    refreshBoard() {
      const id = WR.Save.data.board;
      applyBoardTexture(this.showBoard, id);
      applyBoardTexture(this.nose, id, this.p ? { L: !this.p.L, R: !this.p.R } : null);
    },

    // ---------------- input ----------------
    bindInput() {
      const down = (e) => {
        const k = e.key.toLowerCase();
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
        if (this.keys[k]) return;
        this.keys[k] = true;
        WR.Audio.init();
        if (this.state === 'title' && (k === ' ' || k === 'enter') && !WR.UI.panelOpen()) this.startRun();
        else if (this.state === 'play') {
          if (k === 'arrowup' || k === 'w' || k === ' ') this.jump();
          if (k === 'arrowdown' || k === 's') this.dive();
          if (k === 'escape' || k === 'p') this.pause();
        } else if (this.state === 'tutorial') this.tutorialKey(k);
        else if (this.state === 'paused' && (k === 'escape' || k === 'p' || k === ' ')) this.resume();
        else if (this.state === 'results' && (k === ' ' || k === 'enter')) this.toTitle();
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));
      window.addEventListener('blur', () => {
        this.keys = {};
        if (this.state === 'play') this.pause();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'play') this.pause();
      });

      // touch: drag sideways to steer, swipe up to jump, swipe down to dive
      const el = document.getElementById('touch');
      this.touchSteer = 0;
      let sx = 0, sy = 0, st = 0, lx = 0, swiped = false;
      el.addEventListener('pointerdown', (e) => {
        WR.Audio.init();
        sx = lx = e.clientX;
        sy = e.clientY;
        st = performance.now();
        swiped = false;
        el.setPointerCapture(e.pointerId);
        if (this.state === 'title') this.startRun();
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'results') this.toTitle();
      });
      el.addEventListener('pointermove', (e) => {
        if (!e.buttons && e.pointerType === 'mouse') return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (this.state === 'tutorial' && this.tutWait === 'steer' && Math.abs(dx) > 25) this.tutorialKey(dx < 0 ? 'arrowleft' : 'arrowright');
        if (!swiped && Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.2 && performance.now() - st < 400) {
          swiped = true;
          const k = dy < 0 ? 'arrowup' : 'arrowdown';
          if (this.state === 'tutorial') this.tutorialKey(k);
          else if (this.state === 'play') dy < 0 ? this.jump() : this.dive();
        }
        this.touchSteer = clamp((e.clientX - lx) / 60, -1, 1);
        if (Math.abs(e.clientX - lx) > 60) lx = e.clientX - Math.sign(e.clientX - lx) * 60;
      });
      const end = () => (this.touchSteer = 0);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    },

    steerInput() {
      const k = this.keys;
      let s = 0;
      if (k['arrowleft'] || k['a']) s -= 1;
      if (k['arrowright'] || k['d']) s += 1;
      return clamp(s + this.touchSteer, -1, 1);
    },

    // ---------------- lifecycle ----------------
    toTitle() {
      this.state = 'title';
      this.mode = WR.Save.data.mode;
      this.world.reset({ mode: this.mode, tutorial: !WR.Save.data.tutorialDone });
      this.applyModeLook();
      this.fx.clear();
      this.p = null;
      this.noseHolder.visible = false;
      this.showBoard.visible = true;
      this.refreshBoard();
      this.camT = 0;
      this.snapCam = true;
      this.noseHolder.position.set(0, 0, 0);
      this.noseHolder.rotation.set(0, 0, 0);
      WR.Audio.setRide(0, false);
      WR.UI.showTitle();
    },

    applyModeLook() {
      const hard = this.mode === 'hard';
      this.fogColor.set(hard ? '#cfe9e2' : '#cdeff4');
      this.underColor = hard ? 'rgba(20,70,40,0.55)' : 'rgba(30,140,170,0.45)';
      this.sprayColor = new THREE.Color(hard ? '#cfe8d6' : '#e8fbff');
    },

    startRun() {
      if (this.state !== 'title') return;
      WR.Audio.init();
      WR.Audio.play('click');
      WR.UI.hideTitle();
      const b = WR.Save.board();
      this.stats = b;
      this.p = {
        x: 0, y: 0, z: 8, vx: 0, vy: 0, speed: 0, swerve: 0,
        air: false, diving: 0, diveQueued: false, onTop: null,
        L: true, R: true, invuln: 0,
        power: { freeze: 0, shield: 0, magnet: 0, star: 0 },
      };
      this.run = { score: 0, meters: 0, air: 0, shells: 0, nextPoint: 5, continues: 0, startT: performance.now() };
      this.shellCombo = 0;
      this.refreshBoard();
      this.state = 'intro';
      this.introT = 0;
      this.introFrom = this.camera.position.clone();
      this.introFromQ = this.camera.quaternion.clone();
      WR.UI.hud(true);
      this.updateHud(true);
    },

    pause() {
      if (this.state !== 'play') return;
      this.state = 'paused';
      WR.Audio.setRide(0, false);
      WR.UI.show('pause', true);
    },
    resume() {
      if (this.state !== 'paused') return;
      WR.UI.show('pause', false);
      this.state = 'play';
    },

    // ---------------- actions ----------------
    jump() {
      const p = this.p;
      if (!p || p.air) return;
      if (p.diving > 0 && p.y < this.level - 0.6) {
        // jumping out of a dive gives a small hop once surfaced
        p.diving = 0;
      }
      p.air = true;
      p.onTop = null;
      p.vy = JUMP_V;
      p.y = Math.max(p.y, this.level + (p.onTopY || 0));
      p.onTopY = 0;
      WR.Audio.play('jump');
      this.note(WR.Save.track('jumps'));
      this.splash(10);
    },
    dive() {
      const p = this.p;
      if (!p) return;
      if (p.air) {
        p.vy = Math.min(p.vy, -18);
        p.diveQueued = true;
        return;
      }
      if (p.diving > 0) return;
      p.diving = DIVE_TIME;
      p.onTop = null;
      p.onTopY = 0;
      WR.Audio.play('dive');
      this.note(WR.Save.track('dives'));
      this.splash(14);
    },

    // ---------------- per-frame ----------------
    frame(dt) {
      const st = this.state;
      if (st === 'title') this.updateTitle(dt);
      else if (st === 'intro') this.updateIntro(dt);
      else if (st === 'play') this.updatePlay(dt);
      else if (st === 'tutorial') this.updatePlay(dt * 0.0);
      else if (st === 'crash') this.updateCrash(dt);

      const camZ = this.camera.position.z;
      if (st !== 'paused') {
        this.world.update(this.p ? this.p.z : 0, dt);
        this.fx.update(dt);
      }
      // sky follows camera
      const so = this.skyObjs;
      so.sky.position.copy(this.camera.position);
      so.clouds.position.set(this.camera.position.x, this.camera.position.y * 0.5, camZ);
      const dist = this.p ? -this.p.z : 0;
      so.rainbow.position.set(-60, this.camera.position.y - 25, camZ - 420);
      so.rainbow.material.uniforms.uFade.value = clamp(1 - dist / 700, 0, 1);

      // tunnel lighting
      const cz = this.world.chunkAt(camZ);
      const dark = cz && cz.zone === 'sewer' ? 1 : 0;
      this.dark = damp(this.dark || 0, dark, 4, dt);
      this.hemi.intensity = lerp(0.85, 0.35, this.dark);
      this.sun.intensity = lerp(0.75, 0.15, this.dark);
      this.scene.fog.color.copy(this.fogColor).lerp(new THREE.Color('#2a2622'), this.dark * 0.85);

      // under water tint
      const lvl = this.world.levelAt(camZ);
      const under = this.camera.position.y < lvl + 0.05;
      WR.UI.underwater(under, this.underColor);
      if (this.state === 'play') WR.Audio.setRide(this.p.air ? 0.2 : clamp(this.p.speed / 30, 0, 1), under);

      this.renderer.render(this.scene, this.camera);
    },

    updateTitle(dt) {
      this.camT += dt;
      const t = this.camT;
      const shop = WR.UI.shopOpen;
      const target = shop ? new THREE.Vector3(-6, 6, 4) : new THREE.Vector3(10 + Math.sin(t * 0.15) * 0.8, 4.6, -7);
      const k = this.snapCam ? 1 : 1 - Math.exp(-dt * 3);
      this.camera.position.lerp(target, k);
      const look = shop ? new THREE.Vector3(6, 4, 22) : new THREE.Vector3(-3, 4.5, 16);
      const m = new THREE.Matrix4().lookAt(this.camera.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, k);
      this.snapCam = false;
      const lvl = this.world.levelAt(8);
      this.showBoard.position.set(1.5, lvl + 0.12 + Math.sin(t * 1.5) * 0.06, 6);
      this.showBoard.rotation.set(Math.sin(t * 1.2) * 0.04, 0.5 + Math.sin(t * 0.4) * 0.15, Math.sin(t * 1.4) * 0.05);
      this.showBoard.visible = !shop;
      this.shopBoard.visible = shop;
      if (shop) {
        this.shopBoard.position.set(1.4, -0.4, -6.5);
        this.shopBoard.rotation.set(0.9, 0.2 + Math.sin(t * 0.8) * 0.3, -0.7);
      }
    },

    updateIntro(dt) {
      this.introT += dt / 1.1;
      const t = clamp(this.introT, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = this.p;
      this.level = this.world.levelAt(p.z);
      const to = new THREE.Vector3(p.x, this.level + 1.55, p.z + 0.6);
      this.camera.position.lerpVectors(this.introFrom, to, e);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0, 'YXZ'));
      this.camera.quaternion.copy(this.introFromQ).slerp(q, e);
      this.showBoard.position.lerp(new THREE.Vector3(p.x, this.level + 0.1, p.z - 0.2), 1 - Math.exp(-dt * 6));
      this.showBoard.rotation.y = damp(this.showBoard.rotation.y, 0, 6, dt);
      if (t >= 1) {
        this.showBoard.visible = false;
        this.noseHolder.visible = true;
        this.state = 'play';
        this.note(WR.Save.track('games'));
      }
    },

    updatePlay(dt) {
      const p = this.p;
      const b = this.stats;
      const W = this.world;
      const hard = this.mode === 'hard';
      if (dt > 0) {
        for (const k in p.power) if (p.power[k] > 0) p.power[k] = Math.max(0, p.power[k] - dt);
        p.invuln = Math.max(0, p.invuln - dt);
      }

      // speed
      const m = this.run.meters;
      let target = (hard ? 26 : 22) * (0.88 + 0.26 * b.speed) * (1 + 0.55 * clamp(m / 1300, 0, 1));
      if (p.power.freeze > 0) target *= 0.75;
      const accel = 5 + 9 * b.accel;
      p.speed = p.speed < target ? Math.min(target, p.speed + accel * dt) : Math.max(target, p.speed - 8 * dt);

      // steering
      const steer = p.air ? this.steerInput() * 0.7 : this.steerInput();
      const turnMax = 11 + 9 * b.turn;
      p.vx = damp(p.vx, steer * turnMax, 9, dt);
      p.swerve = damp(p.swerve, 0, 5, dt);
      p.x += (p.vx + p.swerve) * dt;
      const chunk = W.chunkAt(p.z);
      // river banks act as soft walls (narrowing zones push you back in smoothly)
      const half = chunk.width / 2 - 1.3;
      if (p.x < -half) {
        p.x = Math.max(damp(p.x, -half, 10, dt), -half - 0.4);
        p.vx = Math.max(p.vx, 0);
      } else if (p.x > half) {
        p.x = Math.min(damp(p.x, half, 10, dt), half + 0.4);
        p.vx = Math.min(p.vx, 0);
      }

      // forward
      const dz = p.speed * dt;
      p.z -= dz;
      const dm = dz / UNIT_PER_M;
      this.run.meters += dm;
      if (p.air) this.run.air += dm;
      while (this.run.meters >= this.run.nextPoint) {
        this.run.nextPoint += 5;
        this.addScore(1);
      }

      // vertical
      const level = (this.level = W.levelAt(p.z));
      if (p.onTop) {
        const o = p.onTop;
        if (Math.abs(p.x - o.x) > o.hw + 0.4 || Math.abs(p.z - o.z) > o.hd + 0.6) {
          p.onTop = null;
          p.onTopY = 0;
          p.air = true;
          p.vy = 0;
        }
      }
      if (p.air) {
        p.vy -= GRAV * dt;
        p.y += p.vy * dt;
        const ground = level + (p.onTopY || 0);
        if (p.y <= ground && p.vy < 0) {
          p.y = ground;
          p.vy = 0;
          p.air = false;
          WR.Audio.play('land');
          this.splash(26);
          this.shake = 0.15;
          if (p.diveQueued) {
            p.diveQueued = false;
            p.diving = DIVE_TIME * 0.7;
          }
        }
      } else if (p.diving > 0) {
        p.diving -= dt;
        p.y = damp(p.y, level - DIVE_DEPTH, 14, dt);
      } else if (p.onTop) {
        p.y = level + p.onTopY;
      } else {
        p.y = damp(p.y, level, 10, dt);
        if (p.y > level + 0.4) p.air = true; // ran off a waterfall edge
      }
      if (!p.air && p.y > level + 0.25 && !p.onTop) p.air = true;

      this.collide(dt);
      if (this.state !== 'play' && this.state !== 'tutorial') return;
      this.items(dt);
      this.zones();
      this.checkTutorial();
      this.spray(dt);
      this.updateCamera(dt);
      this.updateHud();
    },

    addScore(n) {
      const mult = this.p.power.star > 0 ? 2 : 1;
      this.run.score += n * mult;
    },

    // player box vs obstacle boxes
    collide() {
      const p = this.p;
      const W = this.world;
      const phw = 0.6, phd = 0.9;
      const pz = p.z - 0.6;
      const py = p.y - this.level;
      const pTop = py + 1.1;
      for (const c of W.chunks) {
        if (c.z1 > pz + 8 || c.z0 < pz - 8) continue;
        for (const o of c.obstacles) {
          const dx = o.x - p.x, dzz = o.z - pz;
          if (Math.abs(dx) > phw + o.hw || Math.abs(dzz) > phd + o.hd) continue;
          const oy = o.level - this.level;
          // landing on top of boats, docks, slabs
          if (o.top != null && p.air && p.vy <= 0 && p.y >= o.level + o.top - 0.35) {
            p.air = false;
            p.vy = 0;
            p.onTop = o;
            p.onTopY = o.level + o.top - this.level;
            p.y = o.level + o.top;
            WR.Audio.play('land');
            this.shake = 0.12;
            if (o.boat && !o.landed) {
              o.landed = true;
              this.note(WR.Save.track('boats'));
            }
            continue;
          }
          if (p.onTop === o) continue;
          if (pTop <= o.yMin + oy || py >= o.yMax + oy) continue;
          if (W.time - o.hitT < 0.7) continue;
          this.hit(o, dx);
          if (this.state !== 'play') return;
        }
      }
    },

    hit(o, dx) {
      const p = this.p;
      o.hitT = this.world.time;
      if (p.invuln > 0) return;
      if (p.power.shield > 0) {
        p.power.shield = 0;
        WR.Audio.play('shieldbreak');
        this.fx.burst(p.x, p.y + 1, p.z - 2, 30, new THREE.Color('#bfe9ff'), 6);
        WR.UI.flash('rgba(160,220,255,0.5)');
        p.invuln = 0.6;
        return;
      }
      const headOn = Math.abs(dx) < o.hw * 0.55 + 0.2;
      const side = dx < 0 ? 'L' : 'R';
      if (headOn || !p[side]) {
        this.crash();
        return;
      }
      p[side] = false;
      this.refreshBoard();
      p.swerve = (side === 'L' ? 1 : -1) * 11;
      p.vx = 0;
      p.speed *= 0.82;
      this.shake = 0.35;
      WR.Audio.play('hit');
      WR.UI.flash('rgba(255,150,60,0.35)');
      this.fx.burst(p.x + (side === 'L' ? -0.6 : 0.6), p.y + 0.6, p.z - 2.5, 24, new THREE.Color('#ff8a2a'), 5, 0.6);
    },

    crash() {
      const p = this.p;
      this.state = 'crash';
      this.crashT = 0;
      WR.Audio.play('crash');
      WR.Audio.setRide(0, false);
      this.shake = 0.6;
      this.fx.burst(p.x, p.y + 0.8, p.z - 2.5, 50, new THREE.Color('#ff8a2a'), 7, 0.9);
      this.fx.burst(p.x, p.y + 0.4, p.z - 2.5, 40, this.sprayColor, 6, 0.8);
      this.crashFrom = this.camera.position.clone();
      this.crashRot = this.camera.rotation.clone();
    },

    updateCrash(dt) {
      this.crashT += dt;
      const t = clamp(this.crashT / 1.1, 0, 1);
      const p = this.p;
      const lvl = this.world.levelAt(p.z);
      p.z -= p.speed * dt * (1 - t);
      this.camera.position.set(this.crashFrom.x, lerp(this.crashFrom.y, lvl + 0.35, t * t), lerp(this.crashFrom.z, p.z + 2, t));
      this.camera.rotation.set(lerp(this.crashRot.x, -0.9, t), this.crashRot.y + t * 0.6, this.crashRot.z + t * 0.9, 'YXZ');
      this.noseHolder.position.set(t * 1.2, -t * 0.5 + Math.sin(t * Math.PI) * 1.2, -t * 2);
      this.noseHolder.rotation.set(t * 2.2, t * 1.5, t * 2.8);
      if (this.crashT > 1.3) {
        this.state = 'continue';
        WR.UI.showContinue(this.continueCost());
      }
    },

    continueCost() {
      return 50 * Math.pow(2, this.run.continues);
    },
    doContinue() {
      const cost = this.continueCost();
      if (WR.Save.data.shells < cost) return false;
      WR.Save.addShells(-cost);
      this.run.continues++;
      this.note(WR.Save.track('continues'));
      const p = this.p;
      p.L = p.R = true;
      p.invuln = 3;
      p.air = false;
      p.vy = 0;
      p.diving = 0;
      p.onTop = null;
      p.onTopY = 0;
      p.speed *= 0.5;
      p.y = this.world.levelAt(p.z);
      this.noseHolder.position.set(0, 0, 0);
      this.noseHolder.rotation.set(0, 0, 0);
      this.refreshBoard();
      this.state = 'play';
      WR.Audio.play('power');
      return true;
    },
    endRun() {
      const r = this.run;
      const S = WR.Save;
      const meters = Math.floor(r.meters);
      const prevBest = S.data.best[this.mode] || 0;
      const isBest = r.score > prevBest;
      if (isBest) S.data.best[this.mode] = r.score;
      this.note(S.trackMax('max_meters', meters));
      this.note(S.trackMax('max_air', Math.floor(r.air)));
      S.addRun({ name: S.data.name, score: r.score, meters, mode: this.mode, t: Date.now() });
      if (this.world.tutorial) S.data.tutorialDone = true;
      S.save();
      this.state = 'results';
      WR.UI.showResults({ score: r.score, best: Math.max(prevBest, r.score), isBest, meters, shells: r.shells, mode: this.mode });
    },

    // ---------------- items ----------------
    items(dt) {
      const p = this.p;
      const W = this.world;
      const pcx = p.x, pcy = p.y + 0.8, pcz = p.z - 1.6;
      const magnet = p.power.magnet > 0;
      for (const c of W.chunks) {
        if (c.z1 > p.z + 14 || c.z0 < p.z - 16) continue;
        for (const it of c.items) {
          if (!it.alive) continue;
          const m = it.mesh;
          const ix = m.position.x, iy = m.position.y, iz = m.position.z;
          if (it.type === 'shell') {
            if (magnet && Math.abs(iz - pcz) < 14 && Math.abs(ix - pcx) < 12) {
              it.pulled = true;
              const k = 1 - Math.exp(-dt * 9);
              m.position.x += (pcx - ix) * k;
              m.position.y += (pcy - iy) * k;
              m.position.z += (pcz - iz) * k;
            }
            if (Math.abs(m.position.x - pcx) < 1.2 && Math.abs(m.position.z - pcz) < 1.8 && Math.abs(m.position.y - pcy) < 1.5) {
              it.alive = false;
              m.visible = false;
              this.run.shells++;
              WR.Save.addShells(1);
              this.note(WR.Save.track('shells'));
              WR.Audio.play('shell', this.shellCombo++);
              clearTimeout(this._comboT);
              this._comboT = setTimeout(() => (this.shellCombo = 0), 900);
              this.fx.burst(m.position.x, m.position.y, m.position.z, 10, new THREE.Color('#ffd54a'), 3, 0.4, 4);
              WR.UI.bumpShells();
            }
          } else if (it.type === 'bubble') {
            if (Math.abs(ix - pcx) < 1.5 && Math.abs(iz - pcz) < 2 && Math.abs(iy - pcy) < 1.8) {
              it.alive = false;
              m.visible = false;
              this.powerup(it.power);
              this.fx.burst(ix, iy, iz, 24, new THREE.Color('#e6fbff'), 4, 0.5, 2);
            }
          } else if (it.type === 'trash') {
            if (Math.abs(ix - pcx) < 1.1 && Math.abs(iz - pcz) < 1.6 && p.y - it.level < 0.9 && p.y - it.level > -1) {
              it.alive = false;
              m.visible = false;
              this.addScore(1);
              WR.Audio.play('smash');
              this.note(WR.Save.track('trash'));
              ['#ff4fb0', '#5ee04a', '#ffffff'].forEach((col) => this.fx.burst(ix, iy + 0.3, iz, 8, new THREE.Color(col), 5, 0.5));
            }
          } else if (it.type === 'turtle') {
            if (!it.used && Math.abs(ix - pcx) < 1.7 && Math.abs(iz - pcz) < 2.2) {
              const rel = p.y - it.level;
              if (rel < 0.8) {
                it.used = true;
                p.onTop = null;
                p.onTopY = 0;
                if (rel < -0.3) {
                  p.diving = 0;
                  p.air = true;
                  p.vy = 19;
                  WR.Audio.play('launch');
                  this.note(WR.Save.track('turtles'));
                  this.fx.burst(ix, it.level + 0.3, iz, 30, this.sprayColor, 7, 0.8);
                } else {
                  p.air = true;
                  p.vy = 7;
                  WR.Audio.play('jump');
                }
              }
            }
          }
        }
      }
    },

    powerup(kind) {
      const p = this.p;
      WR.Audio.play('power');
      this.note(WR.Save.track('powerups'));
      if (kind === 'wrench') {
        if (!p.L) p.L = true;
        else if (!p.R) p.R = true;
        this.refreshBoard();
      } else {
        p.power[kind] = POWER_TIME;
      }
      WR.UI.powerToast(kind);
    },

    zones() {
      const p = this.p;
      for (const c of this.world.chunks) {
        if (!c.passed && p.z < c.z1) {
          c.passed = true;
          if (c.spec.end && c.zone !== 'start') this.note(WR.Save.track('zone_' + c.zone));
        }
        if (c.bridgeZ != null && !c.bridgeCounted && p.z < c.bridgeZ) {
          c.bridgeCounted = true;
          this.note(WR.Save.track('zone_bridge'));
        }
      }
    },

    // ---------------- first-run tutorial ----------------
    checkTutorial() {
      if (!this.world.tutorial || this.state !== 'play') return;
      const p = this.p;
      for (const c of this.world.chunks) {
        for (const o of c.obstacles) {
          if (!o.tut || o.tutDone) continue;
          const reach = { steer: 26, jump: 10, dive: 8 }[o.tut];
          if (o.z < p.z && p.z - o.z < reach) {
            o.tutDone = true;
            this.state = 'tutorial';
            this.tutWait = o.tut;
            WR.UI.tutorial(o.tut);
          }
        }
      }
    },
    tutorialKey(k) {
      const w = this.tutWait;
      const ok =
        (w === 'steer' && ['arrowleft', 'arrowright', 'a', 'd'].includes(k)) ||
        (w === 'jump' && ['arrowup', 'w', ' '].includes(k)) ||
        (w === 'dive' && ['arrowdown', 's'].includes(k));
      if (!ok) return;
      WR.UI.tutorial(null);
      this.state = 'play';
      if (w === 'jump') this.jump();
      if (w === 'dive') this.dive();
    },

    // ---------------- feel ----------------
    splash(n) {
      const p = this.p;
      for (let k = 0; k < n; k++) this.fx.emit(p.x + rand(-0.8, 0.8), this.level + 0.1, p.z - rand(1, 3), rand(-3, 3), rand(2, 5), rand(-1, 3), this.sprayColor, rand(0.4, 0.8));
    },
    spray(dt) {
      const p = this.p;
      if (dt <= 0 || p.air || p.diving > 0 || p.onTop) return;
      const n = Math.round(clamp(p.speed / 10, 1, 4));
      for (let k = 0; k < n; k++) {
        const s = Math.random() < 0.5 ? -1 : 1;
        this.fx.emit(p.x + s * rand(0.5, 0.8), this.level + 0.15, p.z - rand(1.6, 2.6), s * rand(1.5, 3.5) + p.vx * 0.3, rand(1.5, 3.2), p.speed * -0.25, this.sprayColor, rand(0.25, 0.45), 14);
      }
    },
    updateCamera(dt) {
      const p = this.p;
      const t = this.world.time;
      const bob = p.air || p.diving > 0 ? 0 : Math.sin(t * 7) * 0.035 + Math.sin(t * 3.1) * 0.03;
      this.shake = Math.max(0, (this.shake || 0) - dt);
      const sh = this.shake * 0.5;
      this.camera.position.set(p.x + rand(-sh, sh) * 0.3, p.y + 1.55 + bob + rand(-sh, sh) * 0.3, p.z + 0.6);
      const pitch = -0.12 + (p.air ? clamp(p.vy * 0.012, -0.25, 0.1) : 0);
      const yaw = -(p.vx + p.swerve) * 0.006;
      const roll = -(p.vx + p.swerve) * 0.013;
      this.camRoll = damp(this.camRoll || 0, roll, 8, dt);
      this.camera.rotation.set(pitch, yaw, this.camRoll, 'YXZ');
      // board nose follows the camera, leaning into turns
      const nh = this.noseHolder;
      nh.position.set(0, 0, 0);
      nh.rotation.set(0, 0, 0);
      this.nose.position.set(0, -1.15 - (p.air ? 0.05 : 0), -1.2);
      this.nose.rotation.set(0.12 + (p.air ? 0.08 : 0), (p.vx + p.swerve) * 0.004, (p.vx + p.swerve) * 0.012);
      // blink while invulnerable
      this.nose.visible = p.invuln > 0 ? Math.floor(t * 12) % 2 === 0 : true;
    },

    // ---------------- HUD ----------------
    updateHud(force) {
      const r = this.run;
      const p = this.p;
      WR.UI.setHud({
        meters: Math.floor(r.meters),
        score: r.score,
        x2: p.power.star > 0,
        powers: p.power,
        shield: p.power.shield > 0,
        force,
      });
    },
    note(notes) {
      if (notes && notes.length) notes.forEach((n) => WR.UI.toast(n));
    },
  };

  WR.Game = Game;
})();
