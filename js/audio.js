/* =====================================================================
   audio.js — procedural sound. No samples, no files: every effect is
   synthesised from oscillators and noise buffers at call time.
   ---------------------------------------------------------------------
   Three things make this survive contact with a real game:

   1. LAZY CONTEXT. Browsers refuse to start an AudioContext without a
      user gesture. Construction is deferred to the first real interaction
      and `resume()` is retried on every play, so nothing is lost if the
      first gesture was consumed elsewhere.

   2. THROTTLING. Belt deliveries and arm cycles fire far faster than the
      ear wants. Every effect declares a minimum gap and silently drops
      calls inside it, so a 10× speed upgrade doesn't turn into a buzzsaw.

   3. HEADROOM. Everything runs through one gain into a compressor, so a
      level-up landing on top of four assembly clicks ducks instead of
      clipping. A generated impulse response adds a short room so the
      blips don't sound like they were recorded in a vacuum.

     const synth = new AUDIO.Synth();
     synth.unlockOnGesture();
     synth.play('levelup');
   ===================================================================== */
(function (global) {
  'use strict';

  const AC = global.AudioContext || global.webkitAudioContext;

  /** Minimum seconds between repeats, per effect. */
  const THROTTLE = {
    assembly: 0.085, money: 0.10, click: 0.03, upgrade: 0.05,
    truck: 0.9, levelup: 0.35, unlock: 0.3, objective: 0.25, error: 0.15
  };

  const PREF_KEY = 'isofactory.audio.v1';

  class Synth {
    constructor(opts) {
      this.ctx = null;
      this.master = null;
      this.wet = null;
      this.volume = (opts && opts.volume) || 0.55;
      this.muted = false;
      this._last = {};
      this._chain = 0;          // consecutive money blips, for the pitch run
      this._chainAt = 0;
      this._started = false;

      // restore the player's mute choice before anything can make noise
      try {
        const p = JSON.parse(global.localStorage.getItem(PREF_KEY) || '{}');
        if (typeof p.muted === 'boolean') this.muted = p.muted;
        if (typeof p.volume === 'number') this.volume = p.volume;
      } catch (e) { /* storage blocked — defaults are fine */ }
    }

    /* ------------------------------------------------------------ setup */
    /** Build the context on the first gesture of any kind. */
    unlockOnGesture(target) {
      const el = target || global;
      const go = () => { this.ensure(); };
      ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
        el.addEventListener(ev, go, { once: false, passive: true }));
      return this;
    }

    ensure() {
      if (!AC) return null;
      if (!this.ctx) {
        try { this.ctx = new AC(); } catch (e) { return null; }

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;

        // one compressor for the whole game keeps overlapping cues sane
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 22;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;

        this.master.connect(comp);
        comp.connect(this.ctx.destination);

        // small generated room, mixed in behind everything
        const rev = this.ctx.createConvolver();
        rev.buffer = this._impulse(0.55, 2.6);
        this.wet = this.ctx.createGain();
        this.wet.gain.value = 0.16;
        this.wet.connect(rev);
        rev.connect(this.master);

        this._started = true;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    /** Exponentially decaying noise — a cheap, decent small-room IR. */
    _impulse(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(rate * seconds));
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    }

    _noiseBuffer(seconds) {
      const rate = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(rate * seconds));
      const buf = this.ctx.createBuffer(1, len, rate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    /* ----------------------------------------------------------- mixing */
    setMuted(m) {
      this.muted = !!m;
      if (this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.02);
      }
      this._savePrefs();
      return this.muted;
    }

    toggleMute() { return this.setMuted(!this.muted); }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master && !this.muted) {
        this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
      }
      this._savePrefs();
    }

    _savePrefs() {
      try {
        global.localStorage.setItem(PREF_KEY,
          JSON.stringify({ muted: this.muted, volume: this.volume }));
      } catch (e) { /* ignore */ }
    }

    /* --------------------------------------------------------- plumbing */
    /** Gate: false when muted, contextless, or inside the throttle window. */
    _gate(name) {
      if (this.muted) return false;
      const ctx = this.ensure();
      if (!ctx || ctx.state !== 'running') return false;
      const gap = THROTTLE[name] || 0.05;
      const t = ctx.currentTime;
      if (this._last[name] != null && t - this._last[name] < gap) return false;
      this._last[name] = t;
      return true;
    }

    /**
     * One shaped voice: oscillator → gain (ADSR-ish) → destination, with a
     * send to the room. Everything below is composed from this.
     */
    _voice(o) {
      const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.freqTo) {
        if (o.slide === 'linear') osc.frequency.linearRampToValueAtTime(o.freqTo, t0 + o.dur);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), t0 + o.dur);
      }
      if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

      const peak = (o.gain == null ? 0.2 : o.gain);
      const atk = o.attack == null ? 0.005 : o.attack;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + atk);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.setValueAtTime(o.cutoff || 900, t0);
        if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffTo), t0 + o.dur);
        f.Q.value = o.q == null ? 1 : o.q;
        node.connect(f); node = f;
      }
      node.connect(gain);
      gain.connect(this.master);
      if (o.room !== false) gain.connect(this.wet);

      osc.start(t0);
      osc.stop(t0 + o.dur + 0.05);
      return osc;
    }

    /** Filtered noise burst — impacts, air, engine texture. */
    _noise(o) {
      const ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(Math.max(0.05, o.dur));

      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.cutoff || 1200, t0);
      if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffTo), t0 + o.dur);
      f.Q.value = o.q == null ? 1.2 : o.q;

      const gain = ctx.createGain();
      const peak = o.gain == null ? 0.12 : o.gain;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + (o.attack || 0.004));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

      src.connect(f); f.connect(gain); gain.connect(this.master);
      if (o.room !== false) gain.connect(this.wet);
      src.start(t0);
      src.stop(t0 + o.dur + 0.05);
      return src;
    }

    /* ============================================================ cues */

    /** A part landing on the belt: soft mechanical tick + servo blip. */
    assembly() {
      if (!this._gate('assembly')) return false;
      this._noise({ dur: 0.055, cutoff: 2600, cutoffTo: 900, q: 1.4, gain: 0.055 });
      this._voice({
        type: 'square', freq: 320, freqTo: 190, dur: 0.07,
        gain: 0.035, filter: 'lowpass', cutoff: 1800
      });
      return true;
    }

    /**
     * Money. Consecutive blips inside a second walk up a pentatonic run,
     * so a fast line reads as a satisfying cascade rather than one pitch
     * hammered over and over.
     */
    money() {
      if (!this._gate('money')) return false;
      const t = this.ctx.currentTime;
      if (t - this._chainAt > 0.9) this._chain = 0;
      this._chainAt = t;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16];
      const semi = steps[Math.min(this._chain, steps.length - 1)];
      this._chain++;
      const f = 784 * Math.pow(2, semi / 12);
      this._voice({ type: 'triangle', freq: f, dur: 0.11, gain: 0.10, attack: 0.003 });
      this._voice({ type: 'sine', freq: f * 2, dur: 0.07, gain: 0.045, delay: 0.012 });
      return true;
    }

    /** Truck pulling away: diesel note dropping under a tyre-noise sweep. */
    truck() {
      if (!this._gate('truck')) return false;
      this._voice({
        type: 'sawtooth', freq: 78, freqTo: 41, dur: 1.35, gain: 0.16,
        filter: 'lowpass', cutoff: 420, cutoffTo: 150, q: 3, attack: 0.06
      });
      this._voice({
        type: 'square', freq: 39, freqTo: 21, dur: 1.2, gain: 0.07,
        filter: 'lowpass', cutoff: 260
      });
      this._noise({
        dur: 1.1, filter: 'bandpass', cutoff: 900, cutoffTo: 260,
        q: 0.8, gain: 0.05, attack: 0.12
      });
      // air brake on release
      this._noise({ dur: 0.3, filter: 'highpass', cutoff: 2400, gain: 0.05, delay: 0.9 });
      return true;
    }

    /** Level up: rising major arpeggio with a shimmering octave on top. */
    levelup() {
      if (!this._gate('levelup')) return false;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        this._voice({
          type: 'triangle', freq: f, dur: 0.42, gain: 0.13,
          delay: i * 0.085, attack: 0.008
        });
        this._voice({
          type: 'sawtooth', freq: f * 2, dur: 0.3, gain: 0.035,
          delay: i * 0.085, detune: 7, filter: 'lowpass', cutoff: 4200
        });
      });
      this._voice({
        type: 'sine', freq: 1046.5, freqTo: 1568, dur: 0.9,
        gain: 0.07, delay: 0.34, attack: 0.05
      });
      return true;
    }

    /** New production line: short three-note fanfare, fifths stacked. */
    unlock() {
      if (!this._gate('unlock')) return false;
      [[392, 0], [587.33, 0.1], [783.99, 0.2]].forEach(([f, d]) => {
        this._voice({ type: 'sawtooth', freq: f, dur: 0.5, gain: 0.09, delay: d, filter: 'lowpass', cutoff: 3000, q: 2 });
        this._voice({ type: 'triangle', freq: f * 1.5, dur: 0.4, gain: 0.05, delay: d });
      });
      this._noise({ dur: 0.5, filter: 'highpass', cutoff: 5200, gain: 0.03, delay: 0.2 });
      return true;
    }

    /** Upgrade bought: two-step ratchet up. */
    upgrade() {
      if (!this._gate('upgrade')) return false;
      this._voice({ type: 'square', freq: 660, dur: 0.07, gain: 0.06, filter: 'lowpass', cutoff: 2600 });
      this._voice({ type: 'square', freq: 990, dur: 0.1, gain: 0.06, delay: 0.06, filter: 'lowpass', cutoff: 3200 });
      return true;
    }

    /** Objective cleared: bell pair with a long tail. */
    objective() {
      if (!this._gate('objective')) return false;
      this._voice({ type: 'sine', freq: 1568, dur: 0.8, gain: 0.10, attack: 0.004 });
      this._voice({ type: 'sine', freq: 2093, dur: 1.1, gain: 0.06, delay: 0.06 });
      this._voice({ type: 'sine', freq: 3136, dur: 0.5, gain: 0.025, delay: 0.1 });
      return true;
    }

    /** UI tap. */
    click() {
      if (!this._gate('click')) return false;
      this._voice({
        type: 'triangle', freq: 1250, freqTo: 900, dur: 0.035,
        gain: 0.05, room: false
      });
      return true;
    }

    /** Rejected action — can't afford, on cooldown, still locked. */
    error() {
      if (!this._gate('error')) return false;
      this._voice({
        type: 'square', freq: 168, freqTo: 110, dur: 0.16, gain: 0.07,
        filter: 'lowpass', cutoff: 900, room: false
      });
      return true;
    }

    /** Generic dispatch, so callers can be data-driven. */
    play(name) {
      const fn = this[name];
      return typeof fn === 'function' ? fn.call(this) : false;
    }
  }

  global.AUDIO = { Synth, THROTTLE };
})(window);
