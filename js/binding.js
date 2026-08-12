/* =====================================================================
   binding.js — the seam between the economy and the renderer.
   ---------------------------------------------------------------------
   The state is authoritative and continuous: money accrues from a rate,
   never from a crate touching a truck. The factory floor is a VIEW of
   that rate. Keeping the causality one-way (state → visuals, never the
   reverse) is what stops a dropped frame, a background tab, or an offline
   catch-up from desyncing the books.

   What the floor shows for the selected line:
     throughput   → belt speed, payload density, arm cycle, truck cadence
     parts quality→ share of premium-coloured payload + arm payload colour
     the product  → the entire payload palette

   Because upgrade multipliers are unbounded but belt speed is not, every
   mapping runs through a log compressor: each 10× of throughput buys one
   more "step" of visible motion, so level 5 and level 500 both read
   correctly without the belt turning into a blur.

     const { state, binding } = BINDING.bootGame(GAME);
     // afterwards: window.STATE (economy) and window.VIEW (this binding)
   ===================================================================== */
(function (global) {
  'use strict';

  const { M } = global.ISO;
  const P = global.PRODUCTS;
  const Format = P.Format;

  /* Visible motion limits — the floor never exceeds these, whatever the
     economy says. */
  const VIS = {
    beltMin: 0.75, beltMax: 4.2,
    armMin: 0.85, armMax: 3.9,       // seconds per pick-and-place cycle
    spacingMin: 0.5, spacingMax: 1.7,
    truckWaitMin: 1.8, truckWaitMax: 5.6,
    lerp: 2.5                        // how fast visuals chase a new target
  };

  /** 1 at rest, +1 per decade of throughput. Keeps late game legible. */
  function compress(mult) {
    return 1 + Math.log10(Math.max(1, mult));
  }

  /* =================================================================== */
  class FactoryBinding {
    constructor(engine, state) {
      this.engine = engine;
      this.state = state;

      this.belts = engine.byTag('conveyor');
      this.arms = engine.byTag('arm');
      this.trucks = engine.byTag('truck');
      this.docks = engine.byTag('dock');

      // live values, eased toward the targets computed in sync()
      this.beltSpeed = 1.1;
      this.armCycle = 3.4;
      this.target = { beltSpeed: 1.1, armCycle: 3.4, spacing: 1.4, truckWait: 4.6 };

      this.lineId = state.selectedLine;
      this._hudClock = 0;
      this._hud = {
        cash: document.getElementById('stat-cash'),
        rate: document.getElementById('stat-rate'),
        level: document.getElementById('stat-level')
      };

      // re-derive whenever anything economic moves
      this._off = state.on('change', () => this.sync());
      state.on('unlock', e => { if (e && e.id) this.setLine(e.id); });

      this.setLine(this.lineId, true);
    }

    dispose() { if (this._off) this._off(); }

    /* ---------------------------------------------------------- palette */
    /**
     * Payload pool for a line: the product's own colours, with a share of
     * premium (accent-tinted, slightly larger) pieces that grows with the
     * parts-quality stars — so a 5★ line visibly ships better goods.
     */
    paletteFor(product, stars) {
      const pool = product.palette.map(k => ({ color: k.color, size: k.size }));
      const premium = Math.max(0, stars - 1);          // 0 … 4
      for (let i = 0; i < premium; i++) {
        pool.push({ color: product.accent, size: 0.34 + i * 0.012 });
      }
      return pool;
    }

    /* ------------------------------------------------------------ line */
    /** Point the factory floor at a different production line. */
    setLine(id, force) {
      const st = this.state;
      if (!st.line(id) || !st.line(id).unlocked) return false;
      if (!force && id === this.lineId) return false;

      this.lineId = id;
      st.selectedLine = id;

      const product = st.product(id);
      const kinds = this.paletteFor(product, st.line(id).quality);
      this.belts.forEach(b => b.setKinds(kinds));
      this.arms.forEach((a, i) => {
        a.payloadColor = product.palette[i % product.palette.length].color;
      });

      this.sync();
      if (force !== true) st.emit('select', { id, product });
      return true;
    }

    /* ------------------------------------------------------------ sync */
    /** Recompute visual targets from the current economy state. */
    sync() {
      const st = this.state, id = this.lineId;
      const line = st.line(id);
      if (!line) return;

      // quality changed → refresh the premium share of the payload
      const stars = line.quality;
      if (stars !== this._stars) {
        this._stars = stars;
        const kinds = this.paletteFor(st.product(id), stars);
        this.belts.forEach(b => b.setKinds(kinds));
      }

      const power = compress(st.throughputMultiplier(id));   // 1 → ~4
      const t = this.target;
      t.beltSpeed = M.clamp(0.78 * power, VIS.beltMin, VIS.beltMax);
      t.armCycle = M.clamp(3.9 / (0.55 + 0.45 * power), VIS.armMin, VIS.armMax);
      t.spacing = M.clamp(1.9 - 0.34 * power, VIS.spacingMin, VIS.spacingMax);
      t.truckWait = M.clamp(6.2 - 1.1 * power, VIS.truckWaitMin, VIS.truckWaitMax);
    }

    /* ---------------------------------------------------------- update */
    update(dt) {
      const t = this.target;

      // ease the continuous values so an upgrade spins the floor up
      this.beltSpeed = M.damp(this.beltSpeed, t.beltSpeed, VIS.lerp, dt);
      this.armCycle = M.damp(this.armCycle, t.armCycle, VIS.lerp, dt);

      for (let i = 0; i < this.belts.length; i++) {
        const b = this.belts[i];
        // the feeder line runs a touch hotter than the two main runs
        b.speed = this.beltSpeed * (b.dir === '+y' ? 1.3 : 1);
        b.setSpacing(t.spacing);
      }
      for (let i = 0; i < this.arms.length; i++) {
        // stagger the arms so they never beat in lockstep
        this.arms[i].cycle = this.armCycle * (1 + i * 0.06);
      }
      for (let i = 0; i < this.trucks.length; i++) this.trucks[i].wait = t.truckWait;

      this._updateHud(dt);
    }

    /* ------------------------------------------------------------- hud */
    /** Diagnostics chips only — the real panels arrive in Step 3. */
    _updateHud(dt) {
      this._hudClock += dt;
      if (this._hudClock < 0.2) return;
      this._hudClock = 0;
      const st = this.state, h = this._hud;
      if (h.cash) h.cash.textContent = Format.num(st.cash);
      if (h.rate) h.rate.textContent = Format.num(st.incomePerMinute());
      if (h.level) h.level.textContent = st.level;
    }
  }

  /* =================================================================== */
  /*  Boot — wire state, binding and engine together                     */
  /* =================================================================== */
  function bootGame(engine) {
    if (!engine) { console.error('[isofactory] no engine to bind to'); return null; }
    const state = new global.ECONOMY.GameState();
    const report = state.load();
    state.installLifecycleHooks();

    const binding = new FactoryBinding(engine, state);

    // one fixed-step hook drives the books, then the floor that shows them
    engine.onTick = dt => { state.tick(dt); binding.update(dt); };

    // «STEP-3 HOOK» this is where the welcome-back modal will read from
    if (report) {
      console.log('[isofactory] offline: ' + report.text +
        ' (' + Format.pct(report.efficiency) + ' rate' +
        (report.capped ? ', capped at ' + report.capHours + 'h' : '') + ')');
    }

    global.STATE = state;
    global.VIEW = binding;
    return { state, binding, report };
  }

  global.BINDING = { FactoryBinding, bootGame, compress, VIS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootGame(global.GAME));
  } else {
    bootGame(global.GAME);
  }
})(window);
