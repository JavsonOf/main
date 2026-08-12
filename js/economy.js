/* =====================================================================
   economy.js — the mutable game state: cash, XP, per-line upgrades,
   passive income, offline earnings, autosave, unlocks and objectives.
   ---------------------------------------------------------------------
   Depends only on products.js. Knows nothing about the canvas — the
   renderer is driven from binding.js, which reads this. That split is
   deliberate: the whole economy can be unit-tested headlessly, and a
   dropped frame can never desync the books.

     const state = new ECONOMY.GameState();
     state.load();                       // + offline earnings report
     engine.onTick = dt => state.tick(dt);
   ===================================================================== */
(function (global) {
  'use strict';

  const P = global.PRODUCTS;
  const { PRODUCTS: LIST, getProduct, getAxis, axisMultiplier, axisCost,
    axisAffordable, xpForNext, OBJECTIVES, BALANCE, Format } = P;

  const now = () => Date.now();

  /* =================================================================== */
  /*  Storage — localStorage with a graceful in-memory fallback          */
  /* =================================================================== */
  const Storage = {
    available: (() => {
      try {
        const k = '__isofactory_probe__';
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }   // private mode, blocked cookies, SSR
    })(),
    _mem: {},

    get(key) {
      try {
        return Storage.available ? global.localStorage.getItem(key) : Storage._mem[key];
      } catch (e) { return Storage._mem[key]; }
    },
    set(key, val) {
      try {
        if (Storage.available) global.localStorage.setItem(key, val);
        else Storage._mem[key] = val;
        return true;
      } catch (e) {
        Storage._mem[key] = val;      // quota exceeded — keep the session alive
        return false;
      }
    },
    remove(key) {
      try {
        if (Storage.available) global.localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
      delete Storage._mem[key];
    }
  };

  /* =================================================================== */
  /*  Tiny event emitter                                                 */
  /* =================================================================== */
  class Emitter {
    constructor() { this._h = {}; }
    on(evt, fn) { (this._h[evt] || (this._h[evt] = [])).push(fn); return () => this.off(evt, fn); }
    off(evt, fn) {
      const a = this._h[evt]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    }
    emit(evt, payload) {
      const a = this._h[evt];
      if (a) for (let i = 0; i < a.length; i++) {
        try { a[i](payload, evt); }
        catch (e) { console.error('[economy] listener for "' + evt + '" threw:', e); }
      }
      // 'change' is the catch-all Step-3 panels can subscribe to once
      if (evt !== 'change' && evt !== 'tick') this.emit('change', { reason: evt, payload });
    }
  }

  /* =================================================================== */
  /*  A single production line                                           */
  /* =================================================================== */
  function newLine(product) {
    return {
      id: product.id,
      unlocked: product.unlockCost === 0 && product.unlockLv <= 1,
      speed: 1, supply: 1, robot: 1, quality: 1,   // the four axes
      shipped: 0,        // whole units shipped
      _partial: 0,       // sub-unit carry, so slow lines still tick over
      earned: 0          // lifetime cash from this line
    };
  }

  /* =================================================================== */
  /*  GameState                                                          */
  /* =================================================================== */
  class GameState extends Emitter {
    constructor(opts) {
      super();
      Object.assign(this, {
        autosaveSeconds: BALANCE.autosaveSeconds,
        saveKey: BALANCE.saveKey,
        offlineEfficiency: BALANCE.offlineEfficiency
      }, opts || {});

      this.reset(true);
    }

    /* ------------------------------------------------------- lifecycle */
    reset(silent) {
      this.cash = BALANCE.startingCash;
      this.level = 1;
      this.xp = 0;                       // xp banked into the current level
      this.globalMultiplier = BALANCE.globalMultiplier;
      this.selectedLine = LIST[0].id;

      this.lines = {};
      LIST.forEach(p => { this.lines[p.id] = newLine(p); });

      this.stats = {
        totalEarned: 0, totalShipped: 0, upgradesBought: 0,
        unlocksBought: 0, objectivesDone: 0,
        startedAt: now(), playTime: 0, offlineEarned: 0
      };

      this.objectives = { done: {}, order: OBJECTIVES.map(o => o.id) };
      this.offlineReport = null;
      this.lastSaved = now();

      this._saveClock = 0;
      this._objClock = 0;
      this._dirty = false;

      if (!silent) this.emit('reset');
    }

    /* ---------------------------------------------------------- lookup */
    line(id) { return this.lines[id] || null; }
    product(id) { return getProduct(id); }

    unlockedLines() { return LIST.filter(p => this.lines[p.id].unlocked); }
    unlockedCount() { return this.unlockedLines().length; }

    /** Highest star rating across every line — used by objectives. */
    maxQuality() { return this.maxAxis('quality'); }
    maxAxis(axisId) {
      let m = 0;
      for (const id in this.lines) {
        if (this.lines[id].unlocked) m = Math.max(m, this.lines[id][axisId]);
      }
      return m;
    }

    /* ================================================================= */
    /*  Income model                                                     */
    /* ================================================================= */

    /** Combined throughput multiplier from the three volume axes. */
    throughputMultiplier(id) {
      const l = this.lines[id];
      if (!l) return 0;
      return axisMultiplier('speed', l.speed) *
        axisMultiplier('supply', l.supply) *
        axisMultiplier('robot', l.robot);
    }

    /** Units per minute produced by a line (0 when locked). */
    throughputPerMinute(id) {
      const l = this.lines[id], p = getProduct(id);
      if (!l || !p || !l.unlocked) return 0;
      return p.rate * this.throughputMultiplier(id);
    }

    /** $ per unit — base value scaled by parts quality and any global. */
    valuePerUnit(id) {
      const l = this.lines[id], p = getProduct(id);
      if (!l || !p) return 0;
      return p.value * axisMultiplier('quality', l.quality) * this.globalMultiplier;
    }

    /** ← the passive income calculator, per line. */
    lineIncomePerMinute(id) {
      return this.throughputPerMinute(id) * this.valuePerUnit(id);
    }

    /** ← and across the whole factory. */
    incomePerMinute() {
      let sum = 0;
      for (let i = 0; i < LIST.length; i++) sum += this.lineIncomePerMinute(LIST[i].id);
      return sum;
    }

    incomePerSecond() { return this.incomePerMinute() / 60; }

    xpPerMinute() {
      let sum = 0;
      for (let i = 0; i < LIST.length; i++) {
        const p = LIST[i];
        sum += this.throughputPerMinute(p.id) * p.xp;
      }
      return sum;
    }

    /** What one more point on an axis would add to $/min. Drives the UI. */
    upgradePreview(id, axisId) {
      const l = this.lines[id];
      if (!l) return null;
      const axis = getAxis(axisId);
      const before = this.lineIncomePerMinute(id);
      const prev = l[axisId];
      if (prev >= axis.max) return { cost: Infinity, gain: 0, maxed: true, before, after: before };
      l[axisId] = prev + 1;
      const after = this.lineIncomePerMinute(id);
      l[axisId] = prev;
      const cost = axisCost(getProduct(id), axisId, prev);
      return {
        cost, gain: after - before, before, after, maxed: false,
        payback: after > before ? cost / ((after - before) / 60) : Infinity  // seconds
      };
    }

    /* ================================================================= */
    /*  Simulation tick — call at a fixed 60 Hz from the engine          */
    /* ================================================================= */
    tick(dt) {
      if (!(dt > 0)) return;
      this.stats.playTime += dt;
      this._accrue(dt, 1);

      // --- objectives, four times a second ---------------------------
      this._objClock += dt;
      if (this._objClock >= 0.25) { this._objClock = 0; this.checkObjectives(); }

      // --- autosave --------------------------------------------------
      this._saveClock += dt;
      if (this._saveClock >= this.autosaveSeconds) { this._saveClock = 0; this.save(); }

      this.emit('tick', dt);
    }

    /**
     * Shared by the live tick and the offline catch-up. `efficiency` is 1
     * while playing and BALANCE.offlineEfficiency while away, so both paths
     * run through exactly one income implementation.
     */
    _accrue(seconds, efficiency) {
      const minutes = (seconds / 60) * efficiency;
      let cash = 0, units = 0, xp = 0;

      for (let i = 0; i < LIST.length; i++) {
        const p = LIST[i], l = this.lines[p.id];
        if (!l.unlocked) continue;
        const made = this.throughputPerMinute(p.id) * minutes;
        if (made <= 0) continue;
        const gain = made * this.valuePerUnit(p.id);

        l._partial += made;
        const whole = Math.floor(l._partial);
        if (whole > 0) { l._partial -= whole; l.shipped += whole; units += whole; }

        l.earned += gain;
        cash += gain;
        xp += made * p.xp;
      }

      this.cash += cash;
      this.stats.totalEarned += cash;
      this.stats.totalShipped += units;
      this.addXp(xp);
      return { cash, units, xp };
    }

    /* ================================================================= */
    /*  Levelling                                                        */
    /* ================================================================= */
    addXp(amount) {
      if (!(amount > 0)) return 0;
      this.xp += amount;
      let gained = 0;
      let need = xpForNext(this.level);
      while (this.xp >= need && isFinite(need)) {
        this.xp -= need;
        this.level++; gained++;
        need = xpForNext(this.level);
      }
      // at the cap the bar sits full rather than banking unspendable XP
      if (!isFinite(need)) this.xp = 0;
      if (gained) {
        this.emit('levelup', { level: this.level, gained, unlockable: this.newlyUnlockable() });
      }
      return gained;
    }

    xpToNext() { return xpForNext(this.level); }
    xpProgress() {
      const need = xpForNext(this.level);
      return isFinite(need) ? Math.min(1, this.xp / need) : 1;
    }
    atLevelCap() { return !isFinite(xpForNext(this.level)); }

    /** Lines whose level gate is met but that haven't been bought yet. */
    newlyUnlockable() {
      return LIST.filter(p => !this.lines[p.id].unlocked && this.level >= p.unlockLv)
        .map(p => p.id);
    }

    /* ================================================================= */
    /*  Unlocks                                                          */
    /* ================================================================= */
    unlockState(id) {
      const p = getProduct(id), l = this.lines[id];
      if (!p || !l) return null;
      return {
        unlocked: l.unlocked,
        levelMet: this.level >= p.unlockLv,
        affordable: this.cash >= p.unlockCost,
        cost: p.unlockCost,
        levelRequired: p.unlockLv,
        canUnlock: !l.unlocked && this.level >= p.unlockLv && this.cash >= p.unlockCost
      };
    }

    canUnlock(id) { const s = this.unlockState(id); return !!s && s.canUnlock; }

    unlockProduct(id) {
      const s = this.unlockState(id);
      if (!s || !s.canUnlock) return false;
      const p = getProduct(id);
      this.cash -= p.unlockCost;
      this.lines[id].unlocked = true;
      this.stats.unlocksBought++;
      this.emit('unlock', { id, product: p, spent: p.unlockCost });
      this.checkObjectives();
      return true;
    }

    /* ================================================================= */
    /*  Upgrades — the four axes                                         */
    /* ================================================================= */
    upgradeCost(id, axisId, count) {
      const l = this.lines[id], p = getProduct(id);
      if (!l || !p) return Infinity;
      if (count == null || count === 1) return axisCost(p, axisId, l[axisId]);
      return P.axisBulkCost(p, axisId, l[axisId], count).cost;
    }

    canUpgrade(id, axisId, count) {
      const c = this.upgradeCost(id, axisId, count || 1);
      return isFinite(c) && this.cash >= c && this.lines[id] && this.lines[id].unlocked;
    }

    /**
     * Buy `count` points on an axis — or pass 'max' to spend what's
     * affordable. Returns {bought, spent} so callers can react without
     * re-deriving anything.
     */
    buyUpgrade(id, axisId, count) {
      const l = this.lines[id], p = getProduct(id), axis = getAxis(axisId);
      if (!l || !p || !axis || !l.unlocked) return { bought: 0, spent: 0 };

      let plan;
      if (count === 'max') {
        plan = axisAffordable(p, axisId, l[axisId], this.cash, axis.max - l[axisId]);
      } else {
        const n = Math.max(1, count || 1);
        const bulk = P.axisBulkCost(p, axisId, l[axisId], n);
        plan = (bulk.levels === n && bulk.cost <= this.cash)
          ? { cost: bulk.cost, levels: n }
          : { cost: 0, levels: 0 };
      }
      if (plan.levels <= 0) return { bought: 0, spent: 0 };

      this.cash -= plan.cost;
      l[axisId] += plan.levels;
      this.stats.upgradesBought += plan.levels;
      this.emit('upgrade', {
        id, axis: axisId, levels: plan.levels, spent: plan.cost, level: l[axisId]
      });
      this.checkObjectives();
      return { bought: plan.levels, spent: plan.cost };
    }

    /* ================================================================= */
    /*  Objectives                                                       */
    /* ================================================================= */
    /** The three-deep active window, in chain order. */
    activeObjectives(n) {
      const out = [];
      for (let i = 0; i < OBJECTIVES.length && out.length < (n || 3); i++) {
        const o = OBJECTIVES[i];
        if (this.objectives.done[o.id]) continue;
        out.push(this.objectiveView(o));
      }
      return out;
    }

    objectiveView(o) {
      let cur = 0;
      try { cur = o.progress(this) || 0; } catch (e) { cur = 0; }
      return {
        id: o.id, name: o.name, desc: o.desc, reward: o.reward,
        current: Math.min(cur, o.target), target: o.target,
        progress: Math.min(1, cur / o.target),
        label: (o.money ? Format.money(Math.min(cur, o.target)) : Format.num(Math.min(cur, o.target))) +
          ' / ' + (o.money ? Format.money(o.target) : Format.num(o.target)),
        done: !!this.objectives.done[o.id]
      };
    }

    /** Completes any satisfied objective in the active window and pays out. */
    checkObjectives() {
      const active = [];
      for (let i = 0; i < OBJECTIVES.length && active.length < 3; i++) {
        if (!this.objectives.done[OBJECTIVES[i].id]) active.push(OBJECTIVES[i]);
      }
      for (const o of active) {
        let cur = 0;
        try { cur = o.progress(this) || 0; } catch (e) { continue; }
        if (cur < o.target) continue;

        this.objectives.done[o.id] = now();
        this.stats.objectivesDone++;
        if (o.reward) {
          if (o.reward.cash) {
            this.cash += o.reward.cash;
            this.stats.totalEarned += o.reward.cash;
          }
          if (o.reward.xp) this.addXp(o.reward.xp);
        }
        this.emit('objective', { id: o.id, name: o.name, reward: o.reward });
      }
    }

    /* ================================================================= */
    /*  Save / load                                                      */
    /* ================================================================= */
    serialize() {
      const lines = {};
      for (const id in this.lines) {
        const l = this.lines[id];
        lines[id] = {
          u: l.unlocked ? 1 : 0,
          s: l.speed, p: l.supply, r: l.robot, q: l.quality,
          n: l.shipped, f: +l._partial.toFixed(4), e: l.earned
        };
      }
      return {
        v: BALANCE.saveVersion,
        t: now(),
        cash: this.cash, level: this.level, xp: this.xp,
        sel: this.selectedLine,
        gm: this.globalMultiplier,
        lines,
        obj: this.objectives.done,
        stats: this.stats
      };
    }

    save() {
      this.lastSaved = now();
      let ok = false;
      try {
        const blob = JSON.stringify(this.serialize());
        ok = Storage.set(this.saveKey, blob);
      } catch (e) {
        console.error('[economy] save failed:', e);
      }
      this.emit('save', { ok, at: this.lastSaved });
      return ok;
    }

    /**
     * Load, migrate, and settle offline earnings.
     * @returns {object|null} the offline report, or null on a fresh start.
     */
    load() {
      const raw = Storage.get(this.saveKey);
      if (!raw) { this.emit('load', { fresh: true }); return null; }

      let data;
      try { data = JSON.parse(raw); }
      catch (e) {
        console.warn('[economy] corrupt save discarded');
        Storage.remove(this.saveKey);
        this.emit('load', { fresh: true, corrupt: true });
        return null;
      }
      if (!data || typeof data !== 'object') { this.emit('load', { fresh: true }); return null; }

      this.applySave(this.migrate(data));
      const report = this.settleOffline(data.t);
      this.emit('load', { fresh: false, offline: report });
      return report;
    }

    /** Forward-migrate older schemas. v1 is the baseline. */
    migrate(data) {
      if (!data.v || data.v < 1) data.v = 1;
      return data;
    }

    applySave(d) {
      const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
      const int = (v, fallback, lo, hi) => {
        const n = Math.floor(num(v, fallback));
        return Math.max(lo, Math.min(hi, n));
      };

      this.cash = Math.max(0, num(d.cash, 0));
      this.level = int(d.level, 1, 1, 999);
      this.xp = Math.max(0, num(d.xp, 0));
      this.globalMultiplier = num(d.gm, 1);
      this.selectedLine = getProduct(d.sel) ? d.sel : LIST[0].id;

      LIST.forEach(p => {
        const l = this.lines[p.id];
        const s = (d.lines && d.lines[p.id]) || null;
        if (!s) return;
        l.unlocked = !!s.u;
        l.speed = int(s.s, 1, 1, 500);
        l.supply = int(s.p, 1, 1, 500);
        l.robot = int(s.r, 1, 1, 500);
        l.quality = int(s.q, 1, 1, 5);
        l.shipped = Math.max(0, Math.floor(num(s.n, 0)));
        l._partial = Math.max(0, num(s.f, 0));
        l.earned = Math.max(0, num(s.e, 0));
      });
      // the starter line is never locked, whatever the save claims
      this.lines[LIST[0].id].unlocked = true;

      if (d.obj && typeof d.obj === 'object') {
        const done = {};
        for (const o of OBJECTIVES) if (d.obj[o.id]) done[o.id] = d.obj[o.id];
        this.objectives.done = done;
      }
      if (d.stats && typeof d.stats === 'object') {
        for (const k in this.stats) {
          this.stats[k] = num(d.stats[k], this.stats[k]);
        }
      }
    }

    /* ================================================================= */
    /*  Offline earnings — capped at 24 h at reduced efficiency          */
    /* ================================================================= */
    settleOffline(savedAt) {
      const stamp = (typeof savedAt === 'number' && isFinite(savedAt)) ? savedAt : 0;
      const away = (now() - stamp) / 1000;

      // negative = clock moved backwards; ignore rather than pay out
      if (!(away > BALANCE.offlineMinSeconds)) { this.offlineReport = null; return null; }

      const capped = Math.min(away, BALANCE.offlineCapSeconds);
      const rateBefore = this.incomePerMinute();
      const got = this._accrue(capped, this.offlineEfficiency);

      this.stats.offlineEarned += got.cash;
      const report = {
        away, awaySeconds: capped,
        capped: away > BALANCE.offlineCapSeconds,
        capHours: BALANCE.offlineCapSeconds / 3600,
        efficiency: this.offlineEfficiency,
        ratePerMinute: rateBefore,
        earned: got.cash, units: got.units, xp: got.xp,
        text: Format.money(got.cash) + ' while away for ' + Format.time(away)
      };
      this.offlineReport = report;
      this.checkObjectives();
      this.emit('offline', report);
      return report;
    }

    /** Wipe the save and start over. */
    hardReset() {
      Storage.remove(this.saveKey);
      this.reset(false);
      this.save();
    }

    /* ------------------------------------------------- debug / support */
    snapshot() {
      return {
        cash: Format.money(this.cash),
        rate: Format.rate(this.incomePerMinute()),
        level: this.level,
        xp: Math.floor(this.xp) + '/' + this.xpToNext(),
        lines: this.unlockedLines().map(p => p.id + ' ' +
          Format.rate(this.lineIncomePerMinute(p.id))),
        objectives: this.activeObjectives().map(o => o.name + ' ' + o.label)
      };
    }

    /** Persist on the way out — tab close, backgrounding, mobile swipe-away. */
    installLifecycleHooks() {
      const flush = () => { this._saveClock = 0; this.save(); };
      global.addEventListener('beforeunload', flush);
      global.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flush();
        else if (this.settleOnReturn !== false) {
          // a backgrounded tab throttles rAF; settle the gap as offline time
          const r = this.settleOffline(this.lastSaved);
          if (r) this.emit('resume', r);
        }
      });
      return this;
    }
  }

  /* =================================================================== */
  global.ECONOMY = { GameState, Storage, Emitter, Format };
})(window);
