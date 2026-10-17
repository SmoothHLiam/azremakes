// Local progress: seashells, boards, best scores, daily missions, achievements, leaderboard.
(function () {
  const WR = window.WR;
  const KEY = 'waverider_remake_save_v1';

  const BOARDS = [
    { id: 'classic', name: 'Classic Surfer', price: 0, speed: 0.45, accel: 0.5, turn: 0.5 },
    { id: 'sunset', name: 'Sunset Surfer', price: 250, speed: 0.5, accel: 0.55, turn: 0.5 },
    { id: 'blaze', name: 'Blaze Surfer', price: 250, speed: 0.58, accel: 0.45, turn: 0.5 },
    { id: 'driftwood', name: 'Driftwood Surfer', price: 500, speed: 0.5, accel: 0.62, turn: 0.62 },
    { id: 'lagoon', name: 'Lagoon Surfer', price: 1000, speed: 0.6, accel: 0.6, turn: 0.62 },
    { id: 'coral', name: 'Coral Surfer', price: 1500, speed: 0.6, accel: 0.66, turn: 0.72 },
    { id: 'brass', name: 'Brass Surfer', price: 2500, speed: 0.76, accel: 0.6, turn: 0.66 },
    { id: 'nebula', name: 'Nebula Surfer', price: 2500, speed: 0.7, accel: 0.76, turn: 0.72 },
    { id: 'golden', name: 'Golden Surfer', price: 5000, speed: 0.86, accel: 0.82, turn: 0.82 },
  ];

  const DAILY_POOL = [
    { id: 'shells', text: 'Collect 50 Seashells', goal: 50, stat: 'shells' },
    { id: 'trash', text: 'Hit 20 Pieces of Trash', goal: 20, stat: 'trash' },
    { id: 'boats', text: 'Land on 5 Boats', goal: 5, stat: 'boats' },
    { id: 'village', text: 'Traverse the Fisherman Village', goal: 1, stat: 'zone_village' },
    { id: 'city', text: 'Traverse the Fallen City', goal: 1, stat: 'zone_city' },
    { id: 'sewer', text: 'Traverse the Sewer', goal: 1, stat: 'zone_sewer' },
    { id: 'falls', text: 'Ride down 2 Waterfalls', goal: 2, stat: 'zone_waterfall' },
    { id: 'jumps', text: 'Jump 40 Times', goal: 40, stat: 'jumps' },
    { id: 'dives', text: 'Dive 15 Times', goal: 15, stat: 'dives' },
    { id: 'turtles', text: 'Launch off 3 Turtles', goal: 3, stat: 'turtles' },
    { id: 'powerups', text: 'Grab 5 Powerups', goal: 5, stat: 'powerups' },
    { id: 'bridges', text: 'Pass under 3 Water Bridges', goal: 3, stat: 'zone_bridge' },
  ];
  const DAILY_COUNT = 6;
  const DAILY_REWARD = 10;
  const DAILY_BONUS = 100;

  const TIER_NAMES = ['Rookie', 'Regular', 'Pro', 'Veteran', 'Master', 'Legend'];
  const ACH = [
    { id: 'waterfall', name: 'Waterfall', stat: 'zone_waterfall', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Ride down the Waterfall ${n} times` },
    { id: 'ravine', name: 'Ravine', stat: 'zone_ravine', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Traverse the Ravine ${n} times` },
    { id: 'sewer', name: 'Sewer', stat: 'zone_sewer', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Traverse the Sewer ${n} times` },
    { id: 'bridge', name: 'Bridge', stat: 'zone_bridge', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Pass under the Water Bridges ${n} times` },
    { id: 'village', name: 'Village', stat: 'zone_village', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Traverse the Fisherman Village ${n} times` },
    { id: 'city', name: 'Ruins', stat: 'zone_city', tiers: [2, 5, 10, 25, 50, 100], text: (n) => `Traverse the Fallen City ${n} times` },
    { id: 'games', name: 'Surfer', stat: 'games', tiers: [2, 10, 25, 50, 100, 250], text: (n) => `Play ${n} games` },
    { id: 'distance', name: 'Distance', stat: 'max_meters', max: true, tiers: [150, 300, 600, 1000, 2000, 4000], text: (n) => `Travel ${n} meters in a single run` },
    { id: 'air', name: 'Sky', stat: 'max_air', max: true, tiers: [25, 60, 120, 250, 500, 1000], text: (n) => `Fly ${n} meters in the air in a single run` },
    { id: 'continue', name: 'Stubborn', stat: 'continues', tiers: [1, 5, 20, 50, 100, 250], text: (n) => `Continue a run ${n} times` },
    { id: 'collector', name: 'Collector', stat: 'shells', tiers: [50, 250, 1000, 5000, 20000, 50000], text: (n) => `Collect ${n} seashells` },
  ];
  const tierReward = (t) => 5 * Math.pow(2, t);

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function fresh() {
    const hex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
    return {
      v: 1,
      name: 'player-' + hex,
      shells: 250,
      owned: ['classic'],
      board: 'classic',
      mode: 'normal',
      best: { normal: 0, hard: 0 },
      stats: {},
      ach: {},
      achNotified: {},
      daily: null,
      runs: [],
      tutorialDone: false,
      settings: { sound: true, music: true, notify: true },
    };
  }

  const Save = {
    BOARDS,
    ACH,
    TIER_NAMES,
    tierReward,
    data: null,
    listeners: [],
    load() {
      const d = WR.storage.get(KEY);
      this.data = Object.assign(fresh(), d || {});
      this.data.settings = Object.assign(fresh().settings, this.data.settings || {});
      this.data.best = Object.assign({ normal: 0, hard: 0 }, this.data.best || {});
      this.ensureDaily();
    },
    save() {
      WR.storage.set(KEY, this.data);
      const el = document.getElementById('saving');
      if (el) {
        el.classList.add('on');
        clearTimeout(this._st);
        this._st = setTimeout(() => el.classList.remove('on'), 900);
      }
    },
    reset() {
      WR.storage.remove(KEY);
      this.load();
      this.save();
      this.emit();
    },
    on(fn) {
      this.listeners.push(fn);
    },
    emit() {
      this.listeners.forEach((f) => f());
    },
    board() {
      return BOARDS.find((b) => b.id === this.data.board) || BOARDS[0];
    },
    addShells(n) {
      this.data.shells += n;
      this.emit();
    },

    // ---------- daily missions ----------
    ensureDaily() {
      const d = this.data;
      const t = today();
      if (d.daily && d.daily.date === t) return;
      const rnd = WR.seeded(WR.hashStr(t + d.name));
      const pool = DAILY_POOL.slice();
      const list = [];
      while (list.length < DAILY_COUNT && pool.length) list.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
      d.daily = { date: t, list: list.map((id) => ({ id, p: 0, claimed: false, notified: false })), bonusClaimed: false };
    },
    dailyMissions() {
      this.ensureDaily();
      return this.data.daily.list.map((m) => Object.assign({}, DAILY_POOL.find((x) => x.id === m.id), m));
    },
    dailyResetIn() {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return next - now;
    },
    claimDaily(id) {
      const m = this.data.daily.list.find((x) => x.id === id);
      const def = DAILY_POOL.find((x) => x.id === id);
      if (!m || m.claimed || m.p < def.goal) return false;
      m.claimed = true;
      this.addShells(DAILY_REWARD);
      this.save();
      return true;
    },
    dailyDoneCount() {
      return this.data.daily.list.filter((m) => m.claimed).length;
    },
    claimDailyBonus() {
      const d = this.data.daily;
      if (d.bonusClaimed || this.dailyDoneCount() < d.list.length) return false;
      d.bonusClaimed = true;
      this.addShells(DAILY_BONUS);
      this.save();
      return true;
    },

    // ---------- achievements ----------
    achValue(a) {
      return this.data.stats[a.stat] || 0;
    },
    achTier(a) {
      return this.data.ach[a.id] || 0; // number of tiers already claimed
    },
    claimAch(id) {
      const a = ACH.find((x) => x.id === id);
      const t = this.achTier(a);
      if (t >= a.tiers.length || this.achValue(a) < a.tiers[t]) return false;
      this.data.ach[id] = t + 1;
      this.addShells(tierReward(t));
      this.save();
      return true;
    },
    achScore() {
      return ACH.reduce((s, a) => s + this.achTier(a), 0);
    },
    hasClaimable() {
      this.ensureDaily();
      const daily = this.dailyMissions().some((m) => !m.claimed && m.p >= m.goal);
      const bonus = !this.data.daily.bonusClaimed && this.dailyDoneCount() >= this.data.daily.list.length;
      const ach = ACH.some((a) => {
        const t = this.achTier(a);
        return t < a.tiers.length && this.achValue(a) >= a.tiers[t];
      });
      return daily || bonus || ach;
    },

    // Increment a lifetime stat (and daily mission progress). Returns notifications to show.
    track(stat, n = 1) {
      const d = this.data;
      d.stats[stat] = (d.stats[stat] || 0) + n;
      return this._progress(stat);
    },
    trackMax(stat, v) {
      const d = this.data;
      if (v > (d.stats[stat] || 0)) d.stats[stat] = v;
      return this._progress(stat);
    },
    _progress(stat) {
      const notes = [];
      this.ensureDaily();
      this.data.daily.list.forEach((m) => {
        const def = DAILY_POOL.find((x) => x.id === m.id);
        if (def.stat !== stat || m.claimed) return;
        if (m.p < def.goal) {
          m.p = Math.min(def.goal, m.p + 1);
          if (m.p >= def.goal && !m.notified) {
            m.notified = true;
            notes.push({ kind: 'daily', title: 'Daily Mission Complete', text: def.text });
          }
        }
      });
      ACH.forEach((a) => {
        if (a.stat !== stat) return;
        const v = this.achValue(a);
        const shown = this.data.achNotified[a.id] || 0;
        let reached = 0;
        while (reached < a.tiers.length && v >= a.tiers[reached]) reached++;
        if (reached > shown) {
          this.data.achNotified[a.id] = reached;
          const t = reached - 1;
          notes.push({ kind: 'ach', tier: t, title: a.name + ' ' + TIER_NAMES[t], text: a.text(a.tiers[t]) });
        }
      });
      return notes;
    },

    // ---------- leaderboard ----------
    addRun(run) {
      const d = this.data;
      d.runs.push(run);
      d.runs.sort((a, b) => b.score - a.score);
      const keep = [];
      const counts = { normal: 0, hard: 0 };
      d.runs.forEach((r) => {
        if (counts[r.mode] < 100) {
          counts[r.mode]++;
          keep.push(r);
        }
      });
      d.runs = keep;
    },
    topRuns(mode, period) {
      const now = Date.now();
      const span = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5, alltime: Infinity }[period];
      return this.data.runs.filter((r) => r.mode === mode && now - r.t <= span).slice(0, 25);
    },
  };

  WR.Save = Save;
})();
