// DOM menus, panels, HUD and overlays.
(function () {
  const WR = window.WR;
  const $ = (id) => document.getElementById(id);
  const S = () => WR.Save;

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }

  const UI = {
    shopOpen: false,
    open: null,

    init() {
      document.querySelectorAll('img[data-icon]').forEach((img) => (img.src = WR.Tex.iconURL(img.dataset.icon)));
      document.querySelectorAll('[data-open]').forEach((el) =>
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          WR.Audio.init();
          WR.Audio.play('click');
          this.openPanel(el.dataset.open);
        })
      );
      document.querySelectorAll('.panel .close').forEach((el) =>
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          WR.Audio.play('click');
          this.closePanel();
        })
      );
      document.querySelectorAll('.panel, .bottombar, #modebtn, #shop').forEach((el) => {
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
      });
      $('modebtn').addEventListener('click', (e) => {
        e.stopPropagation();
        WR.Audio.init();
        WR.Audio.play('click');
        const d = S().data;
        d.mode = d.mode === 'hard' ? 'normal' : 'hard';
        S().save();
        WR.Game.toTitle();
      });

      // tabs
      document.querySelectorAll('[data-tab]').forEach((el) =>
        el.addEventListener('click', () => {
          WR.Audio.play('click');
          const group = el.dataset.group;
          document.querySelectorAll(`[data-group="${group}"]`).forEach((t) => t.classList.toggle('active', t === el));
          this.tabs[group] = el.dataset.tab;
          this.renderPanel(this.open);
        })
      );
      this.tabs = { missions: 'daily', info: 'tutorial', lbmode: 'normal', lbper: 'alltime' };

      // settings
      $('set-sound').addEventListener('click', () => this.toggleSetting('sound'));
      $('set-music').addEventListener('click', () => this.toggleSetting('music'));
      $('set-notify').addEventListener('click', () => this.toggleSetting('notify'));
      $('set-name').addEventListener('change', (e) => {
        const v = e.target.value.trim().slice(0, 16);
        if (v) S().data.name = v;
        S().save();
        this.refresh();
      });
      $('set-reset').addEventListener('click', () => {
        if (confirm('Erase all progress (seashells, boards, scores)?')) {
          S().reset();
          WR.Audio.applySettings();
          this.closePanel();
          WR.Game.toTitle();
        }
      });

      // shop
      $('shop-prev').addEventListener('click', () => this.shopStep(-1));
      $('shop-next').addEventListener('click', () => this.shopStep(1));
      $('shop-action').addEventListener('click', () => this.shopAction());
      $('shop-back').addEventListener('click', () => this.closeShop());

      // continue / results
      $('cont-buy').addEventListener('click', (e) => {
        e.stopPropagation();
        if (WR.Game.doContinue()) {
          clearInterval(this.contTimer);
          this.show('continue', false);
          this.hud(true);
        }
      });
      $('cont-skip').addEventListener('click', (e) => {
        e.stopPropagation();
        this.skipContinue();
      });
      $('results').addEventListener('click', () => WR.Game.toTitle());
      $('pause').addEventListener('click', () => WR.Game.resume());

      S().on(() => this.refresh());
      setInterval(() => {
        if (this.open === 'missions') this.renderPanel('missions');
      }, 1000);
      this.refresh();
    },

    panelOpen() {
      return !!this.open || this.shopOpen;
    },

    show(id, on) {
      $(id).classList.toggle('hidden', !on);
    },

    refresh() {
      const d = S().data;
      $('shells').textContent = d.shells;
      const best = d.best[d.mode] || 0;
      $('best').textContent = best;
      $('best-mode').textContent = d.mode === 'hard' ? 'HARD' : '';
      $('nametag').textContent = d.name;
      $('modebtn').textContent = d.mode === 'hard' ? 'HARD MODE' : 'NORMAL MODE';
      $('modebtn').classList.toggle('hard', d.mode === 'hard');
      $('dot-missions').classList.toggle('hidden', !S().hasClaimable());
    },

    showTitle() {
      this.hud(false);
      ['continue', 'results', 'pause', 'tutorial'].forEach((id) => this.show(id, false));
      this.show('title', true);
      this.refresh();
    },
    hideTitle() {
      this.show('title', false);
      this.closePanel();
    },

    // ---------------- panels ----------------
    openPanel(name) {
      if (name === 'shop') return this.openShop();
      this.closePanel();
      this.open = name;
      this.show('panel-' + name, true);
      this.show('dim', true);
      if (name === 'settings') {
        $('set-name').value = S().data.name;
        this.syncSettings();
      }
      this.renderPanel(name);
    },
    closePanel() {
      if (this.open) this.show('panel-' + this.open, false);
      this.open = null;
      this.show('dim', false);
      this.refresh();
    },
    toggleSetting(k) {
      WR.Audio.init();
      const s = S().data.settings;
      s[k] = !s[k];
      S().save();
      WR.Audio.applySettings();
      WR.Audio.play('click');
      this.syncSettings();
    },
    syncSettings() {
      const s = S().data.settings;
      $('set-sound').classList.toggle('off', !s.sound);
      $('set-music').classList.toggle('off', !s.music);
      $('set-notify').classList.toggle('checked', s.notify);
    },

    renderPanel(name) {
      if (name === 'missions') this.renderMissions();
      if (name === 'leaderboard') this.renderBoard();
      if (name === 'info') {
        document.querySelectorAll('.info-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== this.tabs.info));
      }
    },

    renderMissions() {
      const el = $('missions-list');
      const tab = this.tabs.missions;
      $('missions-title').textContent = tab === 'daily' ? 'DAILY MISSION' : 'ACHIEVEMENT';
      let html = '';
      if (tab === 'daily') {
        html += `<div class="reset">Reset in ${fmtTime(S().dailyResetIn())}</div>`;
        S().dailyMissions().forEach((m) => {
          const ready = !m.claimed && m.p >= m.goal;
          html += `<div class="mrow"><div class="mtext"><b>${m.text}</b><div class="bar"><i style="width:${(100 * m.p) / m.goal}%"></i></div><small>${m.p}/${m.goal}</small></div>
            <div class="reward">10 <img src="${WR.Tex.iconURL('shell', 48)}"></div>
            <button class="claim ${ready ? '' : 'dis'}" data-claim-daily="${m.id}">${m.claimed ? 'DONE' : 'CLAIM'}</button></div>`;
        });
        const d = S().data.daily;
        const done = S().dailyDoneCount();
        const ready = !d.bonusClaimed && done >= d.list.length;
        html += `<div class="mrow bonus"><div class="mtext"><b>Complete all daily missions</b><div class="bar"><i style="width:${(100 * done) / d.list.length}%"></i></div><small>${done}/${d.list.length}</small></div>
          <div class="reward">100 <img src="${WR.Tex.iconURL('shell', 48)}"></div>
          <button class="claim ${ready ? '' : 'dis'}" data-claim-bonus>${d.bonusClaimed ? 'DONE' : 'CLAIM'}</button></div>`;
      } else {
        html += `<div class="reset">Total achievement score: ${S().achScore()} <img class="inl" src="${WR.Tex.iconURL('crown', 48)}"></div>`;
        WR.Save.ACH.forEach((a) => {
          const t = S().achTier(a);
          const maxed = t >= a.tiers.length;
          const ti = Math.min(t, a.tiers.length - 1);
          const goal = a.tiers[ti];
          const v = Math.min(S().achValue(a), goal);
          const ready = !maxed && S().achValue(a) >= goal;
          html += `<div class="mrow"><div class="mtext"><b>${a.name.toUpperCase()} ${WR.Save.TIER_NAMES[ti].toUpperCase()}</b><span class="desc">${a.text(goal)}</span>
            <div class="bar"><i style="width:${maxed ? 100 : (100 * v) / goal}%"></i></div><small>${maxed ? 'MAX' : v + '/' + goal}</small></div>
            <div class="reward">${WR.Save.tierReward(ti)} <img src="${WR.Tex.iconURL('shell', 48)}"></div>
            <button class="claim ${ready ? '' : 'dis'}" data-claim-ach="${a.id}">${maxed ? 'DONE' : 'CLAIM'}</button></div>`;
        });
      }
      const scroll = el.scrollTop;
      el.innerHTML = html;
      el.scrollTop = scroll;
      el.querySelectorAll('[data-claim-daily]').forEach((b) => b.addEventListener('click', () => S().claimDaily(b.dataset.claimDaily) && this.claimed()));
      el.querySelectorAll('[data-claim-bonus]').forEach((b) => b.addEventListener('click', () => S().claimDailyBonus() && this.claimed()));
      el.querySelectorAll('[data-claim-ach]').forEach((b) => b.addEventListener('click', () => S().claimAch(b.dataset.claimAch) && this.claimed()));
    },
    claimed() {
      WR.Audio.play('buy');
      this.renderMissions();
      this.bumpShells();
    },

    renderBoard() {
      const rows = S().topRuns(this.tabs.lbmode, this.tabs.lbper);
      let html = '<div class="lbhead"><span>RANK</span><span>NAME</span><span>METERS</span><span>SCORE</span></div>';
      if (!rows.length) html += '<div class="empty">No runs yet. Go ride some waves!</div>';
      rows.forEach((r, i) => {
        html += `<div class="lbrow ${i < 3 ? 'top' + i : ''}"><span>${i + 1}</span><span>${r.name.replace(/[<>&]/g, '')}</span><span>${r.meters}M</span><span>${r.score}</span></div>`;
      });
      $('lb-list').innerHTML = html;
    },

    // ---------------- shop ----------------
    openShop() {
      this.closePanel();
      this.shopOpen = true;
      this.show('title', false);
      this.show('shop', true);
      this.shopIdx = WR.Save.BOARDS.findIndex((b) => b.id === S().data.board);
      this.renderShop();
    },
    closeShop() {
      WR.Audio.play('click');
      this.shopOpen = false;
      this.show('shop', false);
      this.show('title', true);
      WR.Game.refreshBoard();
    },
    shopStep(d) {
      WR.Audio.play('click');
      const n = WR.Save.BOARDS.length + 1; // last card: more coming soon
      this.shopIdx = (this.shopIdx + d + n) % n;
      this.renderShop();
    },
    renderShop() {
      const B = WR.Save.BOARDS;
      const soon = this.shopIdx >= B.length;
      $('shop-card').classList.toggle('hidden', soon);
      $('shop-soon').classList.toggle('hidden', !soon);
      WR.Game.shopBoard.visible = !soon && this.shopOpen;
      if (soon) {
        $('shop-action').classList.add('hidden');
        return;
      }
      const b = B[this.shopIdx];
      $('shop-name').textContent = b.name.toUpperCase();
      $('st-speed').style.width = b.speed * 100 + '%';
      $('st-accel').style.width = b.accel * 100 + '%';
      $('st-turn').style.width = b.turn * 100 + '%';
      const owned = S().data.owned.includes(b.id);
      const sel = S().data.board === b.id;
      const btn = $('shop-action');
      btn.classList.remove('hidden');
      btn.classList.toggle('dis', !owned && S().data.shells < b.price);
      btn.innerHTML = sel ? 'SELECTED' : owned ? 'SELECT' : `BUY <img src="${WR.Tex.iconURL('shell', 64)}"> ${b.price}`;
      const t = WR.Tex.boardTexture(b.id);
      t.repeat.set(1 / 1.5, 1 / 6);
      t.offset.set(0.5, 0.5);
      WR.Game.shopBoard.material.map = t;
      WR.Game.shopBoard.material.needsUpdate = true;
    },
    shopAction() {
      const b = WR.Save.BOARDS[this.shopIdx];
      if (!b) return;
      const d = S().data;
      if (!d.owned.includes(b.id)) {
        if (d.shells < b.price) return;
        d.shells -= b.price;
        d.owned.push(b.id);
        WR.Audio.play('buy');
      } else WR.Audio.play('click');
      d.board = b.id;
      S().save();
      S().emit();
      this.renderShop();
    },

    // ---------------- HUD ----------------
    hud(on) {
      this.show('hud', on);
    },
    setHud(h) {
      if (h.force || h.meters !== this._m) $('hud-meters').textContent = h.meters + 'M';
      if (h.force || h.score !== this._s) {
        $('score').textContent = h.score;
        if (this._s != null && h.score > this._s) {
          const el = $('score');
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        }
      }
      this._m = h.meters;
      this._s = h.score;
      $('x2').classList.toggle('hidden', !h.x2);
      let html = '';
      ['freeze', 'shield', 'magnet', 'star'].forEach((k) => {
        const v = h.powers[k];
        if (v > 0) html += `<div class="pw"><img src="${WR.Tex.iconURL(k, 64)}"><i style="width:${(v / 15) * 100}%"></i></div>`;
      });
      if (html !== this._pw) $('hud-powers').innerHTML = html;
      this._pw = html;
      $('shieldfx').classList.toggle('on', h.shield);
    },
    bumpShells() {
      const el = $('shells-wrap');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    },
    underwater(on, color) {
      const el = $('underwater');
      if (on !== this._uw) {
        el.classList.toggle('on', on);
        this._uw = on;
      }
      if (color && color !== this._uwc) {
        el.style.background = `radial-gradient(ellipse at center, transparent 30%, ${color} 100%), ${color}`;
        this._uwc = color;
      }
    },
    flash(color) {
      const el = $('flash');
      el.style.background = color;
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
    },
    powerToast(kind) {
      const names = { wrench: 'BOARD REPAIRED!', freeze: 'FREEZE!', shield: 'SHIELD!', magnet: 'MAGNET!', star: 'DOUBLE POINTS!' };
      const el = $('powertoast');
      el.innerHTML = `<img src="${WR.Tex.iconURL(kind, 96)}"> ${names[kind]}`;
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
    },
    toast(n) {
      this.refresh();
      if (!S().data.settings.notify) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `<img src="${WR.Tex.iconURL(n.kind === 'ach' ? 'crown' : 'star', 64)}"><div><b>${n.title.toUpperCase()}</b><small>${n.text}</small></div>`;
      $('toasts').appendChild(el);
      WR.Audio.play('toast');
      setTimeout(() => el.classList.add('out'), 3200);
      setTimeout(() => el.remove(), 3800);
    },

    tutorial(kind) {
      if (!kind) return this.show('tutorial', false);
      const txt = { steer: '← → or A / D to steer!', jump: '↑ or W to jump!', dive: '↓ or S to dive!' };
      const arrows = { steer: 'lr', jump: 'up', dive: 'down' };
      $('tut-text').textContent = txt[kind];
      $('tut-arrows').className = 'arrows ' + arrows[kind];
      $('tut-touch').textContent = kind === 'steer' ? '(touch: drag sideways)' : kind === 'jump' ? '(touch: swipe up)' : '(touch: swipe down)';
      this.show('tutorial', true);
    },

    // ---------------- continue / results ----------------
    showContinue(cost) {
      this.hud(false);
      this.show('continue', true);
      const can = S().data.shells >= cost;
      $('cont-cost').textContent = cost;
      $('cont-buy').classList.toggle('dis', !can);
      let n = 9;
      const ring = $('cont-ring');
      const tick = () => {
        $('cont-n').textContent = n;
        ring.style.setProperty('--p', n / 9);
        WR.Audio.play('tick');
      };
      tick();
      clearInterval(this.contTimer);
      this.contTimer = setInterval(() => {
        n--;
        if (n < 0) return this.skipContinue();
        tick();
      }, 1000);
    },
    skipContinue() {
      clearInterval(this.contTimer);
      this.show('continue', false);
      WR.Game.endRun();
    },
    showResults(r) {
      this.hud(false);
      $('res-score').textContent = r.score;
      $('res-best').textContent = r.best;
      $('res-best-label').textContent = r.isBest ? 'NEW BEST!' : 'BEST';
      $('res-meters').textContent = r.meters;
      $('res-shells').textContent = '+' + r.shells;
      $('res-mode').textContent = r.mode === 'hard' ? 'HARD MODE' : 'NORMAL MODE';
      $('res-mode').classList.toggle('hard', r.mode === 'hard');
      this.show('results', true);
      const items = document.querySelectorAll('#results .stat');
      items.forEach((el, i) => {
        el.style.animationDelay = i * 0.35 + 's';
        el.classList.remove('in');
        void el.offsetWidth;
        el.classList.add('in');
      });
      this.refresh();
    },
  };

  WR.UI = UI;
})();
