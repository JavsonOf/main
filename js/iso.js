/* =====================================================================
   iso.js — Isometric projection math, camera, colour utilities and the
   procedural drawing primitives every entity is built from.
   ---------------------------------------------------------------------
   COORDINATE CONTRACT
     grid  (gx, gy, gz)  gx → screen right+down, gy → screen left+down,
                         gz → screen up. 1 unit = 1 tile. Floats allowed.
     screen(sx, sy)      world-space pixels BEFORE the camera transform.

     sx = (gx - gy) * TILE_W/2
     sy = (gx + gy) * TILE_H/2 - gz * Z_UNIT

   DEPTH
     Painter's algorithm. A draw command's sort key is
        depth = (gx + gy)  ... primary   (further from camera = smaller)
        then z, then layer, then insertion index (stable).
     Entities may emit many commands so tall objects interleave correctly
     with the tiles and items around them.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  math helpers                                                       */
  /* ------------------------------------------------------------------ */
  const M = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    /** Frame-rate independent exponential smoothing. */
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeOut: t => 1 - Math.pow(1 - t, 3),
    easeIn: t => t * t * t,
    /** 0→1 ramp with smooth ends, saturating outside [a,b]. */
    smoothstep: (a, b, x) => {
      const t = M.clamp((x - a) / (b - a || 1e-6), 0, 1);
      return t * t * (3 - 2 * t);
    },
    /** Deterministic hash noise — stable layout jitter without RNG state. */
    hash: (x, y = 0) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    },
    mod: (a, n) => ((a % n) + n) % n,
    dist: (x, y) => Math.sqrt(x * x + y * y)
  };

  /* ------------------------------------------------------------------ */
  /*  colour                                                             */
  /* ------------------------------------------------------------------ */
  const Color = {
    _cache: new Map(),

    /**
     * Parse "#rgb" / "#rrggbb" / "rgb(r,g,b)" → [r,g,b]. Cached — this runs
     * thousands of times per frame. Accepting rgb() back matters: shaded
     * results get re-shaded (a box face of an already-tinted crate), so
     * every producer below must emit something this can re-read.
     */
    rgb(col) {
      let c = Color._cache.get(col);
      if (c) return c;
      if (col.charCodeAt(0) === 114 /* r */) {          // rgb()/rgba()
        const m = col.match(/-?\d+(\.\d+)?/g) || [0, 0, 0];
        c = [+m[0] | 0, +m[1] | 0, +m[2] | 0];
      } else {
        let h = col.replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16) || 0;
        c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      Color._cache.set(col, c);
      return c;
    },

    hex(r, g, b) {
      return '#' + (((1 << 24) + (M.clamp(r | 0, 0, 255) << 16) +
        (M.clamp(g | 0, 0, 255) << 8) + M.clamp(b | 0, 0, 255))
        .toString(16).slice(1));
    },

    /** amt > 0 lightens toward white, amt < 0 darkens toward black. */
    shade(col, amt) {
      const key = col + '|' + amt.toFixed(3);
      let out = Color._cache.get(key);
      if (out) return out;
      const [r, g, b] = Color.rgb(col);
      const t = amt < 0 ? 0 : 255;
      const p = Math.abs(amt);
      out = Color.hex(
        Math.round((t - r) * p + r),
        Math.round((t - g) * p + g),
        Math.round((t - b) * p + b));
      Color._cache.set(key, out);
      return out;
    },

    alpha(col, a) {
      const [r, g, b] = Color.rgb(col);
      return `rgba(${r},${g},${b},${a})`;
    },

    mix(colA, colB, t) {
      const a = Color.rgb(colA), b = Color.rgb(colB);
      return Color.hex(M.lerp(a[0], b[0], t), M.lerp(a[1], b[1], t),
        M.lerp(a[2], b[2], t));
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Iso — the projection itself                                        */
  /* ------------------------------------------------------------------ */
  class Iso {
    constructor(tileW = 64, tileH = 32, zUnit = 32) {
      this.tileW = tileW;
      this.tileH = tileH;
      this.hw = tileW / 2;
      this.hh = tileH / 2;
      this.zUnit = zUnit;
    }

    /** grid → world-space screen pixels. */
    x(gx, gy) { return (gx - gy) * this.hw; }
    y(gx, gy, gz = 0) { return (gx + gy) * this.hh - gz * this.zUnit; }

    /** Convenience object form (allocates — avoid in hot inner loops). */
    project(gx, gy, gz = 0) {
      return { x: (gx - gy) * this.hw, y: (gx + gy) * this.hh - gz * this.zUnit };
    }

    /** Inverse projection onto the gz = 0 plane. Used for mouse picking. */
    unproject(sx, sy, gz = 0) {
      const y = sy + gz * this.zUnit;
      return {
        gx: (y / this.hh + sx / this.hw) / 2,
        gy: (y / this.hh - sx / this.hw) / 2
      };
    }

    /** Painter sort key. Higher = drawn later = closer to the camera. */
    depth(gx, gy, gz = 0, layer = 0) {
      return (gx + gy) * 1000 + gz * 10 + layer;
    }

    /** Screen bounds of a w×d footprint rising to height h at origin. */
    bounds(w, d, h = 0) {
      return {
        minX: this.x(0, d), maxX: this.x(w, 0),
        minY: this.y(0, 0, h), maxY: this.y(w, d, 0)
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Draw primitives                                                    */
  /*  All take (ctx, iso, ...) and paint in world-space screen pixels;    */
  /*  the camera transform is already applied by the renderer.           */
  /* ------------------------------------------------------------------ */

  /** Face brightness constants — one light source, high and to the left. */
  const FACE = { top: 0.16, left: -0.10, right: -0.34, front: -0.02 };

  /** Trace a polygon from an array of grid triples [[x,y,z], ...]. */
  function tracePoly(ctx, iso, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const X = iso.x(p[0], p[1]);
      const Y = iso.y(p[0], p[1], p[2]);
      i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    }
    ctx.closePath();
  }

  function fillPoly(ctx, iso, pts, fill, stroke, lw) {
    tracePoly(ctx, iso, pts);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  /** Flat tile diamond at (x,y) of size w×d on plane z. */
  function diamond(ctx, iso, x, y, z, w, d, fill, stroke, lw) {
    fillPoly(ctx, iso, [
      [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]
    ], fill, stroke, lw);
  }

  /**
   * The workhorse: an axis-aligned cuboid.
   * o = { x, y, z, w, d, h, color, top, left, right, outline, alpha }
   * Only the three camera-facing faces are emitted (top, left = +y face,
   * right = +x face) — back faces are never visible in a fixed iso view.
   */
  function box(ctx, iso, o) {
    const x = o.x, y = o.y, z = o.z || 0;
    const w = o.w, d = o.d, h = o.h;
    const c = o.color || '#888';
    const zt = z + h;

    if (o.alpha != null) { ctx.save(); ctx.globalAlpha *= o.alpha; }

    const line = o.outline === false ? null
      : (o.outline || Color.shade(c, -0.62));
    const lw = o.lineWidth || 1;

    // +x face (screen right)
    fillPoly(ctx, iso, [
      [x + w, y, zt], [x + w, y + d, zt], [x + w, y + d, z], [x + w, y, z]
    ], o.right || Color.shade(c, FACE.right), line, lw);

    // +y face (screen left / front)
    fillPoly(ctx, iso, [
      [x, y + d, zt], [x + w, y + d, zt], [x + w, y + d, z], [x, y + d, z]
    ], o.left || Color.shade(c, FACE.left), line, lw);

    // top
    if (h !== 0 || o.forceTop !== false) {
      fillPoly(ctx, iso, [
        [x, y, zt], [x + w, y, zt], [x + w, y + d, zt], [x, y + d, zt]
      ], o.top || Color.shade(c, FACE.top), line, lw);
    }

    if (o.alpha != null) ctx.restore();
  }

  /**
   * Vertical cylinder approximated with an ellipse cap + a body quad.
   * Used for arm bases, tanks, silos, exhaust stacks.
   */
  function cylinder(ctx, iso, cx, cy, z, r, h, color, opts) {
    opts = opts || {};
    const rx = r * iso.hw, ry = r * iso.hh;
    const sx = iso.x(cx, cy);
    const yTop = iso.y(cx, cy, z + h);
    const yBot = iso.y(cx, cy, z);
    const line = opts.outline === false ? null : Color.shade(color, -0.6);

    // body: left/right silhouette + bottom arc
    ctx.beginPath();
    ctx.moveTo(sx - rx, yTop);
    ctx.lineTo(sx - rx, yBot);
    ctx.ellipse(sx, yBot, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(sx + rx, yTop);
    ctx.ellipse(sx, yTop, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
    g.addColorStop(0, Color.shade(color, -0.30));
    g.addColorStop(0.42, Color.shade(color, 0.04));
    g.addColorStop(1, Color.shade(color, -0.42));
    ctx.fillStyle = g; ctx.fill();
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = opts.lineWidth || 1; ctx.stroke(); }

    // top cap
    ctx.beginPath();
    ctx.ellipse(sx, yTop, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = opts.cap || Color.shade(color, FACE.top + 0.06);
    ctx.fill();
    if (line) ctx.stroke();
  }

  /**
   * Soft contact shadow on the ground plane. Two stacked diamonds fake a
   * penumbra far cheaper than ctx.filter blur.
   */
  function shadow(ctx, iso, x, y, w, d, strength) {
    const s = strength == null ? 0.30 : strength;
    const cx = x + w / 2, cy = y + d / 2;
    const grow = 0.28;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${s * 0.42})`;
    tracePoly(ctx, iso, [
      [cx - w / 2 - grow, cy, 0], [cx, cy - d / 2 - grow, 0],
      [cx + w / 2 + grow, cy, 0], [cx, cy + d / 2 + grow, 0]
    ]); ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${s})`;
    tracePoly(ctx, iso, [
      [cx - w / 2, cy, 0], [cx, cy - d / 2, 0],
      [cx + w / 2, cy, 0], [cx, cy + d / 2, 0]
    ]); ctx.fill();
    ctx.restore();
  }

  /** Additive glow blob in world-screen space — lamps, sparks, embers. */
  function glow(ctx, iso, gx, gy, gz, radius, color, intensity) {
    const X = iso.x(gx, gy), Y = iso.y(gx, gy, gz);
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, radius);
    g.addColorStop(0, Color.alpha(color, 0.85 * (intensity == null ? 1 : intensity)));
    g.addColorStop(0.45, Color.alpha(color, 0.22 * (intensity == null ? 1 : intensity)));
    g.addColorStop(1, Color.alpha(color, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(X, Y, radius, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }

  /**
   * A thick capsule between two GRID points — the building block of the
   * robot arm links. Drawn as an outlined stroke plus a specular streak so
   * segments read as tubular metal rather than flat lines.
   */
  function limb(ctx, iso, a, b, width, color, opts) {
    opts = opts || {};
    const x1 = iso.x(a[0], a[1]), y1 = iso.y(a[0], a[1], a[2]);
    const x2 = iso.x(b[0], b[1]), y2 = iso.y(b[0], b[1], b[2]);

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // outline
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = width + 2.5;
    ctx.strokeStyle = Color.shade(color, -0.66);
    ctx.stroke();

    // core
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();

    // specular streak, offset toward the light (up-left)
    if (opts.spec !== false) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;      // unit normal
      const off = width * 0.24 * (nx < 0 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(x1 + nx * off, y1 + ny * off);
      ctx.lineTo(x2 + nx * off, y2 + ny * off);
      ctx.lineWidth = Math.max(1, width * 0.26);
      ctx.strokeStyle = Color.shade(color, 0.34);
      ctx.stroke();
    }

    // shaded underside
    if (opts.shade !== false) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const off = width * 0.30 * (nx < 0 ? -1 : 1);
      ctx.beginPath();
      ctx.moveTo(x1 + nx * off, y1 + ny * off);
      ctx.lineTo(x2 + nx * off, y2 + ny * off);
      ctx.lineWidth = Math.max(1, width * 0.20);
      ctx.strokeStyle = Color.alpha('#000000', 0.28);
      ctx.stroke();
    }
  }

  /** Joint puck at a grid point — the dark pivot discs between limbs. */
  function joint(ctx, iso, p, r, color) {
    const X = iso.x(p[0], p[1]), Y = iso.y(p[0], p[1], p[2]);
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fillStyle = color || '#22262c'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(X - r * 0.28, Y - r * 0.32, r * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
  }

  /** Text label pinned to a grid point (debug / signage). */
  function label(ctx, iso, gx, gy, gz, text, opts) {
    opts = opts || {};
    const X = iso.x(gx, gy), Y = iso.y(gx, gy, gz);
    ctx.save();
    ctx.font = opts.font || '600 9px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (opts.bg) {
      const w = ctx.measureText(text).width + 10;
      ctx.fillStyle = opts.bg;
      ctx.beginPath();
      // roundRect is recent (Safari 16 / FF 112); fall back to a plain box
      const drawBox = typeof ctx.roundRect === 'function' ? ctx.roundRect.bind(ctx) : ctx.rect.bind(ctx);
      drawBox(X - w / 2, Y - 8, w, 16, 4);
      ctx.fill();
    }
    ctx.fillStyle = opts.color || 'rgba(214,226,240,.8)';
    ctx.fillText(text, X, Y);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  Camera — pan, zoom, auto-fit                                       */
  /* ------------------------------------------------------------------ */
  class Camera {
    constructor() {
      this.x = 0; this.y = 0;          // applied screen-space translation
      this.zoom = 1;                   // applied zoom
      this.fitZoom = 1;                // zoom that makes the world fit
      this.userZoom = 1;               // player multiplier on top of fit
      this.minUser = 0.45; this.maxUser = 2.8;
      this.tx = 0; this.ty = 0;        // smoothing targets
      this.tZoom = 1;
      this.panX = 0; this.panY = 0;    // player pan, survives a resize
      this._vw = 1; this._vh = 1; this._cx = 0; this._cy = 0;
    }

    /**
     * Recompute fit zoom + centring for the current viewport.
     * `wb` is the world screen-space bounding box in unzoomed pixels.
     * Any pan/zoom the player applied is preserved across the refit.
     */
    fit(viewW, viewH, wb, pad) {
      const p = pad == null ? 0.90 : pad;
      const ww = (wb.maxX - wb.minX) || 1;
      const wh = (wb.maxY - wb.minY) || 1;
      this._vw = viewW; this._vh = viewH;
      this._cx = (wb.minX + wb.maxX) / 2;
      this._cy = (wb.minY + wb.maxY) / 2;
      this.fitZoom = Math.min(viewW / ww, viewH / wh) * p;
      this._recenter();
    }

    _recenter() {
      this.tZoom = this.fitZoom * this.userZoom;
      this.tx = this._vw / 2 - this._cx * this.tZoom + this.panX;
      this.ty = this._vh / 2 - this._cy * this.tZoom + this.panY;
    }

    /** Zoom around a screen anchor so the point under the cursor stays put. */
    zoomAt(screenX, screenY, factor) {
      const before = this.tZoom;
      this.userZoom = M.clamp(this.userZoom * factor, this.minUser, this.maxUser);
      this.tZoom = this.fitZoom * this.userZoom;
      const k = this.tZoom / before;
      const nx = screenX - (screenX - this.tx) * k;
      const ny = screenY - (screenY - this.ty) * k;
      // fold the anchor correction back into the persistent pan offset
      this.panX = nx - (this._vw / 2 - this._cx * this.tZoom);
      this.panY = ny - (this._vh / 2 - this._cy * this.tZoom);
      this.tx = nx; this.ty = ny;
    }

    pan(dx, dy) {
      this.panX += dx; this.panY += dy;
      this.tx += dx; this.ty += dy;
      this.x += dx; this.y += dy;      // 1:1 with the pointer, no lag
    }

    /** Back to the auto-fitted framing. */
    reset() { this.panX = 0; this.panY = 0; this.userZoom = 1; this._recenter(); }

    update(dt) {
      this.x = M.damp(this.x, this.tx, 14, dt);
      this.y = M.damp(this.y, this.ty, 14, dt);
      this.zoom = M.damp(this.zoom, this.tZoom, 14, dt);
    }

    snap() { this.x = this.tx; this.y = this.ty; this.zoom = this.tZoom; }

    /** Canvas CSS px → world-space screen px. */
    toWorld(sx, sy) {
      return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
    }
  }

  /* ------------------------------------------------------------------ */
  global.ISO = {
    M, Color, Iso, Camera, FACE,
    draw: {
      tracePoly, fillPoly, diamond, box, cylinder,
      shadow, glow, limb, joint, label
    }
  };
})(window);
