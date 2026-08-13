/* =====================================================================
   entities.js — every procedural prop in the factory.
   ---------------------------------------------------------------------
   Contract for the renderer:
     update(dt, time)   advance animation state (dt in seconds)
     collect(rl)        push draw commands: rl.add(depthKey, (ctx, iso) => {})

   Entities emit MANY commands (a conveyor emits one per tile, plus one per
   item) so the painter sort interleaves them correctly with everything
   standing around them.

   Nothing here knows about money, rates, or upgrades — Step 2 drives these
   objects purely through their public fields (speed, active, colour, and
   the spawn/dock hooks flagged with «STEP-2 HOOK»).
   ===================================================================== */
(function (global) {
  'use strict';

  const { M, Color, draw } = global.ISO;
  const D = draw;

  let __uid = 0;

  /* =================================================================== */
  /*  Base                                                               */
  /* =================================================================== */
  class Entity {
    constructor(o) {
      this.id = 'e' + (++__uid);
      this.x = 0; this.y = 0; this.z = 0;
      this.active = true;
      this.tag = 'entity';
      Object.assign(this, o || {});
      this.age = 0;
    }
    update(dt) { this.age += dt; }
    collect() { }
  }

  /* =================================================================== */
  /*  Ground — floor plate, road, dock apron, grid, hover tile           */
  /*  Drawn as a single command underneath everything else.              */
  /* =================================================================== */
  class Ground extends Entity {
    constructor(o) {
      super(Object.assign({ tag: 'ground', w: 24, d: 24, road: null, marks: [] }, o));
      this.showGrid = true;
      this.hover = null;          // {gx, gy} set by the engine on mousemove
      this.palette = {
        a: '#1d242e', b: '#212a35', edge: '#2c3947',
        rim: '#151b23', road: '#191d23', paint: '#e0c85a'
      };
    }

    collect(rl) {
      rl.add(-1e12, (ctx, iso) => {
        const W = this.w, Dp = this.d, P = this.palette;

        // --- slab side walls, so the plate reads as a solid block -----
        D.box(ctx, iso, {
          x: 0, y: 0, z: -0.6, w: W, d: Dp, h: 0.6,
          color: P.rim, top: P.a, outline: '#0d1218'
        });

        // --- tiles ---------------------------------------------------
        for (let gx = 0; gx < W; gx++) {
          for (let gy = 0; gy < Dp; gy++) {
            const n = M.hash(gx * 3.1, gy * 7.7);
            const base = ((gx + gy) & 1) ? P.a : P.b;
            D.diamond(ctx, iso, gx, gy, 0, 1, 1,
              Color.shade(base, (n - 0.5) * 0.09), null, 0);
          }
        }

        // --- painted floor markings ----------------------------------
        ctx.save();
        ctx.globalAlpha = 0.14;
        for (const m of (this.marks || [])) {
          D.diamond(ctx, iso, m.x, m.y, 0.002, m.w, m.d, m.color || '#ffc832');
        }
        ctx.restore();

        // --- grid ----------------------------------------------------
        if (this.showGrid) {
          ctx.save();
          ctx.strokeStyle = 'rgba(130,175,220,.075)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i <= W; i++) {
            ctx.moveTo(iso.x(i, 0), iso.y(i, 0));
            ctx.lineTo(iso.x(i, Dp), iso.y(i, Dp));
          }
          for (let j = 0; j <= Dp; j++) {
            ctx.moveTo(iso.x(0, j), iso.y(0, j));
            ctx.lineTo(iso.x(W, j), iso.y(W, j));
          }
          ctx.stroke();
          ctx.restore();
        }

        // --- road / truck lane ---------------------------------------
        if (this.road) {
          const r = this.road;
          D.diamond(ctx, iso, r.x0, r.y, 0.004, r.x1 - r.x0, r.d, P.road);
          // kerbs
          D.diamond(ctx, iso, r.x0, r.y - 0.12, 0.005, r.x1 - r.x0, 0.12, '#2a323d');
          D.diamond(ctx, iso, r.x0, r.y + r.d, 0.005, r.x1 - r.x0, 0.12, '#2a323d');
          // centre dashes
          ctx.save(); ctx.globalAlpha = 0.5;
          for (let s = r.x0 + 0.4; s < r.x1; s += 1.6) {
            D.diamond(ctx, iso, s, r.y + r.d / 2 - 0.05, 0.006, 0.8, 0.1, P.paint);
          }
          ctx.restore();
        }

        // --- outer rim highlight -------------------------------------
        D.fillPoly(ctx, iso, [
          [0, 0, 0], [W, 0, 0], [W, Dp, 0], [0, Dp, 0]
        ], null, 'rgba(150,200,255,.14)', 1.5);

        // --- hover highlight -----------------------------------------
        if (this.hover) {
          const h = this.hover, pulse = 0.35 + 0.2 * Math.sin(this.age * 5);
          D.diamond(ctx, iso, h.gx, h.gy, 0.01, 1, 1,
            `rgba(255,200,50,${0.10 + pulse * 0.10})`,
            `rgba(255,200,50,${0.5 + pulse * 0.3})`, 1.5);
        }
      });
    }
  }

  /* =================================================================== */
  /*  Conveyor — animated belt carrying items                            */
  /* =================================================================== */
  const ITEM_KINDS = [
    { color: '#c98f4b', size: 0.34, name: 'crate' },
    { color: '#5aa9e6', size: 0.30, name: 'part' },
    { color: '#8ad07a', size: 0.28, name: 'cell' },
    { color: '#d46f6f', size: 0.32, name: 'alloy' }
  ];

  class Conveyor extends Entity {
    /**
     * @param {object} o  {x, y, len, dir:'+x'|'-x'|'+y'|'-y', speed, width}
     */
    constructor(o) {
      super(Object.assign({
        tag: 'conveyor', len: 6, dir: '+x', speed: 1.1, width: 0.72,
        color: '#39424e', beltColor: '#15191f', railColor: '#4a5563',
        height: 0.34, autoSpawn: true, spacing: 1.0,
        /** Payload appearance pool; null = the default mixed crates. */
        kinds: null,
        /** «STEP-2 HOOK» called with the item when it runs off the end. */
        onDeliver: null
      }, o));

      const dirs = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
      const a = dirs[this.dir] || dirs['+x'];
      this.ax = a[0]; this.ay = a[1];
      this.px = -this.ay; this.py = this.ax;   // perpendicular (grid space)

      this.scroll = 0;
      this.items = [];
      if (this.autoSpawn) {
        for (let s = 0; s < this.len; s += this.spacing) {
          this.items.push(this._makeItem(s));
        }
      }
    }

    _pool() { return (this.kinds && this.kinds.length) ? this.kinds : ITEM_KINDS; }

    _makeItem(s, kind) {
      const pool = this._pool();
      const k = kind || pool[(Math.random() * pool.length) | 0];
      return { s, kind: k, spin: Math.random() * Math.PI, wobble: Math.random() * 6.28 };
    }

    /** Swap the payload appearance — existing items re-roll in place. */
    setKinds(kinds) {
      this.kinds = kinds;
      const pool = this._pool();
      for (const it of this.items) it.kind = pool[(Math.random() * pool.length) | 0];
    }

    /** Re-space the payload; only rebuilds when the gap really changed. */
    setSpacing(spacing) {
      const s = Math.max(0.25, spacing);
      if (Math.abs(s - this.spacing) < 0.05) return;
      this.spacing = s;
      if (!this.autoSpawn) return;
      const phase = this.items.length ? this.items[0].s % s : 0;
      this.items.length = 0;
      for (let t = phase; t < this.len; t += s) this.items.push(this._makeItem(t));
    }

    /** «STEP-2 HOOK» push a specific payload onto the tail of the belt. */
    spawnItem(kind) { this.items.push(this._makeItem(0, kind)); }

    /** Grid point at belt coordinate (s along, u across, z up). */
    point(s, u, z) {
      return [
        this.x + this.ax * s + this.px * u,
        this.y + this.ay * s + this.py * u,
        (z == null ? this.height : z)
      ];
    }

    /** Axis-aligned footprint for the (s,u) rectangle — boxes need x/y/w/d. */
    _rect(s0, s1, u0, u1) {
      const ax = this.ax, ay = this.ay, px = this.px, py = this.py;
      const c1x = this.x + ax * s0 + px * u0, c1y = this.y + ay * s0 + py * u0;
      const c2x = this.x + ax * s1 + px * u1, c2y = this.y + ay * s1 + py * u1;
      return {
        x: Math.min(c1x, c2x), y: Math.min(c1y, c2y),
        w: Math.abs(c2x - c1x), d: Math.abs(c2y - c1y)
      };
    }

    update(dt) {
      super.update(dt);
      if (!this.active) return;
      this.scroll = M.mod(this.scroll + this.speed * dt, 0.5);
      const v = this.speed * dt;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.s += v;
        if (it.s > this.len) {
          if (this.onDeliver) this.onDeliver(it);
          if (this.autoSpawn) { it.s -= this.len; it.kind = ITEM_KINDS[(Math.random() * 4) | 0]; }
          else this.items.splice(i, 1);
        }
      }
    }

    collect(rl) {
      const H = this.height, hw = this.width / 2;

      // ---- structure, one command per tile so props interleave -------
      for (let i = 0; i < this.len; i++) {
        const s0 = i, s1 = i + 1;
        const mid = this.point(i + 0.5, 0, 0);
        rl.add(rl.iso.depth(mid[0], mid[1], 0, 1), (ctx, iso) => {
          // contact shadow
          const sh = this._rect(s0, s1, -hw - 0.08, hw + 0.08);
          D.shadow(ctx, iso, sh.x, sh.y, sh.w, sh.d, 0.26);

          // support legs every other tile
          if (i % 2 === 0) {
            for (const u of [-hw + 0.08, hw - 0.16]) {
              const lr = this._rect(s0 + 0.35, s0 + 0.5, u, u + 0.1);
              D.box(ctx, iso, {
                x: lr.x, y: lr.y, z: 0, w: Math.max(lr.w, 0.1), d: Math.max(lr.d, 0.1),
                h: H - 0.06, color: '#2b333d'
              });
            }
          }

          // deck / chassis
          const deck = this._rect(s0, s1, -hw, hw);
          D.box(ctx, iso, {
            x: deck.x, y: deck.y, z: H - 0.1, w: deck.w, d: deck.d, h: 0.1,
            color: this.color, outline: '#151a20'
          });

          // belt surface
          const belt = this._rect(s0, s1, -hw + 0.07, hw - 0.07);
          D.diamond(ctx, iso, belt.x, belt.y, H + 0.001,
            belt.w, belt.d, this.beltColor);

          // moving treads — chevrons crossing the belt every 0.25u
          ctx.save();
          ctx.strokeStyle = this.active ? 'rgba(180,205,235,.30)' : 'rgba(120,130,145,.15)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const step = 0.25;
          const off = M.mod(this.scroll, step);
          for (let t = s0 - off; t < s1; t += step) {
            if (t < s0 - 1e-6) continue;
            const a = this.point(t, -hw + 0.07, H + 0.002);
            const b = this.point(t, hw - 0.07, H + 0.002);
            ctx.moveTo(iso.x(a[0], a[1]), iso.y(a[0], a[1], a[2]));
            ctx.lineTo(iso.x(b[0], b[1]), iso.y(b[0], b[1], b[2]));
          }
          ctx.stroke();
          ctx.restore();

          // side rails
          for (const u of [-hw, hw - 0.06]) {
            const r = this._rect(s0, s1, u, u + 0.06);
            D.box(ctx, iso, {
              x: r.x, y: r.y, z: H, w: Math.max(r.w, 0.06), d: Math.max(r.d, 0.06),
              h: 0.1, color: this.railColor, outline: '#171c22'
            });
          }

          // running light strip on the outer rail
          if (this.active) {
            const on = M.mod(i * 0.5 - this.scroll * 2, 3) < 1;
            if (on) {
              const p = this.point(i + 0.5, hw + 0.02, H + 0.12);
              D.glow(ctx, iso, p[0], p[1], p[2], 9, '#ffc832', 0.5);
            }
          }
        });
      }

      // ---- payload items --------------------------------------------
      for (const it of this.items) {
        const p = this.point(it.s, 0, H + 0.02);
        rl.add(rl.iso.depth(p[0], p[1], p[2], 3), (ctx, iso) => {
          const k = it.kind, sz = k.size;
          const bob = Math.sin(this.age * 9 + it.wobble) * 0.012 * (this.active ? 1 : 0);
          D.shadow(ctx, iso, p[0] - sz / 2, p[1] - sz / 2, sz, sz, 0.18);
          D.box(ctx, iso, {
            x: p[0] - sz / 2, y: p[1] - sz / 2, z: p[2] + bob,
            w: sz, d: sz, h: sz * 0.78, color: k.color
          });
          // strap detail
          const strap = Color.shade(k.color, -0.45);
          D.diamond(ctx, iso, p[0] - sz / 2, p[1] - 0.03,
            p[2] + bob + sz * 0.78 + 0.001, sz, 0.06, strap);
        });
      }
    }
  }

  /* =================================================================== */
  /*  RobotArm — yellow articulated 3-link manipulator with real IK      */
  /* =================================================================== */
  class RobotArm extends Entity {
    /**
     * @param {object} o {x, y, pick:[gx,gy,gz], place:[gx,gy,gz], color, cycle}
     */
    constructor(o) {
      super(Object.assign({
        tag: 'arm',
        color: '#f2c025', dark: '#23282f', accent: '#2b3038',
        L1: 1.25, L2: 1.05,        // upper arm / forearm length (grid units)
        baseH: 0.45,               // pedestal height
        cycle: 3.4,                // seconds per full pick-and-place
        phase: 0,                  // stagger identical arms
        pick: [1, 0, 0.6],
        place: [-1, 0, 0.6],
        payloadColor: '#c98f4b',
        /** «STEP-2 HOOK» fires when the arm releases at the place point. */
        onPlace: null
      }, o));

      this.t = this.phase % 1;
      this.grip = 0;               // 0 = open, 1 = closed
      this.holding = null;         // {color, size}
      this.yaw = 0;
      this.effector = [this.x, this.y, this.baseH];
      this.spark = 0;

      // Key poses, expressed as fractions of the cycle. The effector is
      // eased between them; `g` is the gripper state at that pose.
      const lift = 0.55;
      this.keys = [
        { p: [this.pick[0], this.pick[1], this.pick[2] + lift], t: 0.00, g: 0 },
        { p: this.pick, t: 0.14, g: 0 },
        { p: this.pick, t: 0.22, g: 1 },   // close on the item
        { p: [this.pick[0], this.pick[1], this.pick[2] + lift], t: 0.34, g: 1 },
        { p: [this.place[0], this.place[1], this.place[2] + lift], t: 0.58, g: 1 },
        { p: this.place, t: 0.70, g: 1 },
        { p: this.place, t: 0.78, g: 0 },  // release
        { p: [this.place[0], this.place[1], this.place[2] + lift], t: 0.88, g: 0 },
        { p: [this.pick[0], this.pick[1], this.pick[2] + lift], t: 1.00, g: 0 }
      ];
    }

    /** 2-link planar IK solved in the vertical plane containing the yaw. */
    _solve(reach, height) {
      const L1 = this.L1, L2 = this.L2;
      let d = Math.hypot(reach, height);
      d = M.clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.02);
      const a = Math.atan2(height, reach);
      const cosB = M.clamp((d * d + L1 * L1 - L2 * L2) / (2 * d * L1), -1, 1);
      const shoulder = a + Math.acos(cosB);          // elbow-up solution
      return {
        shoulder,
        elbowR: Math.cos(shoulder) * L1,
        elbowZ: Math.sin(shoulder) * L1,
        // recompute the reachable tip so the render never "detaches"
        tipR: reach * (d / (Math.hypot(reach, height) || 1)),
        tipZ: height * (d / (Math.hypot(reach, height) || 1))
      };
    }

    update(dt) {
      super.update(dt);
      if (this.active) this.t = M.mod(this.t + dt / this.cycle, 1);

      // --- sample the keyframe track -------------------------------
      const K = this.keys;
      let i = 0;
      while (i < K.length - 1 && this.t > K[i + 1].t) i++;
      const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
      const span = Math.max(b.t - a.t, 1e-4);
      const k = M.easeInOut(M.clamp((this.t - a.t) / span, 0, 1));

      const tx = M.lerp(a.p[0], b.p[0], k);
      const ty = M.lerp(a.p[1], b.p[1], k);
      const tz = M.lerp(a.p[2], b.p[2], k);
      const wantGrip = M.lerp(a.g, b.g, k);

      // pick-up / release edges
      const wasHolding = !!this.holding;
      this.grip = M.damp(this.grip, wantGrip, 22, dt);
      if (!wasHolding && wantGrip > 0.5) {
        this.holding = { color: this.payloadColor, size: 0.32 };
        this.spark = 1;
      } else if (wasHolding && wantGrip < 0.5) {
        this.holding = null;
        if (this.onPlace) this.onPlace(this);
      }
      this.spark = Math.max(0, this.spark - dt * 3);

      // --- smooth the effector, then resolve the joint chain --------
      this.effector[0] = M.damp(this.effector[0], tx, 26, dt);
      this.effector[1] = M.damp(this.effector[1], ty, 26, dt);
      this.effector[2] = M.damp(this.effector[2], tz, 26, dt);

      const dx = this.effector[0] - this.x;
      const dy = this.effector[1] - this.y;
      const targetYaw = Math.atan2(dy, dx);
      // shortest-path yaw interpolation
      let delta = M.mod(targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += delta * (1 - Math.exp(-16 * dt));

      const reach = Math.hypot(dx, dy);
      const height = this.effector[2] - (this.z + this.baseH + 0.35);
      this.ik = this._solve(reach, height);
    }

    collect(rl) {
      const depth = rl.iso.depth(this.x, this.y, 0, 6);
      rl.add(depth, (ctx, iso) => {
        const c = this.color, dark = this.dark;
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        const bz = this.z + this.baseH;
        const shoulderZ = bz + 0.35;

        // world point at (radial r, height z) in the arm's working plane
        const P = (r, zz) => [this.x + cy * r, this.y + sy * r, zz];

        D.shadow(ctx, iso, this.x - 0.55, this.y - 0.55, 1.1, 1.1, 0.34);

        // ---- bolted floor plate + pedestal -------------------------
        D.box(ctx, iso, {
          x: this.x - 0.52, y: this.y - 0.52, z: this.z, w: 1.04, d: 1.04,
          h: 0.1, color: '#39404a'
        });
        for (const [ox, oy] of [[-0.42, -0.42], [0.32, -0.42], [-0.42, 0.32], [0.32, 0.32]]) {
          D.box(ctx, iso, {
            x: this.x + ox, y: this.y + oy, z: this.z + 0.1, w: 0.1, d: 0.1,
            h: 0.05, color: '#20252b', outline: false
          });
        }
        D.cylinder(ctx, iso, this.x, this.y, this.z + 0.1, 0.38,
          this.baseH - 0.1, dark);

        // ---- rotating turret (yellow) ------------------------------
        D.cylinder(ctx, iso, this.x, this.y, bz, 0.34, 0.3, c, { cap: Color.shade(c, 0.2) });
        // yaw indicator notch on the turret cap
        const nA = P(0.30, bz + 0.31), nB = P(0.16, bz + 0.31);
        D.limb(ctx, iso, nA, nB, 4, Color.shade(c, -0.4), { spec: false, shade: false });
        // counterweight, opposite the reach direction
        const cwA = P(-0.05, shoulderZ), cwB = P(-0.46, shoulderZ - 0.05);
        D.limb(ctx, iso, cwA, cwB, 13, dark, { spec: false });

        const ik = this.ik || { elbowR: 0.6, elbowZ: 0.6, tipR: 1, tipZ: 0.4 };
        const shoulder = P(0, shoulderZ);
        const elbow = P(ik.elbowR, shoulderZ + ik.elbowZ);
        const wrist = [this.effector[0], this.effector[1], this.effector[2] + 0.24];
        const tip = [this.effector[0], this.effector[1], this.effector[2]];

        // ---- links --------------------------------------------------
        D.limb(ctx, iso, shoulder, elbow, 13, c);              // upper arm
        D.joint(ctx, iso, shoulder, 7.5, dark);
        D.limb(ctx, iso, elbow, wrist, 10, c);                 // forearm
        D.joint(ctx, iso, elbow, 6, dark);
        // hydraulic strut running alongside the upper arm
        const strutA = P(ik.elbowR * 0.18, shoulderZ - 0.12);
        D.limb(ctx, iso, strutA, [
          M.lerp(elbow[0], wrist[0], 0.15),
          M.lerp(elbow[1], wrist[1], 0.15),
          M.lerp(elbow[2], wrist[2], 0.15)
        ], 4, '#8d949c', { spec: false });

        // ---- wrist + gripper ---------------------------------------
        D.joint(ctx, iso, wrist, 5, dark);
        const spread = M.lerp(0.19, 0.085, this.grip);
        const fx = -sy, fy = cy;                  // finger spread axis
        for (const s of [-1, 1]) {
          const knuckle = [wrist[0] + fx * spread * s, wrist[1] + fy * spread * s, wrist[2] - 0.1];
          const fingerT = [wrist[0] + fx * spread * s * 0.8, wrist[1] + fy * spread * s * 0.8, tip[2] - 0.02];
          D.limb(ctx, iso, wrist, knuckle, 6, Color.shade(c, -0.12), { spec: false });
          D.limb(ctx, iso, knuckle, fingerT, 5, dark, { spec: false });
        }

        // ---- payload ------------------------------------------------
        if (this.holding) {
          const sz = this.holding.size;
          D.box(ctx, iso, {
            x: tip[0] - sz / 2, y: tip[1] - sz / 2, z: tip[2] - sz * 0.5,
            w: sz, d: sz, h: sz * 0.8, color: this.holding.color
          });
        }
        if (this.spark > 0.01) {
          D.glow(ctx, iso, tip[0], tip[1], tip[2], 16 * this.spark, '#fff0a8', this.spark * 0.8);
        }

        // ---- status beacon on the turret ---------------------------
        const blink = this.active ? (0.55 + 0.45 * Math.sin(this.age * 6)) : 0.15;
        const bp = P(0, bz + 0.42);
        D.glow(ctx, iso, bp[0], bp[1], bp[2], 8, this.active ? '#7dffb0' : '#ff5f56', blink);
      });
    }
  }

  /* =================================================================== */
  /*  Truck — arrives at a dock, waits, departs, loops                   */
  /* =================================================================== */
  class Truck extends Entity {
    /**
     * @param {object} o {laneY, dockX, dir:+1|-1, color, spawnX, exitX, wait}
     */
    constructor(o) {
      super(Object.assign({
        tag: 'truck',
        laneY: 20, dockX: 8, dir: 1,
        spawnX: -7, exitX: 32,
        color: '#2f6fd0', trailer: '#c9d2dc',
        wait: 4.2, speed: 5.2, width: 1.6, length: 4.4,
        delay: 0,
        /** Optional gate: return false to hold the truck off the road. */
        canStart: null,
        /** «STEP-2 HOOK» the moment the truck settles against the dock. */
        onArrive: null,
        /** «STEP-2 HOOK» when it pulls away loaded. */
        onDepart: null
      }, o));

      this.state = 'idle';
      this.timer = this.delay;
      this.px = this.spawnX;      // position along the lane
      this.bob = 0;
      this.brake = 0;
    }

    update(dt) {
      super.update(dt);
      this.timer -= dt;

      switch (this.state) {
        case 'idle':
          this.px = this.spawnX;
          // canStart lets the world gate the lane (one rig at a time)
          if (this.timer <= 0 && (!this.canStart || this.canStart(this))) {
            this.state = 'inbound';
          }
          break;

        case 'inbound': {
          const remain = (this.dockX - this.px) * this.dir;
          // ease down over the last 4 units of approach
          const v = this.speed * M.clamp(remain / 4, 0.14, 1);
          this.brake = M.damp(this.brake, remain < 4 ? 1 : 0, 6, dt);
          this.px += this.dir * v * dt;
          if (remain <= 0.02) {
            this.px = this.dockX;
            this.state = 'docked';
            this.timer = this.wait;
            if (this.onArrive) this.onArrive(this);
          }
          break;
        }

        case 'docked':
          this.brake = M.damp(this.brake, 1, 5, dt);
          if (this.timer <= 0) {
            this.state = 'outbound';
            this.brake = 0;
            if (this.onDepart) this.onDepart(this);
          }
          break;

        case 'outbound': {
          const travelled = Math.abs(this.px - this.dockX);
          const v = this.speed * M.clamp(0.18 + travelled / 5, 0.18, 1);
          this.px += this.dir * v * dt;
          if ((this.dir > 0 && this.px > this.exitX) ||
            (this.dir < 0 && this.px < this.exitX)) {
            this.state = 'idle';
            this.timer = 2 + Math.random() * 3;
          }
          break;
        }
      }

      const moving = this.state === 'inbound' || this.state === 'outbound';
      this.bob = moving ? Math.sin(this.age * 22) * 0.012 : M.damp(this.bob, 0, 8, dt);
      this.moving = moving;
    }

    collect(rl) {
      if (this.state === 'idle') return;

      const cxg = this.px, cyg = this.laneY;
      rl.add(rl.iso.depth(cxg, cyg + this.width / 2, 0, 5), (ctx, iso) => {
        const dir = this.dir;
        const L = this.length, W = this.width;
        const y0 = cyg - W / 2;
        const z = 0.30 + this.bob;                 // chassis height
        const front = dir > 0 ? cxg + L / 2 : cxg - L / 2;
        const cabL = 1.35;

        D.shadow(ctx, iso, cxg - L / 2, y0 - 0.05, L, W + 0.1, 0.38);

        // ---- wheels --------------------------------------------------
        const axles = [front - dir * 0.55, front - dir * 2.6, front - dir * 3.3];
        for (const ax of axles) {
          for (const wy of [y0 + 0.02, y0 + W - 0.24]) {
            D.box(ctx, iso, {
              x: ax - 0.22, y: wy, z: 0.02 + this.bob, w: 0.44, d: 0.22,
              h: 0.3, color: '#14181d', top: '#2a3037'
            });
          }
        }

        // ---- trailer -------------------------------------------------
        const tRear = dir > 0 ? cxg - L / 2 : cxg + L / 2;
        const tx = Math.min(tRear, front - dir * cabL);
        const tw = L - cabL;
        D.box(ctx, iso, {
          x: tx, y: y0, z: z, w: tw, d: W, h: 1.15,
          color: this.trailer, outline: '#5c6672'
        });
        // livery stripe
        D.box(ctx, iso, {
          x: tx, y: y0 - 0.001, z: z + 0.52, w: tw, d: W + 0.002, h: 0.16,
          color: this.color, outline: false
        });
        // rear door seams
        const rearX = dir > 0 ? tx : tx + tw;
        ctx.save(); ctx.globalAlpha = 0.5;
        D.box(ctx, iso, {
          x: rearX - (dir > 0 ? 0.02 : 0), y: y0, z: z, w: 0.02, d: W, h: 1.15,
          color: '#7c848e', outline: false
        });
        ctx.restore();
        // roof rib detail
        for (let r = 0.3; r < tw - 0.2; r += 0.55) {
          D.diamond(ctx, iso, tx + r, y0, z + 1.151, 0.06, W, Color.shade(this.trailer, -0.16));
        }

        // ---- cab -----------------------------------------------------
        const cx0 = dir > 0 ? front - cabL : front;
        D.box(ctx, iso, {
          x: cx0, y: y0, z: z, w: cabL, d: W, h: 0.95, color: this.color
        });
        // windshield on the leading face
        const wx = dir > 0 ? cx0 + cabL - 0.02 : cx0 + 0.02;
        D.fillPoly(ctx, iso, [
          [wx, y0 + 0.12, z + 0.9], [wx, y0 + W - 0.12, z + 0.9],
          [wx, y0 + W - 0.12, z + 0.46], [wx, y0 + 0.12, z + 0.46]
        ], 'rgba(150,205,235,.55)', 'rgba(20,26,32,.7)', 1);
        // exhaust stack behind the cab
        D.cylinder(ctx, iso, dir > 0 ? cx0 - 0.06 : cx0 + cabL + 0.06,
          y0 + 0.12, z + 0.95, 0.07, 0.55, '#3a4149');

        // ---- lamps ---------------------------------------------------
        const lampZ = z + 0.34;
        if (this.moving) {
          for (const ly of [y0 + 0.25, y0 + W - 0.25]) {
            D.glow(ctx, iso, wx, ly, lampZ, 13, '#fff3c4', 0.9);
          }
        }
        if (this.brake > 0.05) {
          const bx = dir > 0 ? tx : tx + tw;
          for (const ly of [y0 + 0.28, y0 + W - 0.28]) {
            D.glow(ctx, iso, bx, ly, z + 0.3, 12, '#ff4b3e', this.brake);
          }
        }
        // roof marker lamps
        ctx.save(); ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
          const mx = cx0 + cabL * (0.25 + i * 0.25);
          D.glow(ctx, iso, mx, y0 + W / 2, z + 0.98, 5, '#ffb347', 0.55);
        }
        ctx.restore();
      });
    }
  }

  /* =================================================================== */
  /*  LoadingDock — raised platform, bumpers, door, status light          */
  /* =================================================================== */
  class LoadingDock extends Entity {
    constructor(o) {
      super(Object.assign({
        tag: 'dock', w: 3.2, d: 1.6, h: 0.55,
        color: '#39424e', watch: null   // a Truck whose state drives the light
      }, o));
    }

    collect(rl) {
      rl.add(rl.iso.depth(this.x, this.y + this.d, 0, 2), (ctx, iso) => {
        D.shadow(ctx, iso, this.x, this.y, this.w, this.d, 0.3);
        // apron
        D.box(ctx, iso, {
          x: this.x, y: this.y, z: 0, w: this.w, d: this.d, h: this.h,
          color: this.color, top: '#4a5462'
        });
        // hazard stripes along the lip
        for (let s = 0; s < this.w; s += 0.4) {
          D.diamond(ctx, iso, this.x + s, this.y + this.d - 0.18, this.h + 0.002,
            0.2, 0.18, ((s * 2.5) | 0) % 2 ? '#ffc832' : '#22282f');
        }
        // rubber bumpers
        for (const bx of [this.x + 0.4, this.x + this.w - 0.7]) {
          D.box(ctx, iso, {
            x: bx, y: this.y + this.d - 0.06, z: 0.18, w: 0.3, d: 0.08,
            h: 0.2, color: '#15191e'
          });
        }
        // back wall + shutter
        D.box(ctx, iso, {
          x: this.x - 0.12, y: this.y - 0.35, z: 0, w: this.w + 0.24, d: 0.35,
          h: 2.1, color: '#2b333d'
        });
        D.fillPoly(ctx, iso, [
          [this.x + 0.35, this.y, 1.85], [this.x + this.w - 0.35, this.y, 1.85],
          [this.x + this.w - 0.35, this.y, 0.02], [this.x + 0.35, this.y, 0.02]
        ], '#171c22', '#0e1216', 1);
        for (let zz = 0.15; zz < 1.8; zz += 0.22) {
          D.fillPoly(ctx, iso, [
            [this.x + 0.35, this.y, zz], [this.x + this.w - 0.35, this.y, zz]
          ], null, 'rgba(255,255,255,.05)', 1.5);
        }

        // status lamp — green when a truck is berthed
        const docked = this.watch && this.watch.state === 'docked';
        const col = docked ? '#63f08a' : '#ff8a3d';
        const pulse = docked ? 1 : 0.4 + 0.35 * Math.sin(this.age * 4);
        D.box(ctx, iso, {
          x: this.x + this.w / 2 - 0.09, y: this.y - 0.02, z: 1.9,
          w: 0.18, d: 0.1, h: 0.18, color: '#20262d'
        });
        D.glow(ctx, iso, this.x + this.w / 2, this.y, 2.0, 14, col, pulse);
      });
    }
  }

  /* =================================================================== */
  /*  CrateStack — warehouse pallets of boxes                            */
  /* =================================================================== */
  class CrateStack extends Entity {
    constructor(o) {
      super(Object.assign({
        tag: 'crates', cols: 2, rows: 2, levels: 3, seed: 1,
        color: '#b57c3f'
      }, o));
    }

    collect(rl) {
      rl.add(rl.iso.depth(this.x, this.y, 0, 2), (ctx, iso) => {
        const w = this.cols * 0.8, d = this.rows * 0.8;
        D.shadow(ctx, iso, this.x - 0.06, this.y - 0.06, w + 0.12, d + 0.12, 0.34);

        // pallet
        D.box(ctx, iso, {
          x: this.x - 0.05, y: this.y - 0.05, z: 0, w: w + 0.1, d: d + 0.1,
          h: 0.12, color: '#6d5334'
        });

        for (let l = 0; l < this.levels; l++) {
          for (let cx = 0; cx < this.cols; cx++) {
            for (let cy = 0; cy < this.rows; cy++) {
              const n = M.hash(this.seed + cx * 4.1 + l * 9.3, cy * 2.7 + l * 5.5);
              if (l === this.levels - 1 && n > 0.68) continue;    // ragged top
              const jx = (n - 0.5) * 0.05, jy = (M.hash(n * 91, l) - 0.5) * 0.05;
              const col = Color.shade(this.color, (n - 0.5) * 0.22);
              const bx = this.x + cx * 0.8 + jx, by = this.y + cy * 0.8 + jy;
              const bz = 0.12 + l * 0.7;
              D.box(ctx, iso, {
                x: bx, y: by, z: bz, w: 0.74, d: 0.74, h: 0.68, color: col
              });
              // banding
              D.diamond(ctx, iso, bx, by + 0.34, bz + 0.681, 0.74, 0.06,
                'rgba(0,0,0,.28)');
              if (n > 0.55) {
                D.fillPoly(ctx, iso, [
                  [bx + 0.2, by + 0.74, bz + 0.5], [bx + 0.54, by + 0.74, bz + 0.5],
                  [bx + 0.54, by + 0.74, bz + 0.26], [bx + 0.2, by + 0.74, bz + 0.26]
                ], 'rgba(240,232,210,.55)', null, 0);
              }
            }
          }
        }
      });
    }
  }

  /* =================================================================== */
  /*  Generator — machine block, spinning fan, pipes, exhaust puffs      */
  /* =================================================================== */
  class Generator extends Entity {
    constructor(o) {
      super(Object.assign({
        tag: 'generator', w: 2.2, d: 1.6, h: 1.25,
        color: '#4a5563', accent: '#ffc832', rpm: 2.4
      }, o));
      this.fan = 0;
      this.puffs = [];
      this.puffTimer = 0;
    }

    update(dt) {
      super.update(dt);
      if (this.active) this.fan += dt * this.rpm * Math.PI * 2;

      this.puffTimer -= dt;
      if (this.active && this.puffTimer <= 0) {
        this.puffTimer = 0.42 + Math.random() * 0.3;
        this.puffs.push({
          x: this.x + this.w - 0.35, y: this.y + 0.3,
          z: this.h + 0.75, life: 0, max: 2.4,
          r: 5 + Math.random() * 4, drift: (Math.random() - 0.5) * 0.25
        });
      }
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i];
        p.life += dt;
        p.z += dt * 0.42;
        p.x += p.drift * dt;
        if (p.life > p.max) this.puffs.splice(i, 1);
      }
    }

    collect(rl) {
      rl.add(rl.iso.depth(this.x, this.y, 0, 2), (ctx, iso) => {
        const c = this.color;
        D.shadow(ctx, iso, this.x, this.y, this.w, this.d, 0.36);

        // skid frame
        D.box(ctx, iso, {
          x: this.x - 0.08, y: this.y - 0.08, z: 0, w: this.w + 0.16,
          d: this.d + 0.16, h: 0.14, color: '#2b323b'
        });
        // main housing
        D.box(ctx, iso, {
          x: this.x, y: this.y, z: 0.14, w: this.w, d: this.d, h: this.h, color: c
        });
        // louvred vents on the front face
        for (let i = 0; i < 5; i++) {
          const vz = 0.34 + i * 0.16;
          D.fillPoly(ctx, iso, [
            [this.x + 0.2, this.y + this.d, vz], [this.x + this.w - 0.2, this.y + this.d, vz],
            [this.x + this.w - 0.2, this.y + this.d, vz - 0.08],
            [this.x + 0.2, this.y + this.d, vz - 0.08]
          ], Color.shade(c, -0.34), null, 0);
        }
        // accent band — side faces only, so the top stays a metal deck
        const bz0 = 0.14 + this.h - 0.26, bz1 = bz0 + 0.12;
        D.fillPoly(ctx, iso, [
          [this.x, this.y + this.d, bz1], [this.x + this.w, this.y + this.d, bz1],
          [this.x + this.w, this.y + this.d, bz0], [this.x, this.y + this.d, bz0]
        ], Color.shade(this.accent, -0.10), null, 0);
        D.fillPoly(ctx, iso, [
          [this.x + this.w, this.y, bz1], [this.x + this.w, this.y + this.d, bz1],
          [this.x + this.w, this.y + this.d, bz0], [this.x + this.w, this.y, bz0]
        ], Color.shade(this.accent, -0.34), null, 0);

        // ---- fan on the top deck, drawn in screen space -------------
        const fcx = this.x + this.w * 0.32, fcy = this.y + this.d * 0.5;
        const topZ = 0.14 + this.h;
        const FX = iso.x(fcx, fcy), FY = iso.y(fcx, fcy, topZ);
        const rx = 0.42 * iso.hw, ry = 0.42 * iso.hh;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(FX, FY, rx, ry, 0, 0, 6.2832);
        ctx.fillStyle = '#191d23'; ctx.fill();
        ctx.strokeStyle = Color.shade(c, -0.5); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath();
        for (let b = 0; b < 5; b++) {
          const a0 = this.fan + (b / 5) * 6.2832;
          ctx.moveTo(FX, FY);
          ctx.lineTo(FX + Math.cos(a0) * rx * 0.92, FY + Math.sin(a0) * ry * 0.92);
          ctx.lineTo(FX + Math.cos(a0 + 0.55) * rx * 0.7, FY + Math.sin(a0 + 0.55) * ry * 0.7);
          ctx.closePath();
        }
        ctx.fillStyle = 'rgba(160,178,198,.55)'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(FX, FY, rx * 0.16, ry * 0.16, 0, 0, 6.2832);
        ctx.fillStyle = '#5a636e'; ctx.fill();
        ctx.restore();

        // ---- exhaust stack + pipes ---------------------------------
        D.cylinder(ctx, iso, this.x + this.w - 0.35, this.y + 0.3, topZ, 0.16, 0.75, '#39414b');
        D.cylinder(ctx, iso, this.x + this.w - 0.35, this.y + 0.3, topZ + 0.75, 0.2, 0.08, '#22282f');
        D.box(ctx, iso, {
          x: this.x + 0.25, y: this.y - 0.22, z: 0.2, w: 0.16, d: 0.22,
          h: this.h * 0.8, color: '#77808c'
        });

        // ---- gauges + status lamp ----------------------------------
        const live = this.active;
        const lamp = live ? '#7dffb0' : '#ff5f56';
        const blink = live ? 0.6 + 0.4 * Math.sin(this.age * 5 + this.x) : 0.3;
        D.glow(ctx, iso, this.x + 0.2, this.y + this.d, 0.14 + this.h - 0.1, 10, lamp, blink);
        ctx.save();
        ctx.globalAlpha = 0.8;
        D.fillPoly(ctx, iso, [
          [this.x + 0.45, this.y + this.d, 1.0], [this.x + 0.85, this.y + this.d, 1.0],
          [this.x + 0.85, this.y + this.d, 0.72], [this.x + 0.45, this.y + this.d, 0.72]
        ], '#101418', 'rgba(0,0,0,.6)', 1);
        const needle = 0.45 + 0.28 * (0.5 + 0.5 * Math.sin(this.age * 3.1 + this.y));
        D.fillPoly(ctx, iso, [
          [this.x + 0.48, this.y + this.d, 0.78],
          [this.x + 0.48 + needle * 0.7, this.y + this.d, 0.78]
        ], null, live ? '#7dffb0' : '#5a6470', 2);
        ctx.restore();
      });

      // ---- steam, above everything nearby --------------------------
      for (const p of this.puffs) {
        rl.add(rl.iso.depth(p.x, p.y, p.z, 9), (ctx, iso) => {
          const k = p.life / p.max;
          const X = iso.x(p.x, p.y), Y = iso.y(p.x, p.y, p.z);
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.22;
          ctx.beginPath();
          ctx.arc(X, Y, p.r * (1 + k * 2.4), 0, 6.2832);
          ctx.fillStyle = '#cfe0f0'; ctx.fill();
          ctx.restore();
        });
      }
    }
  }

  /* =================================================================== */
  /*  Silo — background storage tank                                     */
  /* =================================================================== */
  class Silo extends Entity {
    constructor(o) {
      super(Object.assign({
        tag: 'silo', r: 0.85, h: 3.2, color: '#8d97a4', fill: 0.62
      }, o));
    }
    collect(rl) {
      rl.add(rl.iso.depth(this.x, this.y, 0, 2), (ctx, iso) => {
        D.shadow(ctx, iso, this.x - this.r, this.y - this.r, this.r * 2, this.r * 2, 0.34);
        // legs
        for (const [ox, oy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
          D.box(ctx, iso, {
            x: this.x + ox * this.r - 0.06, y: this.y + oy * this.r - 0.06,
            z: 0, w: 0.12, d: 0.12, h: 0.5, color: '#39414b'
          });
        }
        D.cylinder(ctx, iso, this.x, this.y, 0.5, this.r, this.h, this.color);
        // hoop bands
        for (let zz = 0.9; zz < this.h + 0.4; zz += 0.8) {
          ctx.save(); ctx.globalAlpha = 0.35;
          const X = iso.x(this.x, this.y), Y = iso.y(this.x, this.y, zz);
          ctx.beginPath();
          ctx.ellipse(X, Y, this.r * iso.hw, this.r * iso.hh, 0, 0, Math.PI);
          ctx.strokeStyle = '#20262d'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
        // level indicator
        const lz = 0.5 + this.h * this.fill;
        ctx.save(); ctx.globalAlpha = 0.5;
        D.fillPoly(ctx, iso, [
          [this.x - this.r * 0.1, this.y + this.r, lz],
          [this.x + this.r * 0.1, this.y + this.r, lz],
          [this.x + this.r * 0.1, this.y + this.r, 0.6],
          [this.x - this.r * 0.1, this.y + this.r, 0.6]
        ], '#ffc832', null, 0);
        ctx.restore();
        // cap + beacon
        D.cylinder(ctx, iso, this.x, this.y, 0.5 + this.h, this.r * 0.45, 0.28, '#5f6a77');
        D.glow(ctx, iso, this.x, this.y, 0.5 + this.h + 0.35, 9, '#ff5f56',
          0.35 + 0.35 * Math.sin(this.age * 3));
      });
    }
  }

  /* =================================================================== */
  /*  FloorLight — pole lamp that pools light on the deck                */
  /* =================================================================== */
  class FloorLight extends Entity {
    constructor(o) { super(Object.assign({ tag: 'light', h: 3.0, color: '#ffd98a' }, o)); }
    collect(rl) {
      rl.add(rl.iso.depth(this.x, this.y, 0, 2), (ctx, iso) => {
        ctx.save();
        ctx.globalAlpha = 0.10;
        D.diamond(ctx, iso, this.x - 1.6, this.y - 1.6, 0.012, 3.2, 3.2, this.color);
        ctx.globalAlpha = 0.10;
        D.diamond(ctx, iso, this.x - 1.0, this.y - 1.0, 0.014, 2.0, 2.0, this.color);
        ctx.restore();
        D.box(ctx, iso, { x: this.x - 0.14, y: this.y - 0.14, z: 0, w: 0.28, d: 0.28, h: 0.12, color: '#333b45' });
        D.cylinder(ctx, iso, this.x, this.y, 0.12, 0.08, this.h, '#48515c');
        D.box(ctx, iso, {
          x: this.x - 0.22, y: this.y - 0.18, z: this.h, w: 0.44, d: 0.36, h: 0.14,
          color: '#5a636e', top: Color.alpha(this.color, 0.9)
        });
        D.glow(ctx, iso, this.x, this.y, this.h + 0.02, 26, this.color, 0.5);
      });
    }
  }

  /* =================================================================== */
  global.ENTITIES = {
    Entity, Ground, Conveyor, RobotArm, Truck,
    LoadingDock, CrateStack, Generator, Silo, FloorLight, ITEM_KINDS
  };
})(window);
