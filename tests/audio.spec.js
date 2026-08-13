// @ts-check
const { test, expect } = require('@playwright/test');

const CUES = ['assembly', 'money', 'truck', 'levelup', 'unlock', 'upgrade', 'objective', 'click', 'error'];

test.describe('audio — procedural synthesiser (js/audio.js)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.AUDIO);
    // a real user gesture, so the AudioContext is allowed to start and resume
    await page.mouse.click(10, 10);
  });

  test('every declared cue synthesises without throwing once unlocked', async ({ page }) => {
    const results = await page.evaluate(async (cues) => {
      const synth = new window.AUDIO.Synth();
      synth.ensure();
      if (synth.ctx && synth.ctx.state !== 'running') {
        try { await synth.ctx.resume(); } catch (e) { /* ignore */ }
      }
      const out = {};
      for (const name of cues) {
        try { out[name] = synth.play(name); }
        catch (e) { out[name] = 'threw: ' + e.message; }
      }
      return out;
    }, CUES);

    for (const name of CUES) {
      expect(typeof results[name] === 'string' && results[name].startsWith('threw:'),
        `${name} cue should not throw (got: ${results[name]})`).toBe(false);
    }
  });

  test('every cue name in THROTTLE has a callable method on Synth, and vice versa', async ({ page }) => {
    const check = await page.evaluate((cues) => {
      const synth = new window.AUDIO.Synth();
      const throttleKeys = Object.keys(window.AUDIO.THROTTLE).sort();
      const cueKeys = [...cues].sort();
      const allCallable = cues.every(n => typeof synth[n] === 'function');
      return {
        throttleKeys, cueKeys, allCallable,
        setsMatch: JSON.stringify(throttleKeys) === JSON.stringify(cueKeys)
      };
    }, CUES);
    expect(check.allCallable).toBe(true);
    expect(check.setsMatch).toBe(true);
  });

  test('mute persists to localStorage under a key that never collides with the save', async ({ page }) => {
    const result = await page.evaluate(() => {
      const synth = new window.AUDIO.Synth();
      synth.ensure();
      synth.setMuted(true);
      const audioRaw = window.localStorage.getItem('isofactory.audio.v1');
      return {
        audioRaw,
        distinctFromSaveKey: 'isofactory.audio.v1' !== window.PRODUCTS.BALANCE.saveKey
      };
    });
    expect(result.distinctFromSaveKey).toBe(true);
    expect(JSON.parse(result.audioRaw).muted).toBe(true);
  });

  test('a fresh Synth restores a previously persisted mute preference', async ({ page }) => {
    const muted = await page.evaluate(() => {
      const a = new window.AUDIO.Synth();
      a.ensure();
      a.setMuted(true);
      const b = new window.AUDIO.Synth(); // constructed later, same localStorage
      return b.muted;
    });
    expect(muted).toBe(true);
  });

  test('while muted, play() returns false and does not throw', async ({ page }) => {
    const result = await page.evaluate(() => {
      const synth = new window.AUDIO.Synth();
      synth.ensure();
      synth.setMuted(true);
      try { return { played: synth.play('click'), threw: false }; }
      catch (e) { return { played: null, threw: true }; }
    });
    expect(result.threw).toBe(false);
    expect(result.played).toBe(false);
  });

  test('rapid repeated calls inside the throttle window are dropped (no buzzsaw)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const synth = new window.AUDIO.Synth();
      synth.ensure();
      if (synth.ctx && synth.ctx.state !== 'running') {
        try { await synth.ctx.resume(); } catch (e) { /* ignore */ }
      }
      const first = synth.play('assembly');
      const secondImmediately = synth.play('assembly'); // well inside the 85ms gap
      return { first, secondImmediately };
    });
    expect(result.first).toBe(true);
    expect(result.secondImmediately).toBe(false);
  });

  test('play() with an unknown cue name returns false instead of throwing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const synth = new window.AUDIO.Synth();
      try { return { played: synth.play('not-a-real-cue'), threw: false }; }
      catch (e) { return { played: null, threw: true }; }
    });
    expect(result.threw).toBe(false);
    expect(result.played).toBe(false);
  });
});
