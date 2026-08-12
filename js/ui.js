/* =====================================================================
   ui.js — the game shell: header, tabs, panels, modals, toasts, canvas
   floaters, and every event listener that joins them to the state and
   the renderer.
   ---------------------------------------------------------------------
   Two rules keep a 60 fps canvas and a DOM UI coexisting:

   1. NOTHING REBUILDS PER FRAME. Rows are constructed once and cached by
      id; the refresh loop only writes textContent and bar widths. DOM is
      rebuilt exclusively on structural change (a line unlocks, the viewed
      line switches).
   2. THE UI POLLS, THE STATE PUSHES. Values that change continuously
      (cash, rate, XP, cooldowns) are read on a 10 Hz timer; discrete
      events (upgrade, unlock, levelup, objective) arrive as state events
      and drive sound, toasts and re-renders.

   Boots last: it wraps engine.onTick so the economy still ticks first,
   and claims engine.onRender for the screen-space floater pass that
   Step 1 reserved.
   ===================================================================== */
(function (global) {
  'use strict';

  const P = global.PRODUCTS;
  const Format = P.Format;

  const el = id => document.getElementById(id);
  const make = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* =================================================================== */
  class GameUI {
    constructor(engine, state, view, synth) {
      this.engine = engine;
      this.state = state;
      this.view = view;
      this.synth = synth;

      this.tab = null;            // 'products' | 'factory' | null (closed)
      this.buyAmount = 1;         // 1 | 10 | 'max'
      this.floaters = [];
      this._clock = 0;
      this._rows = { product: new Map(), axis: new Map(), booster: new Map() };

      this.dom = {
        cash: el('ui-cash'), rate: el('ui-rate'),
        level: el('ui-level'), xp: el('ui-xp'),
        objName: el('ui-obj-name'), objFill: el('ui-obj-fill'),
        objCount: el('ui-obj-count'), objReward: el('ui-obj-reward'),
        objective: el('ui-objective'),
        boostStrip: el('ui-boost-strip'),
        sheet: el('sheet'), tabs: el('tabs'),
        panels: { products: el('panel-products'), factory: el('panel-factory') },
        productRows: el('ui-product-rows'), axisRows: el('ui-axis-rows'),
        boosterRows: el('ui-booster-rows'),
        factoryTitle: el('ui-factory-title'), lineSummary: el('ui-line-summary'),
        linesNote: el('ui-lines-note'),
        mute: el('ui-mute'), muteIcon: el('ui-mute-icon'),
        diag: el('ui-diag'), toasts: el('toasts'),
        modalBoosters: el('modal-boosters'), modalOffline: el('modal-offline'),
        offAway: el('ui-offline-away'), offAmount: el('ui-offline-amount'),
        offFine: el('ui-offline-fine'), offCollect: el('ui-offline-collect'),
        buyAmt: el('ui-buyamt')
      };

      this.buildProducts();
      this.buildAxes();
      this.buildBoosters();
      this.bindUI();
      this.bindState();
      this.bindWorld();

      this.dom.muteIcon.textContent = synth.muted ? '🔇' : '🔊';
      this.dom.mute.setAttribute('aria-pressed', String(synth.muted));

      this.setTab('products', true);
      this.refresh(true);

      if (state.offlineReport) this.showOffline(state.offlineReport);
    }

    /* ================================================================= */
    /*  Construction                                                     */
    /* ================================================================= */
    buildProducts() {
      const frag = document.createDocumentFragment();
      P.PRODUCTS.forEach(p => {
        const row = make('button', 'prow');
        row.type = 'button';
        row.dataset.id = p.id;
        row.innerHTML =
          '<span class="pswatch" style="--c:' + p.accent + '"></span>' +
          '<span class="pmain">' +
          '<span class="pname">' + p.name + '<em class="pstars"></em></span>' +
          '<span class="psub"></span></span>' +
          '<span class="pright"><span class="prate"></span>' +
          '<span class="pcta"></span></span>';
        frag.appendChild(row);
        this._rows.product.set(p.id, {
          row,
          stars: row.querySelector('.pstars'),
          sub: row.querySelector('.psub'),
          rate: row.querySelector('.prate'),
          cta: row.querySelector('.pcta')
        });
      });
      this.dom.productRows.appendChild(frag);
    }

    buildAxes() {
      const frag = document.createDocumentFragment();
      P.AXES.forEach(a => {
        const row = make('div', 'arow');
        row.dataset.axis = a.id;
        row.innerHTML =
          '<div class="ahead"><span class="aname">' + a.name + '</span>' +
          '<span class="alvl"></span></div>' +
          '<div class="adesc">' + a.desc + '</div>' +
          '<div class="ameter"><i></i></div>' +
          '<div class="afoot"><span class="amult"></span>' +
          '<button class="abuy" type="button"></button></div>';
        frag.appendChild(row);
        this._rows.axis.set(a.id, {
          row,
          lvl: row.querySelector('.alvl'),
          meter: row.querySelector('.ameter i'),
          mult: row.querySelector('.amult'),
          buy: row.querySelector('.abuy')
        });
      });
      this.dom.axisRows.appendChild(frag);
    }

    buildBoosters() {
      const frag = document.createDocumentFragment();
      P.BOOSTERS.forEach(b => {
        const row = make('div', 'brow');
        row.dataset.id = b.id;
        row.style.setProperty('--c', b.tone);
        row.innerHTML =
          '<span class="bico">' + b.icon + '</span>' +
          '<span class="bmain"><span class="bname">' + b.name + '</span>' +
          '<span class="bdesc">' + b.desc + '</span>' +
          '<span class="bmeter"><i></i></span></span>' +
          '<button class="cta bcta" type="button"></button>';
        frag.appendChild(row);
        this._rows.booster.set(b.id, {
          row,
          meter: row.querySelector('.bmeter i'),
          cta: row.querySelector('.bcta')
        });
      });
      this.dom.boosterRows.appendChild(frag);
    }

    /* ================================================================= */
    /*  Event listeners — UI → state                                     */
    /* ================================================================= */
    bindUI() {
      // ---- tabs ----------------------------------------------------
      this.dom.tabs.addEventListener('click', ev => {
        const btn = ev.target.closest('.tab');
        if (!btn) return;
        this.synth.click();
        const name = btn.dataset.tab;
        if (name === 'boosters') { this.openModal('boosters'); return; }
        this.setTab(this.tab === name ? null : name);
      });

      // ---- product rows: select, or unlock -------------------------
      this.dom.productRows.addEventListener('click', ev => {
        const row = ev.target.closest('.prow');
        if (!row) return;
        const id = row.dataset.id;
        const st = this.state.unlockState(id);

        if (st.unlocked) {
          this.synth.click();
          this.view.setLine(id);
          this.setTab('factory');
          this.refresh(true);
          return;
        }
        if (st.canUnlock) {
          this.state.unlockProduct(id);      // sound/toast via the event
          return;
        }
        this.synth.error();
        this.toast(st.levelMet
          ? 'Need ' + Format.money(st.cost) + ' to open this line'
          : 'Unlocks at level ' + st.levelRequired, 'warn');
      });

      // ---- buy-amount selector -------------------------------------
      this.dom.buyAmt.addEventListener('click', ev => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        this.synth.click();
        this.buyAmount = btn.dataset.amt === 'max' ? 'max' : +btn.dataset.amt;
        [...this.dom.buyAmt.children].forEach(b =>
          b.classList.toggle('on', b === btn));
        this.refresh(true);
      });

      // ---- axis buy buttons ----------------------------------------
      this.dom.axisRows.addEventListener('click', ev => {
        const btn = ev.target.closest('.abuy');
        if (!btn) return;
        const axis = btn.closest('.arow').dataset.axis;
        const id = this.state.selectedLine;
        // quality is bought one star at a time, whatever the selector says
        const amt = axis === 'quality' ? 1 : this.buyAmount;
        const res = this.state.buyUpgrade(id, axis, amt);
        if (!res.bought) {
          this.synth.error();
          const cost = this.state.upgradeCost(id, axis, amt === 'max' ? 1 : amt);
          this.toast(isFinite(cost) ? 'Not enough cash' : 'Fully upgraded', 'warn');
        }
        this.refresh(true);
      });

      // ---- booster rows --------------------------------------------
      this.dom.boosterRows.addEventListener('click', ev => {
        const btn = ev.target.closest('.bcta');
        if (!btn) return;
        const id = btn.closest('.brow').dataset.id;
        const res = this.state.activateBooster(id);
        if (!res.ok) {
          this.synth.error();
          this.toast(res.reason === 'cooldown'
            ? 'Ready in ' + Format.time(res.wait) : 'Unavailable', 'warn');
        }
        this.refreshBoosters();
      });

      // ---- modals ---------------------------------------------------
      [this.dom.modalBoosters, this.dom.modalOffline].forEach(m => {
        m.addEventListener('click', ev => {
          if (ev.target === m || ev.target.closest('[data-close]')) {
            this.synth.click();
            this.closeModal(m);
          }
        });
      });
      this.dom.offCollect.addEventListener('click', () => {
        this.synth.money();
        this.closeModal(this.dom.modalOffline);
      });

      // ---- audio ----------------------------------------------------
      this.dom.mute.addEventListener('click', () => {
        const muted = this.synth.toggleMute();
        this.dom.muteIcon.textContent = muted ? '🔇' : '🔊';
        this.dom.mute.setAttribute('aria-pressed', String(muted));
        if (!muted) this.synth.click();
      });

      // ---- keyboard --------------------------------------------------
      global.addEventListener('keydown', ev => {
        if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
        const k = ev.key.toLowerCase();
        if (k === '1') this.setTab('products');
        else if (k === '2') this.setTab('factory');
        else if (k === '3') this.openModal('boosters');
        else if (k === 'm') this.dom.mute.click();
        else if (k === 'd') this.dom.diag.hidden = !this.dom.diag.hidden;
        else if (k === 'escape') {
          this.closeModal(this.dom.modalBoosters);
          this.closeModal(this.dom.modalOffline);
          this.setTab(null);
        }
      });
    }

    /* ================================================================= */
    /*  Event listeners — state → UI + audio                             */
    /* ================================================================= */
    bindState() {
      const s = this.state;

      s.on('upgrade', e => {
        this.synth.upgrade();
        const axis = P.getAxis(e.axis);
        this.floatText(axis.short + ' +' + e.levels, '#ffc832');
      });

      s.on('unlock', e => {
        this.synth.unlock();
        this.toast('New line online — ' + e.product.name, 'good');
        this.view.setLine(e.id);
        this.setTab('factory');
        this.refresh(true);
      });

      s.on('levelup', e => {
        this.synth.levelup();
        this.toast('Level ' + e.level, 'good');
        this.dom.level.parentElement.classList.add('pulse');
        setTimeout(() => this.dom.level.parentElement.classList.remove('pulse'), 900);
      });

      s.on('objective', e => {
        this.synth.objective();
        const r = e.reward || {};
        this.toast('✓ ' + e.name +
          (r.cash ? '  +' + Format.money(r.cash) : ''), 'good');
        this.refresh(true);
      });

      s.on('booster', e => {
        this.synth.upgrade();
        if (e.granted) {
          this.floatText('+' + Format.money(e.granted), '#7dffb0');
          this.toast(e.def.name + ' — banked ' + Format.money(e.granted), 'good');
        } else {
          this.toast(e.def.name + ' active', 'good');
        }
        this.refreshBoosters();
      });
    }

    /* ================================================================= */
    /*  Event listeners — world → audio/UI                               */
    /* ================================================================= */
    bindWorld() {
      const e = this.engine;

      // a part landing on the belt
      e.byTag('arm').forEach(arm => { arm.onPlace = () => this.synth.assembly(); });

      // an item reaching the end of a line reads as money
      e.byTag('conveyor').forEach(c => { c.onDeliver = () => this.synth.money(); });

      // a truck pulling out ships the manifest
      e.byTag('truck').forEach(t => {
        t.onDepart = truck => {
          this.synth.truck();
          const value = this.state.incomePerMinute() * (truck.wait / 60);
          if (value > 0) {
            this.floaters.push({
              gx: truck.px, gy: truck.laneY, gz: 1.9,
              text: '+' + Format.money(value), color: '#7dffb0',
              life: 0, max: 1.9
            });
          }
        };
      });

      // tapping the floor collapses the sheet — the factory is the focus
      e.onTileClick = () => { this.synth.click(); this.setTab(null); };

      // claim the screen-space pass for floaters
      e.onRender = (ctx, w, h) => this.drawFloaters(ctx, w, h);

      // tick after the economy and the binding
      const prev = e.onTick;
      e.onTick = (dt, time) => {
        if (prev) prev(dt, time);
        this.tick(dt);
      };
    }

    /* ================================================================= */
    /*  Frame                                                            */
    /* ================================================================= */
    tick(dt) {
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life += dt;
        f.gz += dt * 0.55;
        if (f.life > f.max) this.floaters.splice(i, 1);
      }
      this._clock += dt;
      if (this._clock >= 0.1) { this._clock = 0; this.refresh(false); }
    }

    /** Screen-space text rising off the world — drawn after the camera pass. */
    drawFloaters(ctx, w, h) {
      if (!this.floaters.length) return;
      const iso = this.engine.iso, cam = this.engine.camera;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
      for (const f of this.floaters) {
        const k = f.life / f.max;
        const x = iso.x(f.gx, f.gy) * cam.zoom + cam.x;
        const y = iso.y(f.gx, f.gy, f.gz) * cam.zoom + cam.y;
        if (x < -80 || x > w + 80 || y < -60 || y > h + 60) continue;
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(4,7,11,.85)';
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
      }
      ctx.restore();
    }

    /** Floater pinned to the middle of the view (for UI-origin events). */
    floatText(text, color) {
      const g = this.engine;
      const c = g.iso.unproject((g.viewW / 2 - g.camera.x) / g.camera.zoom,
        (g.viewH * 0.42 - g.camera.y) / g.camera.zoom, 0);
      this.floaters.push({
        gx: c.gx, gy: c.gy, gz: 0.6, text, color: color || '#ffc832',
        life: 0, max: 1.5
      });
    }

    /* ================================================================= */
    /*  Refresh                                                          */
    /* ================================================================= */
    refresh(structural) {
      const s = this.state;

      this.dom.cash.textContent = Format.money(s.cash);
      this.dom.rate.textContent = Format.rate(s.incomePerMinute());
      this.dom.level.textContent = s.level;
      this.dom.xp.style.width = (s.xpProgress() * 100).toFixed(1) + '%';

      this.refreshObjective();
      this.refreshProducts(structural);
      this.refreshAxes();
      this.refreshBoosters();
      this.refreshBoostStrip();
    }

    refreshObjective() {
      const o = this.state.activeObjectives(1)[0];
      const d = this.dom;
      if (!o) {
        d.objName.textContent = 'All objectives complete';
        d.objFill.style.width = '100%';
        d.objCount.textContent = '';
        d.objReward.textContent = '';
        return;
      }
      d.objName.textContent = o.name + ' — ' + o.desc;
      d.objFill.style.width = (o.progress * 100).toFixed(1) + '%';
      d.objCount.textContent = o.label;
      d.objReward.textContent = o.reward && o.reward.cash
        ? '+' + Format.money(o.reward.cash) : '';
    }

    refreshProducts(structural) {
      const s = this.state;
      let unlocked = 0;
      P.PRODUCTS.forEach(p => {
        const r = this._rows.product.get(p.id);
        const line = s.line(p.id);
        const st = s.unlockState(p.id);
        if (st.unlocked) unlocked++;

        r.row.classList.toggle('locked', !st.unlocked);
        r.row.classList.toggle('ready', !st.unlocked && st.canUnlock);
        r.row.classList.toggle('active', s.selectedLine === p.id && st.unlocked);

        if (st.unlocked) {
          r.stars.textContent = Format.stars(line.quality);
          r.sub.textContent = Format.num(s.throughputPerMinute(p.id)) + ' u/min · ' +
            Format.money(s.valuePerUnit(p.id)) + '/unit';
          r.rate.textContent = Format.rate(s.lineIncomePerMinute(p.id));
          r.cta.textContent = s.selectedLine === p.id ? 'ACTIVE' : 'VIEW';
        } else {
          r.stars.textContent = '';
          r.sub.textContent = p.blurb;
          r.rate.textContent = st.levelMet ? Format.money(p.unlockCost) : '';
          r.cta.textContent = st.levelMet
            ? (st.affordable ? 'UNLOCK' : Format.money(p.unlockCost))
            : 'LV ' + p.unlockLv;
        }
      });
      this.dom.linesNote.textContent = unlocked + ' / ' + P.PRODUCTS.length + ' lines';
      if (structural) this.refreshFactoryHead();
    }

    refreshFactoryHead() {
      const s = this.state, id = s.selectedLine, p = s.product(id);
      if (!p) return;
      this.dom.factoryTitle.textContent = p.name;
      this.dom.lineSummary.innerHTML =
        '<span><b>' + Format.rate(s.lineIncomePerMinute(id)) + '</b>income</span>' +
        '<span><b>' + Format.num(s.throughputPerMinute(id)) + '</b>units/min</span>' +
        '<span><b>' + Format.money(s.valuePerUnit(id)) + '</b>per unit</span>' +
        '<span><b>' + Format.num(s.line(id).shipped) + '</b>shipped</span>';
    }

    refreshAxes() {
      const s = this.state, id = s.selectedLine;
      const line = s.line(id);
      if (!line) return;
      this.refreshFactoryHead();

      // share of the line's volume, so each bar means something
      const vol = ['speed', 'supply', 'robot']
        .reduce((t, a) => t + P.axisMultiplier(a, line[a]), 0);

      P.AXES.forEach(a => {
        const r = this._rows.axis.get(a.id);
        const lvl = line[a.id];
        const mult = P.axisMultiplier(a.id, lvl);
        const stars = a.kind === 'stars';
        const amt = stars ? 1 : this.buyAmount;

        r.lvl.textContent = stars ? Format.stars(lvl) : 'Lv ' + lvl;
        r.mult.textContent = stars ? '×' + mult.toFixed(2) + ' value'
          : '×' + mult.toFixed(2) + ' rate';
        r.meter.style.width = (stars ? lvl / 5 : mult / vol) * 100 + '%';

        const maxed = lvl >= a.max;
        let cost = Infinity, levels = 0;
        if (!maxed) {
          if (amt === 'max') {
            const plan = P.axisAffordable(s.product(id), a.id, lvl, s.cash, a.max - lvl);
            cost = plan.cost; levels = plan.levels;
          } else {
            const plan = P.axisBulkCost(s.product(id), a.id, lvl, amt);
            cost = plan.cost; levels = plan.levels;
          }
        }
        const afford = !maxed && levels > 0 && cost <= s.cash;
        r.buy.textContent = maxed ? 'MAX'
          : (amt === 'max'
            ? (levels > 0 ? '+' + levels + '  ' + Format.money(cost) : 'MAX BUY')
            : (stars ? '★ ' : '×' + amt + '  ') + Format.money(cost));
        r.buy.classList.toggle('afford', afford);
        r.buy.disabled = maxed;
        r.row.classList.toggle('maxed', maxed);
      });
    }

    refreshBoosters() {
      this.state.boosterViews().forEach(v => {
        const r = this._rows.booster.get(v.id);
        if (!r) return;
        r.row.classList.toggle('active', v.active);
        r.row.classList.toggle('cooling', !v.active && v.cooling);
        if (v.active) {
          r.cta.textContent = Format.time(v.remaining);
          r.meter.style.width = (v.activeProgress * 100).toFixed(1) + '%';
        } else if (v.cooling) {
          r.cta.textContent = Format.time(v.cooldown);
          r.meter.style.width = (v.cooldownProgress * 100).toFixed(1) + '%';
        } else {
          r.cta.textContent = 'ACTIVATE';
          r.meter.style.width = '100%';
        }
        r.cta.classList.toggle('afford', v.ready);
      });
    }

    /** Pills under the header for whatever is currently running. */
    refreshBoostStrip() {
      const active = this.state.boosterViews().filter(v => v.active);
      const strip = this.dom.boostStrip;
      const key = active.map(v => v.id + Math.ceil(v.remaining)).join(',');
      if (key === this._stripKey) return;
      this._stripKey = key;
      strip.innerHTML = '';
      active.forEach(v => {
        const pill = make('span', 'boost-pill',
          v.def.icon + ' ' + v.def.name + ' <b>' + Format.time(v.remaining) + '</b>');
        pill.style.setProperty('--c', v.def.tone);
        strip.appendChild(pill);
      });
    }

    /* ================================================================= */
    /*  Chrome                                                           */
    /* ================================================================= */
    setTab(name, silent) {
      this.tab = name;
      const sheet = this.dom.sheet;
      sheet.classList.toggle('open', !!name);
      for (const k in this.dom.panels) this.dom.panels[k].hidden = (k !== name);
      [...this.dom.tabs.children].forEach(b =>
        b.classList.toggle('on', b.dataset.tab === name));
      if (name && !silent) this.refresh(true);
    }

    openModal(which) {
      const m = which === 'boosters' ? this.dom.modalBoosters : this.dom.modalOffline;
      if (which === 'boosters') this.refreshBoosters();
      m.hidden = false;
      requestAnimationFrame(() => m.classList.add('in'));
    }

    closeModal(m) {
      if (!m || m.hidden) return;
      m.classList.remove('in');
      setTimeout(() => { m.hidden = true; }, 180);
    }

    showOffline(report) {
      this.dom.offAway.textContent = 'Your factory ran for ' + Format.time(report.away) +
        ' while you were away.';
      this.dom.offAmount.textContent = Format.money(report.earned);
      this.dom.offFine.textContent =
        Format.pct(report.efficiency) + ' of the ' +
        Format.rate(report.ratePerMinute) + ' line rate' +
        (report.capped ? ' · capped at ' + report.capHours + 'h' : '') +
        ' · ' + Format.num(report.units) + ' units shipped';
      this.openModal('offline');
    }

    toast(text, kind) {
      const t = make('div', 'toast' + (kind ? ' ' + kind : ''), text);
      this.dom.toasts.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
      setTimeout(() => {
        t.classList.remove('in');
        setTimeout(() => t.remove(), 260);
      }, 2600);
      while (this.dom.toasts.children.length > 4) this.dom.toasts.firstChild.remove();
    }
  }

  /* =================================================================== */
  function boot() {
    const engine = global.GAME, state = global.STATE, view = global.VIEW;
    if (!engine || !state || !view) {
      console.error('[isofactory] UI booted before the game was ready');
      return null;
    }
    const synth = new global.AUDIO.Synth();
    synth.unlockOnGesture();

    const ui = new GameUI(engine, state, view, synth);
    global.UI = ui;
    global.SYNTH = synth;
    return ui;
  }

  global.GAMEUI = { GameUI, boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
