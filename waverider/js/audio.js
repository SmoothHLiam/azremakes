// Synthesized sound effects and a light tropical music loop (Web Audio, no files needed).
(function () {
  const WR = window.WR;

  const A = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noise: null,
    soundOn: true,
    musicOn: true,
    ride: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const ctx = (this.ctx = new C());
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);

      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;

      // continuous water rush while riding
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4000;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp).connect(lp).connect(g).connect(this.sfxBus);
      src.start();
      this.ride = { g, lp, bp };

      this.applySettings();
      this.startMusic();
    },

    applySettings() {
      const s = WR.Save.data.settings;
      this.soundOn = s.sound;
      this.musicOn = s.music;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sfxBus.gain.setTargetAtTime(this.soundOn ? 1 : 0, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, t, 0.1);
    },

    setRide(level, underwater) {
      if (!this.ride) return;
      const t = this.ctx.currentTime;
      this.ride.g.gain.setTargetAtTime(level * 0.16, t, 0.1);
      this.ride.lp.frequency.setTargetAtTime(underwater ? 350 : 4000, t, 0.08);
    },

    tone(freq, dur, opts = {}) {
      if (!this.ctx || !this.soundOn) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.delay || 0);
      const o = ctx.createOscillator();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
      const g = ctx.createGain();
      const v = opts.vol == null ? 0.25 : opts.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (opts.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(opts.bus || this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hiss(dur, freq, opts = {}) {
      if (!this.ctx || !this.soundOn) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.delay || 0);
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.playbackRate.value = opts.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = opts.filter || 'bandpass';
      f.frequency.setValueAtTime(freq, t);
      if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
      f.Q.value = opts.q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(opts.vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.sfxBus);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
    },

    play(name, arg) {
      switch (name) {
        case 'click':
          this.tone(660, 0.08, { type: 'triangle', vol: 0.15 });
          break;
        case 'jump':
          this.hiss(0.35, 1800, { to: 600, vol: 0.25 });
          this.tone(300, 0.2, { to: 520, type: 'triangle', vol: 0.08 });
          break;
        case 'land':
          this.hiss(0.4, 1200, { to: 300, vol: 0.35, q: 0.7 });
          break;
        case 'dive':
          this.hiss(0.5, 700, { to: 200, vol: 0.3, filter: 'lowpass' });
          for (let i = 0; i < 4; i++) this.tone(400 + Math.random() * 500, 0.06, { delay: i * 0.07, vol: 0.06 });
          break;
        case 'shell': {
          const k = Math.min(arg || 0, 12);
          const f = 880 * Math.pow(2, (k % 8) / 12);
          this.tone(f, 0.12, { type: 'triangle', vol: 0.14 });
          this.tone(f * 1.5, 0.18, { type: 'sine', vol: 0.1, delay: 0.05 });
          break;
        }
        case 'power':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { type: 'square', vol: 0.06, delay: i * 0.06 }));
          break;
        case 'hit':
          this.tone(140, 0.25, { to: 60, type: 'square', vol: 0.18 });
          this.hiss(0.25, 2500, { vol: 0.25, q: 2 });
          break;
        case 'crash':
          this.tone(180, 0.6, { to: 40, type: 'sawtooth', vol: 0.18 });
          this.hiss(0.9, 900, { to: 150, vol: 0.45, filter: 'lowpass' });
          break;
        case 'smash':
          this.hiss(0.18, 3000, { vol: 0.25, q: 3 });
          this.tone(900, 0.08, { to: 300, type: 'square', vol: 0.06 });
          break;
        case 'launch':
          this.tone(200, 0.6, { to: 900, type: 'triangle', vol: 0.16 });
          this.hiss(0.6, 600, { to: 2400, vol: 0.25 });
          break;
        case 'shieldbreak':
          this.tone(1200, 0.3, { to: 400, type: 'triangle', vol: 0.15 });
          break;
        case 'tick':
          this.tone(1000, 0.05, { type: 'square', vol: 0.05 });
          break;
        case 'buy':
          [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.08 }));
          break;
        case 'toast':
          this.tone(1046, 0.12, { type: 'triangle', vol: 0.1 });
          this.tone(1568, 0.25, { type: 'triangle', vol: 0.1, delay: 0.1 });
          break;
      }
    },

    // ---- music: a simple pentatonic marimba groove generated on the fly ----
    startMusic() {
      const ctx = this.ctx;
      const bpm = 112;
      const step = 60 / bpm / 2; // eighth notes
      const chords = [
        [60, 64, 67], // C
        [57, 60, 64], // Am
        [53, 57, 60], // F
        [55, 59, 62], // G
      ];
      const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
      const rnd = WR.seeded(7);
      const melody = [];
      for (let bar = 0; bar < 8; bar++) {
        for (let s = 0; s < 8; s++) melody.push(rnd() < (s % 2 ? 0.45 : 0.75) ? scale[Math.floor(rnd() * scale.length)] : null);
      }
      let i = 0;
      let next = ctx.currentTime + 0.1;
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const marimba = (m, t, v) => {
        const o = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o2.type = 'sine';
        o.frequency.value = mtof(m);
        o2.frequency.value = mtof(m) * 4;
        const g2 = ctx.createGain();
        g2.gain.value = 0.15;
        o2.connect(g2).connect(g);
        o.connect(g);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        g.connect(this.musicBus);
        o.start(t);
        o2.start(t);
        o.stop(t + 0.4);
        o2.stop(t + 0.4);
      };
      const bass = (m, t) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(m - 24);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8);
        o.connect(g).connect(this.musicBus);
        o.start(t);
        o.stop(t + step * 2);
      };
      const shaker = (t, v) => {
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(f).connect(g).connect(this.musicBus);
        s.start(t, Math.random());
        s.stop(t + 0.06);
      };
      setInterval(() => {
        if (!this.musicOn || ctx.state !== 'running') {
          next = ctx.currentTime + 0.1;
          return;
        }
        while (next < ctx.currentTime + 0.25) {
          const bar = Math.floor(i / 8) % 4;
          const s = i % 8;
          const chord = chords[bar];
          if (s === 0 || s === 3 || s === 6) bass(chord[0], next);
          if (s % 2 === 1) marimba(chord[(s >> 1) % 3] + 12, next, 0.12);
          const mel = melody[i % melody.length];
          if (mel) marimba(mel + 12, next, 0.16);
          shaker(next, s % 2 ? 0.05 : 0.09);
          next += step;
          i++;
        }
      }, 60);
    },
  };

  WR.Audio = A;
})();
