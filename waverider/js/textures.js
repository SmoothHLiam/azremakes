// Procedurally painted canvas textures: boards, icons, particles, clouds.
(function () {
  const WR = window.WR;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function star(ctx, cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro;
      const a = rot + (i * Math.PI) / n;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // ---------- Board paint jobs (all original designs) ----------
  // Canvas top = board nose, bottom = tail. 256 x 1024.
  const PAINT = {
    classic(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5b9cf0');
      g.addColorStop(0.5, '#3a74d6');
      g.addColorStop(1, '#2b5cb8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const cols = ['#ffffff', '#a9dcff', '#ffffff'];
      for (let i = 0; i < 3; i++) {
        const y = h * 0.16 + i * 62;
        ctx.beginPath();
        ctx.moveTo(-10, y + 70);
        ctx.lineTo(w / 2, y);
        ctx.lineTo(w + 10, y + 70);
        ctx.lineTo(w + 10, y + 96);
        ctx.lineTo(w / 2, y + 26);
        ctx.lineTo(-10, y + 96);
        ctx.closePath();
        ctx.fillStyle = cols[i];
        ctx.fill();
      }
      // scalloped foam band
      const y0 = h * 0.43;
      ctx.fillStyle = '#7fd4f2';
      ctx.fillRect(0, y0, w, 40);
      ctx.fillStyle = '#ffffff';
      for (let x = -10; x < w + 30; x += 34) {
        ctx.beginPath();
        ctx.arc(x, y0 + 4, 18, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(w / 2 - 3, y0 + 40, 6, h);
    },
    sunset(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffd84a');
      g.addColorStop(0.45, '#ff9a2e');
      g.addColorStop(1, '#f2542d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.3, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9a2e';
      for (let i = 0; i < 4; i++) ctx.fillRect(0, h * 0.3 + 12 + i * 16, w, 6 + i * 2);
      ctx.strokeStyle = '#7a2a12';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, h);
      ctx.lineTo(w * 0.15, h * 0.12);
      ctx.moveTo(w * 0.85, h);
      ctx.lineTo(w * 0.85, h * 0.12);
      ctx.stroke();
    },
    blaze(ctx, w, h) {
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(0, 0, w, h);
      const layers = [['#e8261c', 0.12], ['#ff7b1c', 0.22], ['#ffb21c', 0.34]];
      layers.forEach(([col, top]) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const tips = 4;
        for (let i = 0; i <= tips; i++) {
          const x = (i / tips) * w;
          const ty = h * top + (i % 2) * 90 + 40;
          ctx.quadraticCurveTo(x - w / tips / 2, ty + 160, x, ty);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      });
    },
    driftwood(ctx, w, h) {
      ctx.fillStyle = '#a8673a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = i % 3 ? 'rgba(80,40,15,0.45)' : 'rgba(230,170,110,0.35)';
        ctx.lineWidth = 2 + (i % 4);
        ctx.beginPath();
        const x0 = (i / 26) * w;
        for (let y = 0; y <= h; y += 16) ctx.lineTo(x0 + Math.sin(y * 0.012 + i) * 8, y);
        ctx.stroke();
      }
      [[0.3, 0.25], [0.7, 0.6], [0.4, 0.82]].forEach(([x, y]) => {
        ctx.fillStyle = '#5e3216';
        ctx.beginPath();
        ctx.ellipse(x * w, y * h, 14, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7d4521';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x * w, y * h, 22, 44, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    },
    lagoon(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#36d6c3');
      g.addColorStop(1, '#0d7d8c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(10,80,60,0.6)';
      for (let i = 0; i < 5; i++) {
        const cx = w * 0.5, cy = h * 0.55;
        const a = -Math.PI / 2 + (i - 2) * 0.45;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -150, 34, 150, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(18, 0, 6, h);
      ctx.fillRect(w - 24, 0, 6, h);
    },
    coral(ctx, w, h) {
      ctx.fillStyle = '#ff8fb4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e8355d';
      ctx.lineCap = 'round';
      function branch(x, y, len, a, d) {
        if (d === 0 || len < 8) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        ctx.lineWidth = d * 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        branch(x2, y2, len * 0.72, a - 0.45, d - 1);
        branch(x2, y2, len * 0.72, a + 0.4, d - 1);
      }
      branch(w * 0.5, h * 0.95, 140, -Math.PI / 2, 5);
      branch(w * 0.25, h * 0.6, 80, -Math.PI / 2 - 0.2, 4);
      branch(w * 0.75, h * 0.45, 80, -Math.PI / 2 + 0.2, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.arc(((i * 53) % w), (i * 97) % (h * 0.5), 4 + (i % 4) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    brass(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#8a4f22');
      g.addColorStop(0.5, '#e0a35a');
      g.addColorStop(1, '#8a4f22');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#5d3314';
      ctx.lineWidth = 4;
      for (let y = 120; y < h; y += 150) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = '#f3cf8a';
        for (let x = 20; x < w; x += 36) {
          ctx.beginPath();
          ctx.arc(x, y + 12, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#6b3b18';
      ctx.lineWidth = 8;
      [[0.5, 0.3, 46], [0.35, 0.62, 30]].forEach(([x, y, r]) => {
        ctx.beginPath();
        ctx.arc(x * w, y * h, r, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x * w + Math.cos(a) * r, y * h + Math.sin(a) * r);
          ctx.lineTo(x * w + Math.cos(a) * (r + 12), y * h + Math.sin(a) * (r + 12));
          ctx.stroke();
        }
      });
    },
    nebula(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5a2fa8');
      g.addColorStop(0.5, '#2a1458');
      g.addColorStop(1, '#120a2e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, 200);
      r.addColorStop(0, 'rgba(255,120,220,0.7)');
      r.addColorStop(1, 'rgba(255,120,220,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        const x = (i * 71) % w, y = (i * 137) % h;
        ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
      }
      star(ctx, w * 0.5, h * 0.2, 26, 11);
      ctx.fill();
    },
    golden(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#fff2a8');
      g.addColorStop(0.3, '#f5c431');
      g.addColorStop(0.6, '#d99a12');
      g.addColorStop(1, '#f7d860');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(w / 2, i * 260 + 120);
        ctx.rotate(-0.5);
        ctx.fillRect(-200, 0, 400, 18 + i * 4);
        ctx.restore();
      }
      ctx.fillStyle = '#b37508';
      star(ctx, w / 2, h * 0.28, 40, 17);
      ctx.fill();
    },
  };

  function drawCracks(ctx, w, h, side) {
    const rnd = WR.seeded(side === 'L' ? 11 : 29);
    const sx = side === 'L' ? 1 : -1;
    const x0 = side === 'L' ? w * 0.08 : w * 0.92;
    for (let n = 0; n < 4; n++) {
      let x = x0 + sx * rnd() * 10;
      let y = h * (0.1 + n * 0.07 + rnd() * 0.04);
      const pts = [[x, y]];
      for (let i = 0; i < 5; i++) {
        x += sx * (12 + rnd() * 22);
        y += (rnd() - 0.4) * 40;
        pts.push([x, y]);
      }
      [['#4a1d06', 11], ['#ff9b2f', 5]].forEach(([col, lw]) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
      });
    }
  }

  const boardCache = {};
  // Returns a THREE.CanvasTexture for a board, optionally showing broken sides.
  function boardTexture(id, broken) {
    const key = id + (broken && broken.L ? 'L' : '') + (broken && broken.R ? 'R' : '');
    if (boardCache[key]) return boardCache[key];
    const c = canvas(256, 1024);
    const ctx = c.getContext('2d');
    (PAINT[id] || PAINT.classic)(ctx, c.width, c.height);
    // rail shading
    const rail = ctx.createLinearGradient(0, 0, c.width, 0);
    rail.addColorStop(0, 'rgba(0,0,0,0.25)');
    rail.addColorStop(0.12, 'rgba(0,0,0,0)');
    rail.addColorStop(0.88, 'rgba(0,0,0,0)');
    rail.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = rail;
    ctx.fillRect(0, 0, c.width, c.height);
    if (broken && broken.L) drawCracks(ctx, c.width, c.height, 'L');
    if (broken && broken.R) drawCracks(ctx, c.width, c.height, 'R');
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    boardCache[key] = t;
    return t;
  }

  // ---------- Icons ----------
  function shellIcon(ctx, s) {
    ctx.save();
    ctx.translate(s / 2, s * 0.56);
    const r = s * 0.4;
    ctx.fillStyle = '#ffb43a';
    ctx.strokeStyle = '#7a3c08';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.75);
    ctx.arc(0, r * 0.75, r * 1.05, Math.PI * 1.12, Math.PI * 1.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#c96a12';
    ctx.lineWidth = s * 0.035;
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.28;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.7);
      ctx.lineTo(Math.cos(a) * r * 0.95, r * 0.75 + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff3a0';
    ctx.strokeStyle = '#7a3c08';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(0, r * 0.62, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const ICONS = {
    shell: shellIcon,
    star(ctx, s) {
      star(ctx, s / 2, s * 0.53, s * 0.46, s * 0.2);
      ctx.fillStyle = '#ffc531';
      ctx.fill();
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = '#c4501c';
      ctx.stroke();
    },
    crown(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s * 0.1, s * 0.78);
      ctx.lineTo(s * 0.06, s * 0.3);
      ctx.lineTo(s * 0.32, s * 0.52);
      ctx.lineTo(s * 0.5, s * 0.18);
      ctx.lineTo(s * 0.68, s * 0.52);
      ctx.lineTo(s * 0.94, s * 0.3);
      ctx.lineTo(s * 0.9, s * 0.78);
      ctx.closePath();
      ctx.fillStyle = '#ffc531';
      ctx.fill();
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = '#b8580f';
      ctx.stroke();
    },
    wrench(ctx, s) {
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#5ee04a';
      ctx.strokeStyle = '#1f6a17';
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-s * 0.07, -s * 0.28, s * 0.14, s * 0.62, s * 0.05) : ctx.rect(-s * 0.07, -s * 0.28, s * 0.14, s * 0.62);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.3, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(-s * 0.05, -s * 0.5, s * 0.1, s * 0.2);
      ctx.restore();
    },
    freeze(ctx, s) {
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.strokeStyle = '#7fe8ff';
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.08;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -s * 0.4);
        ctx.moveTo(0, -s * 0.25);
        ctx.lineTo(-s * 0.1, -s * 0.34);
        ctx.moveTo(0, -s * 0.25);
        ctx.lineTo(s * 0.1, -s * 0.34);
        ctx.stroke();
      }
      ctx.restore();
    },
    shield(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.08);
      ctx.quadraticCurveTo(s * 0.7, s * 0.2, s * 0.86, s * 0.2);
      ctx.quadraticCurveTo(s * 0.86, s * 0.7, s / 2, s * 0.92);
      ctx.quadraticCurveTo(s * 0.14, s * 0.7, s * 0.14, s * 0.2);
      ctx.quadraticCurveTo(s * 0.3, s * 0.2, s / 2, s * 0.08);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = '#3b5fa8';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.2);
      ctx.lineTo(s / 2, s * 0.8);
      ctx.strokeStyle = '#9fc2ff';
      ctx.stroke();
    },
    magnet(ctx, s) {
      ctx.save();
      ctx.translate(s / 2, s * 0.45);
      ctx.lineWidth = s * 0.17;
      ctx.strokeStyle = '#a24bd9';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, 0);
      ctx.lineTo(-s * 0.24, -s * 0.22);
      ctx.moveTo(s * 0.24, 0);
      ctx.lineTo(s * 0.24, -s * 0.22);
      ctx.stroke();
      ctx.strokeStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.2);
      ctx.lineTo(-s * 0.24, -s * 0.34);
      ctx.moveTo(s * 0.24, -s * 0.2);
      ctx.lineTo(s * 0.24, -s * 0.34);
      ctx.stroke();
      ctx.restore();
    },
  };
  ICONS.starpower = ICONS.star;

  const iconCache = {};
  function icon(name, size = 128) {
    const key = name + size;
    if (iconCache[key]) return iconCache[key];
    const c = canvas(size, size);
    ICONS[name](c.getContext('2d'), size);
    iconCache[key] = c;
    return c;
  }
  function iconURL(name, size = 96) {
    return icon(name, size).toDataURL();
  }
  function iconTexture(name) {
    const t = new THREE.CanvasTexture(icon(name, 128));
    return t;
  }

  function radial(stops, size = 64) {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  function cloudTexture(seed) {
    const rnd = WR.seeded(seed);
    const c = canvas(256, 128);
    const ctx = c.getContext('2d');
    const puffs = [];
    for (let i = 0; i < 9; i++) puffs.push([40 + rnd() * 176, 60 + rnd() * 30, 18 + rnd() * 26]);
    ctx.fillStyle = '#cfe6f5';
    puffs.forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y + 8, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    puffs.forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    return new THREE.CanvasTexture(c);
  }

  WR.Tex = {
    boardTexture,
    icon,
    iconURL,
    iconTexture,
    dot: radial([[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']], 32),
    glow: radial([[0, 'rgba(255,240,150,0.95)'], [0.35, 'rgba(255,200,60,0.5)'], [1, 'rgba(255,180,40,0)']], 64),
    mist: radial([[0, 'rgba(255,255,255,0.85)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 64),
    clouds: [1, 2, 3, 4].map(cloudTexture),
  };
})();
