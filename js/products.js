/* =====================================================================
   products.js — the static content layer: product registry, the four
   upgrade axes, the level curve, and the objective chain.
   ---------------------------------------------------------------------
   Everything here is DATA plus pure functions. No state, no DOM, no
   canvas. economy.js owns the mutable save; binding.js pushes it at the
   renderer. Rebalancing the game means editing this file and nothing else.

   INCOME MODEL
     throughput(units/min) = base.rate  × speed × supply × robot
     value($/unit)         = base.value × quality × global
     income($/min)         = throughput × value

     Speed / Supply / Robot are unbounded levels with additive multipliers
     and exponential costs — the classic idle curve where each level buys
     slightly less than the last. Parts Quality is the discrete 1–5 star
     axis: rare, expensive, and the only lever on unit VALUE, so it stays
     the interesting decision rather than a fifth throughput slider.
   ===================================================================== */
(function (global) {
  'use strict';

  const HOUR = 3600, DAY = 86400;

  /* =================================================================== */
  /*  Product registry — 8 lines, tier 0 → 7                             */
  /* =================================================================== */
  /**
   * rate      units/min at level 1, all axes at base
   * value     $ per unit before quality
   * unlockLv  player level required before the line can be bought
   * unlockCost cash price to open the line
   * palette   belt payload colours — binding.js feeds these to the engine
   * xp        xp granted per unit produced
   */
  const PRODUCTS = [
    {
      id: 'shirt', name: 'SHIRT', short: 'SHT', tier: 0,
      blurb: 'Cotton basics. Everybody needs one.',
      rate: 6.0, value: 1.2, unlockLv: 1, unlockCost: 0, xp: 1,
      accent: '#e6e2d8',
      palette: [
        { color: '#e6e2d8', size: 0.34 }, { color: '#c8d6e5', size: 0.30 },
        { color: '#f0c6c6', size: 0.32 }
      ]
    },
    {
      id: 'kicks', name: 'Fly Kicks', short: 'FKS', tier: 1,
      blurb: 'Injection-moulded soles, questionable branding.',
      rate: 5.4, value: 9, unlockLv: 3, unlockCost: 1.5e3, xp: 3,
      accent: '#ff6b4a',
      palette: [
        { color: '#ff6b4a', size: 0.33 }, { color: '#2ec4b6', size: 0.30 },
        { color: '#f7f7f7', size: 0.31 }
      ]
    },
    {
      id: 'rayblock', name: 'Ray Block', short: 'RYB', tier: 2,
      blurb: 'Polarised lenses. Legally distinct from anything.',
      rate: 5.0, value: 62, unlockLv: 6, unlockCost: 2.2e4, xp: 8,
      accent: '#5bc0eb',
      palette: [
        { color: '#1f2833', size: 0.30 }, { color: '#5bc0eb', size: 0.28 },
        { color: '#ffd166', size: 0.29 }
      ]
    },
    {
      id: 'smellcohol', name: 'Smellcohol', short: 'SML', tier: 3,
      blurb: 'Eau de industrial solvent. Wildly popular.',
      rate: 4.6, value: 430, unlockLv: 10, unlockCost: 3.0e5, xp: 20,
      accent: '#b892ff',
      palette: [
        { color: '#b892ff', size: 0.28 }, { color: '#ffd6e0', size: 0.30 },
        { color: '#7ae7c7', size: 0.27 }
      ]
    },
    {
      id: 'pumps', name: 'Pumps', short: 'PMP', tier: 4,
      blurb: 'Hand-finished heels at machine speed.',
      rate: 4.2, value: 3.1e3, unlockLv: 15, unlockCost: 4.2e6, xp: 55,
      accent: '#d64550',
      palette: [
        { color: '#d64550', size: 0.32 }, { color: '#2b2b2b', size: 0.29 },
        { color: '#e8c07d', size: 0.30 }
      ]
    },
    {
      id: 'diveclock', name: 'Dive Clock', short: 'DVC', tier: 5,
      blurb: '300 m rated. Never leaves the office.',
      rate: 3.8, value: 2.3e4, unlockLv: 21, unlockCost: 6.0e7, xp: 150,
      accent: '#ffb703',
      palette: [
        { color: '#0f4c81', size: 0.29 }, { color: '#c0c0c0', size: 0.27 },
        { color: '#ffb703', size: 0.28 }
      ]
    },
    {
      id: 'strap', name: 'Strap', short: 'STP', tier: 6,
      blurb: 'The margin was always in the accessories.',
      rate: 3.4, value: 1.8e5, unlockLv: 28, unlockCost: 9.0e8, xp: 420,
      accent: '#c9ada7',
      palette: [
        { color: '#6b4226', size: 0.28 }, { color: '#2f3e46', size: 0.26 },
        { color: '#c9ada7', size: 0.29 }
      ]
    },
    {
      id: 'drone', name: 'Drone', short: 'DRN', tier: 7,
      blurb: 'Ships itself. Vertical integration, finally.',
      rate: 3.0, value: 1.5e6, unlockLv: 36, unlockCost: 1.4e10, xp: 1200,
      accent: '#ef233c',
      palette: [
        { color: '#2b2d42', size: 0.33 }, { color: '#8d99ae', size: 0.30 },
        { color: '#ef233c', size: 0.31 }
      ]
    }
  ];

  /** Upgrade prices are anchored to ~5 s of the line's own base income. */
  PRODUCTS.forEach(p => { p.tierBase = Math.max(12, p.rate * p.value * 5); });

  const BY_ID = {};
  PRODUCTS.forEach((p, i) => { p.index = i; BY_ID[p.id] = p; });
  const getProduct = id => BY_ID[id] || null;

  /* =================================================================== */
  /*  The four upgrade axes                                              */
  /* =================================================================== */
  const STAR_VALUE = [1, 1.55, 2.4, 3.8, 6.0];      // index = stars - 1
  const STAR_COST = [55, 320, 1900, 12000];         // cost to reach star i+2

  const AXES = [
    {
      id: 'speed', name: 'Line Speed', short: 'SPD',
      desc: 'Belt velocity. Straight throughput.',
      kind: 'level', max: 500, step: 0.07, costMul: 1.0, growth: 1.150,
      affects: 'throughput'
    },
    {
      id: 'supply', name: 'Supply Rate', short: 'SUP',
      desc: 'Raw stock feeding the head of the line.',
      kind: 'level', max: 500, step: 0.06, costMul: 1.3, growth: 1.160,
      affects: 'throughput'
    },
    {
      id: 'robot', name: 'Robot Multiplier', short: 'BOT',
      desc: 'Arm cycle rate — more transfers per minute.',
      kind: 'level', max: 500, step: 0.09, costMul: 2.2, growth: 1.190,
      affects: 'throughput'
    },
    {
      id: 'quality', name: 'Parts Quality', short: 'QTY',
      desc: 'Component grade. The only lever on unit value.',
      kind: 'stars', max: 5, costMul: 1.0, affects: 'value'
    }
  ];

  const AXIS_BY_ID = {};
  AXES.forEach(a => { AXIS_BY_ID[a.id] = a; });
  const getAxis = id => AXIS_BY_ID[id] || null;

  /** Multiplier delivered by `level` on a given axis. */
  function axisMultiplier(axisId, level) {
    const a = AXIS_BY_ID[axisId];
    if (!a) return 1;
    if (a.kind === 'stars') {
      return STAR_VALUE[Math.max(0, Math.min(STAR_VALUE.length - 1, level - 1))];
    }
    return 1 + a.step * Math.max(0, level - 1);
  }

  /**
   * Cost to buy the NEXT point on an axis. Returns Infinity at max — the
   * caller can compare against cash without special-casing the cap.
   */
  function axisCost(product, axisId, currentLevel) {
    const a = AXIS_BY_ID[axisId];
    if (!a || !product) return Infinity;
    if (currentLevel >= a.max) return Infinity;
    if (a.kind === 'stars') {
      return Math.ceil(product.tierBase * STAR_COST[currentLevel - 1]);
    }
    return Math.ceil(product.tierBase * a.costMul *
      Math.pow(a.growth, Math.max(0, currentLevel - 1)));
  }

  /**
   * Total cost of buying `count` consecutive levels — powers the "buy x10 /
   * buy max" controls Step 3 will hang off this.
   */
  function axisBulkCost(product, axisId, currentLevel, count) {
    let total = 0, lvl = currentLevel;
    for (let i = 0; i < count; i++) {
      const c = axisCost(product, axisId, lvl);
      if (!isFinite(c)) break;
      total += c; lvl++;
    }
    return { cost: total, levels: lvl - currentLevel };
  }

  /** How many levels `budget` buys on an axis, and what that costs. */
  function axisAffordable(product, axisId, currentLevel, budget, cap) {
    let spent = 0, lvl = currentLevel, n = 0;
    const limit = cap == null ? 1000 : cap;   // 0 is a legitimate cap
    while (n < limit) {
      const c = axisCost(product, axisId, lvl);
      if (!isFinite(c) || spent + c > budget) break;
      spent += c; lvl++; n++;
    }
    return { cost: spent, levels: n };
  }

  /* =================================================================== */
  /*  Player level curve                                                 */
  /* =================================================================== */
  /**
   * XP required to go from `level` to `level + 1`.
   *
   * XP income scales with throughput, which is exponential — so a purely
   * polynomial curve gets outrun and the player pins the level cap in a
   * few days, collapsing every unlock gate into one moment. The geometric
   * term keeps levels meaningful for the whole run: ~level 3 in the first
   * hour, the last unlock gate (36) inside a couple of days, and triple
   * digits still worth chasing deep into the late game.
   */
  const LEVEL_CAP = 999;
  function xpForNext(level) {
    if (level >= LEVEL_CAP) return Infinity;
    return Math.ceil(55 * Math.pow(level, 1.9) * Math.pow(1.12, level - 1));
  }

  /** Total XP banked at the start of `level`. */
  function xpTotalTo(level) {
    let t = 0;
    for (let l = 1; l < level; l++) t += xpForNext(l);
    return t;
  }

  /* =================================================================== */
  /*  Objectives — an ordered chain; three are active at a time          */
  /* =================================================================== */
  /**
   * Each objective exposes progress(state) → current value, and a target.
   * Keeping them declarative means the tracker in economy.js never grows a
   * switch statement, and Step 3 can render any of them generically.
   */
  const OBJECTIVES = [
    {
      id: 'ship-25', name: 'First Run', desc: 'Ship 25 SHIRT units',
      target: 25, reward: { cash: 80, xp: 25 },
      progress: s => s.lines.shirt.shipped
    },
    {
      id: 'upgrade-any', name: 'Tune the Line', desc: 'Buy any upgrade',
      target: 1, reward: { cash: 150, xp: 30 },
      progress: s => s.stats.upgradesBought
    },
    {
      id: 'speed-5', name: 'Wind It Up', desc: 'SHIRT line speed to level 5',
      target: 5, reward: { cash: 400, xp: 60 },
      progress: s => s.lines.shirt.speed
    },
    {
      id: 'earn-2k', name: 'Turning a Profit', desc: 'Earn $2,000 total',
      target: 2e3, reward: { cash: 500, xp: 90 }, money: true,
      progress: s => s.stats.totalEarned
    },
    {
      id: 'unlock-kicks', name: 'Diversify', desc: 'Unlock the Fly Kicks line',
      target: 1, reward: { cash: 1.2e3, xp: 150 },
      progress: s => s.lines.kicks.unlocked ? 1 : 0
    },
    {
      id: 'quality-2', name: 'Better Parts', desc: 'Reach 2★ parts on any line',
      target: 2, reward: { cash: 3e3, xp: 200 },
      progress: s => s.maxQuality()
    },
    {
      id: 'level-6', name: 'Floor Manager', desc: 'Reach player level 6',
      target: 6, reward: { cash: 8e3, xp: 0 },
      progress: s => s.level
    },
    {
      id: 'unlock-rayblock', name: 'Eyewear Money', desc: 'Unlock the Ray Block line',
      target: 1, reward: { cash: 1.5e4, xp: 600 },
      progress: s => s.lines.rayblock.unlocked ? 1 : 0
    },
    {
      id: 'ship-5k', name: 'Volume Play', desc: 'Ship 5,000 units across all lines',
      target: 5e3, reward: { cash: 4e4, xp: 900 },
      progress: s => s.stats.totalShipped
    },
    {
      id: 'robot-15', name: 'Robot Army', desc: 'Any line to robot level 15',
      target: 15, reward: { cash: 1.2e5, xp: 1.4e3 },
      progress: s => s.maxAxis('robot')
    },
    {
      id: 'unlock-smellcohol', name: 'Scent of Success', desc: 'Unlock the Smellcohol line',
      target: 1, reward: { cash: 2.5e5, xp: 2.5e3 },
      progress: s => s.lines.smellcohol.unlocked ? 1 : 0
    },
    {
      id: 'rate-10k', name: 'Ten a Minute', desc: 'Reach $10,000 / min',
      target: 1e4, reward: { cash: 6e5, xp: 4e3 }, money: true,
      progress: s => s.incomePerMinute()
    },
    {
      id: 'unlock-pumps', name: 'Heel Turn', desc: 'Unlock the Pumps line',
      target: 1, reward: { cash: 3e6, xp: 8e3 },
      progress: s => s.lines.pumps.unlocked ? 1 : 0
    },
    {
      id: 'quality-5', name: 'Flawless', desc: 'Reach 5★ parts on any line',
      target: 5, reward: { cash: 2e7, xp: 2e4 },
      progress: s => s.maxQuality()
    },
    {
      id: 'level-21', name: 'Plant Director', desc: 'Reach player level 21',
      target: 21, reward: { cash: 8e7, xp: 0 },
      progress: s => s.level
    },
    {
      id: 'unlock-diveclock', name: 'Time Piece', desc: 'Unlock the Dive Clock line',
      target: 1, reward: { cash: 1.5e8, xp: 6e4 },
      progress: s => s.lines.diveclock.unlocked ? 1 : 0
    },
    {
      id: 'unlock-strap', name: 'Where the Margin Is', desc: 'Unlock the Strap line',
      target: 1, reward: { cash: 2e9, xp: 2e5 },
      progress: s => s.lines.strap.unlocked ? 1 : 0
    },
    {
      id: 'all-lines', name: 'Full Catalogue', desc: 'Unlock all 8 production lines',
      target: 8, reward: { cash: 5e10, xp: 1e6 },
      progress: s => s.unlockedCount()
    }
  ];

  /* =================================================================== */
  /*  Boosters — short, free, cooldown-gated surges                      */
  /* =================================================================== */
  /**
   * `mult` keys fold into the income model at three different points:
   *   throughput → units/min (so the belts visibly speed up too)
   *   income     → $/unit
   *   xp         → xp/unit
   * `instant` pays a lump sum of the current rate instead of running a timer.
   * Cooldown starts on activation, so a booster's real cadence is
   * cooldown, not cooldown + duration.
   */
  const BOOSTERS = [
    {
      id: 'overdrive', name: 'Overdrive', icon: '⚡',
      desc: '2× income for 60s', tone: '#ffc832',
      mult: { income: 2 }, duration: 60, cooldown: 300
    },
    {
      id: 'turbo', name: 'Belt Turbo', icon: '🏭',
      desc: '1.5× throughput for 90s', tone: '#38d9d0',
      mult: { throughput: 1.5 }, duration: 90, cooldown: 360
    },
    {
      id: 'surge', name: 'XP Surge', icon: '⭐',
      desc: '3× XP for 120s', tone: '#b892ff',
      mult: { xp: 3 }, duration: 120, cooldown: 420
    },
    {
      id: 'shipment', name: 'Rush Shipment', icon: '💰',
      desc: 'Bank 30 min of income instantly', tone: '#7dffb0',
      instant: { minutes: 30 }, cooldown: 600
    }
  ];

  const BOOSTER_BY_ID = {};
  BOOSTERS.forEach(b => { BOOSTER_BY_ID[b.id] = b; });

  /* =================================================================== */
  /*  Balance constants — one place to tune the feel                     */
  /* =================================================================== */
  const BALANCE = {
    offlineEfficiency: 0.55,   // fraction of online rate earned while away
    offlineCapSeconds: 24 * HOUR,
    offlineMinSeconds: 60,     // shorter gaps aren't worth a report
    autosaveSeconds: 5,
    saveKey: 'isofactory.save.v1',
    saveVersion: 1,
    startingCash: 0,
    globalMultiplier: 1        // reserved for Step-4 prestige
  };

  /* =================================================================== */
  /*  Number formatting                                                  */
  /* =================================================================== */
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  const Format = {
    /** 1234567 → "1.23M". Compact and stable in width. */
    num(n, places) {
      if (!isFinite(n)) return '∞';
      const neg = n < 0; n = Math.abs(n);
      if (n < 1000) {
        const p = places == null ? (n < 10 && n % 1 !== 0 ? 1 : 0) : places;
        return (neg ? '-' : '') + n.toFixed(p);
      }
      let t = 0;
      while (n >= 1000 && t < SUFFIX.length - 1) { n /= 1000; t++; }
      const p = places == null ? (n < 10 ? 2 : n < 100 ? 1 : 0) : places;
      return (neg ? '-' : '') + n.toFixed(p) + SUFFIX[t];
    },
    money(n, places) { return '$' + Format.num(n, places); },
    rate(n) { return '$' + Format.num(n) + '/min'; },
    /** Seconds → "3h 04m", "12m 30s", "45s". */
    time(sec) {
      sec = Math.max(0, Math.floor(sec));
      const d = Math.floor(sec / DAY);
      const h = Math.floor((sec % DAY) / HOUR);
      const m = Math.floor((sec % HOUR) / 60);
      const s = sec % 60;
      if (d) return d + 'd ' + String(h).padStart(2, '0') + 'h';
      if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
      if (m) return m + 'm ' + String(s).padStart(2, '0') + 's';
      return s + 's';
    },
    stars(n) { return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); },
    pct(x) { return (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%'; }
  };

  /* =================================================================== */
  global.PRODUCTS = {
    PRODUCTS, BY_ID, getProduct,
    AXES, AXIS_BY_ID, getAxis, axisMultiplier, axisCost, axisBulkCost,
    axisAffordable, STAR_VALUE, STAR_COST,
    xpForNext, xpTotalTo, LEVEL_CAP, OBJECTIVES, BALANCE, Format,
    BOOSTERS, BOOSTER_BY_ID
  };
})(window);
