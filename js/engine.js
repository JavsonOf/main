/* =====================================================================
   engine.js — canvas lifecycle, camera/input, the depth-sorted render
   list, the fixed-step simulation loop, and the Step-1 factory layout.
   ---------------------------------------------------------------------
   PUBLIC API (what Step 2 will build on)

     const g = window.GAME;
     g.iso                     projection (grid ⇄ screen)
     g.camera                  pan / zoom / auto-fit
     g.entities                live entity array
     g.add(entity)             insert (returns the entity)
     g.remove(entity|id)       delete
     g.byTag('conveyor')       lookup by tag
     g.pick(clientX, clientY)  screen px → {gx, gy} on the floor plane
     g.paused = true|false
     g.onTick = (dt, time)=>{} fixed-step economy hook, 60 Hz
     g.onRender = (ctx)=>{}    screen-space overlay hook (drawn last)
   ===================================================================== */
(function (global) {
  'use strict';

  const { Iso, Camera, M } = global.ISO;
  const E = global.ENTITIES;

  const STEP = 1 / 60;         // fixed simulation step (seconds)
  const MAX_STEPS = 5;         // spiral-of-death guard after a tab stall

  /* =================================================================== */
  /*  RenderList — collects draw commands, sorts them by depth           */
  /* =================================================================== */
  class RenderList {
    constructor(iso) {
      this.iso = iso;
      this.pool = [];
      this.n = 0;
    }

    begin() { this.n = 0; }

    add(depth, fn) {
      let it = this.pool[this.n];
      if (it) { it.d = depth; it.i = this.n; it.fn = fn; }
      else this.pool[this.n] = { d: depth, i: this.n, fn };
      this.n++;
    }

    flush(ctx) {
      const list = this.pool.slice(0, this.n);
      // painter's algorithm; index breaks ties so the order is stable
      list.sort((a, b) => (a.d - b.d) || (a.i - b.i));
      const iso = this.iso;
      for (let k = 0; k < list.length; k++) {
        ctx.save();
        list[k].fn(ctx, iso);
        ctx.restore();
      }
      return list.length;
    }
  }

  /* =================================================================== */
  /*  Engine                                                             */
  /* =================================================================== */
  class Engine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.iso = new Iso(64, 32, 32);
      this.camera = new Camera();
      this.rl = new RenderList(this.iso);

      this.entities = [];
      this.paused = false;
      this.time = 0;
      this.dpr = 1;
      this.viewW = 1; this.viewH = 1;

      this.world = { w: 24, d: 21, headroom: 4.6 };
      this.ground = null;

      this.onTick = null;      // «STEP-2 HOOK» economy update
      this.onRender = null;    // «STEP-2 HOOK» screen-space overlay

      this._acc = 0;
      this._last = 0;
      this._frames = 0; this._fpsClock = 0; this.fps = 0; this.drawCalls = 0;
      this._raf = 0;

      this._bindDom();
      this._bindInput();
      this.resize();
    }

    /* ------------------------------------------------------ entities */
    add(e) { this.entities.push(e); return e; }

    remove(target) {
      const id = typeof target === 'string' ? target : target && target.id;
      const i = this.entities.findIndex(e => e.id === id);
      if (i >= 0) this.entities.splice(i, 1);
      return i >= 0;
    }

    byTag(tag) { return this.entities.filter(e => e.tag === tag); }

    /* -------------------------------------------------------- canvas */
    _bindDom() {
      this.hud = {
        fps: document.getElementById('stat-fps'),
        draws: document.getElementById('stat-draws'),
        ents: document.getElementById('stat-ents'),
        zoom: document.getElementById('stat-zoom')
      };
    }

    /** Screen-space bounding box of the world at zoom 1. */
    worldBounds() {
      const iso = this.iso, W = this.world.w, D = this.world.d;
      return {
        minX: iso.x(0, D), maxX: iso.x(W, 0),
        minY: iso.y(0, 0, this.world.headroom), maxY: iso.y(W, D, -0.6)
      };
    }

    resize() {
      const c = this.canvas;
      const rect = c.getBoundingClientRect();
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));

      this.viewW = w; this.viewH = h; this.dpr = dpr;
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }

      this.camera.fit(w, h, this.worldBounds(), 0.88);
      if (!this._booted) { this.camera.snap(); this._booted = true; }
    }

    /* --------------------------------------------------------- input */
    _bindInput() {
      const c = this.canvas, cam = this.camera;
      let dragging = false, lastX = 0, lastY = 0, moved = 0;

      const ro = new ResizeObserver(() => this.resize());
      ro.observe(c);
      global.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

      c.addEventListener('pointerdown', ev => {
        dragging = true; moved = 0;
        lastX = ev.clientX; lastY = ev.clientY;
        c.setPointerCapture(ev.pointerId);
        c.classList.add('dragging');
      });

      c.addEventListener('pointermove', ev => {
        if (dragging) {
          const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
          lastX = ev.clientX; lastY = ev.clientY;
          moved += Math.abs(dx) + Math.abs(dy);
          cam.pan(dx, dy);
        }
        this.hoverAt(ev.clientX, ev.clientY);
      });

      const end = ev => {
        if (!dragging) return;
        dragging = false;
        c.classList.remove('dragging');
        if (c.hasPointerCapture && c.hasPointerCapture(ev.pointerId)) {
          c.releasePointerCapture(ev.pointerId);
        }
        // «STEP-2 HOOK» a short press is a tap on the tile under the cursor
        if (moved < 6 && this.onTileClick) {
          const g = this.pick(ev.clientX, ev.clientY);
          if (g) this.onTileClick(g);
        }
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => { if (this.ground) this.ground.hover = null; });

      c.addEventListener('wheel', ev => {
        ev.preventDefault();
        const r = c.getBoundingClientRect();
        cam.zoomAt(ev.clientX - r.left, ev.clientY - r.top,
          Math.pow(0.999, ev.deltaY * (ev.deltaMode === 1 ? 18 : 1)));
      }, { passive: false });

      global.addEventListener('keydown', ev => {
        const k = ev.key.toLowerCase();
        if (k === 'f') { cam.reset(); }
        else if (k === 'g') { if (this.ground) this.ground.showGrid = !this.ground.showGrid; }
        else if (k === ' ') { ev.preventDefault(); this.paused = !this.paused; }
      });

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this._last = performance.now();   // drop the gap
      });
    }

    /** Canvas-relative screen px → floor grid coords (null if off-plate). */
    pick(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const w = this.camera.toWorld(clientX - r.left, clientY - r.top);
      const g = this.iso.unproject(w.x, w.y, 0);
      const gx = Math.floor(g.gx), gy = Math.floor(g.gy);
      if (gx < 0 || gy < 0 || gx >= this.world.w || gy >= this.world.d) return null;
      return { gx, gy, fx: g.gx, fy: g.gy };
    }

    hoverAt(clientX, clientY) {
      if (!this.ground) return;
      this.ground.hover = this.pick(clientX, clientY);
    }

    /* ----------------------------------------------------------- loop */
    start() {
      this._last = performance.now();
      const frame = ts => {
        this._raf = requestAnimationFrame(frame);
        let dt = (ts - this._last) / 1000;
        this._last = ts;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.25) dt = 0.25;          // clamp after a stall

        // ---- fixed-step simulation -------------------------------
        if (!this.paused) {
          this._acc += dt;
          let steps = 0;
          while (this._acc >= STEP && steps < MAX_STEPS) {
            this._acc -= STEP; steps++;
            this.time += STEP;
            for (let i = 0; i < this.entities.length; i++) {
              const e = this.entities[i];
              if (e.update) e.update(STEP, this.time);
            }
            if (this.onTick) this.onTick(STEP, this.time);
          }
          if (steps === MAX_STEPS) this._acc = 0;
        }

        this.camera.update(dt);
        this.render();

        // ---- diagnostics -----------------------------------------
        this._frames++; this._fpsClock += dt;
        if (this._fpsClock >= 0.5) {
          this.fps = Math.round(this._frames / this._fpsClock);
          this._frames = 0; this._fpsClock = 0;
          if (this.hud.fps) {
            this.hud.fps.textContent = this.fps;
            this.hud.draws.textContent = this.drawCalls;
            this.hud.ents.textContent = this.entities.length;
            this.hud.zoom.textContent = this.camera.zoom.toFixed(2);
          }
        }
      };
      this._raf = requestAnimationFrame(frame);
      return this;
    }

    stop() { cancelAnimationFrame(this._raf); }

    /* --------------------------------------------------------- render */
    render() {
      const ctx = this.ctx, cam = this.camera;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.zoom, cam.zoom);

      const rl = this.rl;
      rl.begin();
      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (e.collect) e.collect(rl);
      }
      this.drawCalls = rl.flush(ctx);

      // screen-space pass (no camera transform) — Step 2 overlays
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.paused) this._drawPaused(ctx);
      if (this.onRender) this.onRender(ctx, this.viewW, this.viewH);
    }

    _drawPaused(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(6,9,13,.45)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.fillStyle = '#ffc832';
      ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('❚❚  PAUSED', this.viewW / 2, this.viewH / 2);
      ctx.restore();
    }
  }

  /* =================================================================== */
  /*  Factory layout — the Step-1 showcase scene                         */
  /* =================================================================== */
  function buildFactory(g) {
    const W = g.world.w, D = g.world.d;

    // ---- floor, road markings ---------------------------------------
    const ground = new E.Ground({
      w: W, d: D,
      road: { x0: -12, x1: W + 14, y: 17.0, d: 2.4 },
      marks: [
        { x: 2.0, y: 12.6, w: 18, d: 0.08 },
        { x: 2.0, y: 14.0, w: 18, d: 0.08 },
        { x: 3.0, y: 14.2, w: 3.2, d: 1.0, color: '#63f08a' },
        { x: 12.0, y: 14.2, w: 3.2, d: 1.0, color: '#63f08a' }
      ]
    });
    g.ground = g.add(ground);

    // ---- production lines -------------------------------------------
    // B: raw feed running right-to-left across the hall
    const beltB = g.add(new E.Conveyor({
      x: 18.5, y: 9.0, len: 15, dir: '-x', speed: 1.35, spacing: 1.15
    }));
    // A: finished goods running left-to-right toward the docks
    const beltA = g.add(new E.Conveyor({
      x: 2.0, y: 13.2, len: 16, dir: '+x', speed: 1.05, spacing: 1.4
    }));
    // C: feeder dropping stock onto belt B
    const beltC = g.add(new E.Conveyor({
      x: 6.6, y: 3.4, len: 5, dir: '+y', speed: 1.5, spacing: 1.0
    }));

    // ---- transfer arms straddling the two lines ---------------------
    const armY = 11.15;
    [[6.2, 0.00], [10.4, 0.33], [14.6, 0.66]].forEach(([ax, ph], i) => {
      g.add(new E.RobotArm({
        x: ax, y: armY, phase: ph, cycle: 3.2 + i * 0.25,
        pick: [ax, 9.0, 0.52],
        place: [ax, 13.2, 0.52],
        payloadColor: ['#5aa9e6', '#8ad07a', '#d46f6f'][i]
      }));
    });

    // palletiser lifting finished goods from belt A onto the dock apron
    g.add(new E.RobotArm({
      x: 16.9, y: 15.4, phase: 0.5, cycle: 3.8,
      L1: 1.35, L2: 1.15,
      pick: [16.9, 13.4, 0.52],
      place: [15.0, 15.9, 1.05],
      payloadColor: '#c98f4b'
    }));

    // ---- loading docks + truck traffic ------------------------------
    const dock1 = g.add(new E.LoadingDock({ x: 3.0, y: 15.2 }));
    const dock2 = g.add(new E.LoadingDock({ x: 12.0, y: 15.2 }));

    const truckA = g.add(new E.Truck({
      laneY: 18.2, dockX: 4.6, dir: 1, spawnX: -9, exitX: W + 11,
      color: '#2f6fd0', wait: 5.0, delay: 1.0
    }));
    const truckB = g.add(new E.Truck({
      laneY: 18.2, dockX: 13.6, dir: 1, spawnX: -9, exitX: W + 11,
      color: '#c8503f', trailer: '#d8dee6', wait: 4.4, delay: 9.0
    }));
    // one lane, two rigs: nobody pulls out until the road is clear
    truckA.canStart = () => truckB.state === 'idle';
    truckB.canStart = () => truckA.state === 'idle';
    dock1.watch = truckA;
    dock2.watch = truckB;

    // ---- power row along the back wall ------------------------------
    g.add(new E.Generator({ x: 2.2, y: 0.5, rpm: 2.2 }));
    g.add(new E.Generator({ x: 9.6, y: 0.5, rpm: 2.9, accent: '#5aa9e6' }));
    g.add(new E.Generator({ x: 13.0, y: 0.5, rpm: 1.8 }));
    g.add(new E.Silo({ x: 17.6, y: 1.3, fill: 0.72 }));
    g.add(new E.Silo({ x: 19.8, y: 1.3, r: 0.7, h: 2.6, fill: 0.44, color: '#7d8794' }));

    // ---- warehouse stock --------------------------------------------
    g.add(new E.CrateStack({ x: 20.6, y: 5.0, cols: 2, rows: 2, levels: 3, seed: 3 }));
    g.add(new E.CrateStack({ x: 20.6, y: 8.2, cols: 2, rows: 3, levels: 2, seed: 11, color: '#a5713a' }));
    g.add(new E.CrateStack({ x: 0.7, y: 5.4, cols: 2, rows: 2, levels: 2, seed: 7 }));
    g.add(new E.CrateStack({ x: 0.7, y: 8.4, cols: 2, rows: 2, levels: 3, seed: 23, color: '#9a8a54' }));
    g.add(new E.CrateStack({ x: 19.9, y: 15.4, cols: 2, rows: 2, levels: 2, seed: 31 }));
    g.add(new E.CrateStack({ x: 7.4, y: 15.6, cols: 3, rows: 1, levels: 2, seed: 41, color: '#8f6a3c' }));

    // ---- lighting rig -------------------------------------------------
    g.add(new E.FloorLight({ x: 0.6, y: 11.6 }));
    g.add(new E.FloorLight({ x: 22.4, y: 11.6 }));
    g.add(new E.FloorLight({ x: 8.6, y: 16.6, h: 3.4 }));
    g.add(new E.FloorLight({ x: 22.4, y: 2.6, h: 2.6 }));

    return g;
  }

  /* =================================================================== */
  /*  Boot                                                               */
  /* =================================================================== */
  function boot() {
    const canvas = document.getElementById('factory-canvas');
    const engine = new Engine(canvas);
    buildFactory(engine);
    engine.resize();
    engine.camera.snap();
    engine.start();
    global.GAME = engine;
    return engine;
  }

  global.FactoryEngine = { Engine, RenderList, buildFactory, boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
