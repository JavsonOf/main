// @ts-check
const { test, expect } = require('@playwright/test');

/** Build a fresh GameState in the page context with in-memory storage
 *  isolated per test (a random save key avoids cross-test bleed even
 *  though each test also gets its own browser context). */
async function freshState(page, opts) {
  return page.evaluate((opts) => {
    const state = new window.ECONOMY.GameState(Object.assign({
      saveKey: 'test.save.' + Math.random()
    }, opts || {}));
    return state;
  }, opts);
}

test.describe('economy — income identities & cost curves (js/economy.js, js/products.js)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ECONOMY && !!window.PRODUCTS);
  });

  test('incomePerMinute() equals the sum of every line\'s lineIncomePerMinute()', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.a' });
      const { PRODUCTS: LIST } = window.PRODUCTS;
      // unlock everything so all lines contribute
      LIST.forEach(p => { state.lines[p.id].unlocked = true; });
      const total = state.incomePerMinute();
      const sum = LIST.reduce((s, p) => s + state.lineIncomePerMinute(p.id), 0);
      return Math.abs(total - sum) < 1e-9;
    });
    expect(ok).toBe(true);
  });

  test('lineIncomePerMinute() equals throughputPerMinute() * valuePerUnit()', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.b' });
      const { PRODUCTS: LIST } = window.PRODUCTS;
      const id = LIST[0].id;
      state.lines[id].unlocked = true;
      const expected = state.throughputPerMinute(id) * state.valuePerUnit(id);
      return Math.abs(state.lineIncomePerMinute(id) - expected) < 1e-9;
    });
    expect(ok).toBe(true);
  });

  test('a locked line always contributes zero throughput and zero income', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.c' });
      const { PRODUCTS: LIST } = window.PRODUCTS;
      const id = LIST[LIST.length - 1].id; // a late-game line, starts locked
      state.lines[id].unlocked = false;
      return state.throughputPerMinute(id) === 0 && state.lineIncomePerMinute(id) === 0;
    });
    expect(ok).toBe(true);
  });

  test('axisCost strictly increases as an axis levels up (upgrades get more expensive)', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const { PRODUCTS: LIST, axisCost, getProduct } = window.PRODUCTS;
      const p = getProduct(LIST[0].id);
      let prevCost = -1;
      let increasing = true;
      for (let lvl = 1; lvl <= 10; lvl++) {
        const c = axisCost(p, 'speed', lvl);
        if (c <= prevCost) increasing = false;
        prevCost = c;
      }
      return increasing;
    });
    expect(ok).toBe(true);
  });

  test('upgradePreview() reports a positive gain and restores the axis level afterwards', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.d' });
      const { PRODUCTS: LIST } = window.PRODUCTS;
      const id = LIST[0].id;
      state.lines[id].unlocked = true;
      const before = state.lines[id].speed;
      const preview = state.upgradePreview(id, 'speed');
      const after = state.lines[id].speed;
      return { gain: preview.gain, cost: preview.cost, before, after };
    });
    expect(result.gain).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
    expect(result.after).toBe(result.before); // side-effect-free preview
  });

  test('boosterMultiplier() is 1 with nothing active, and folds in an active booster', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.e' });
      const baseline = state.boosterMultiplier('income');
      const { BOOSTERS } = window.PRODUCTS;
      const incomeBooster = BOOSTERS.find(b => b.mult && b.mult.income);
      state.boosters[incomeBooster.id] = { until: Date.now() + 60000, cdUntil: 0 };
      const boosted = state.boosterMultiplier('income');
      return { baseline, boosted, expectedMult: incomeBooster.mult.income };
    });
    expect(result.baseline).toBe(1);
    expect(result.boosted).toBeCloseTo(result.expectedMult, 9);
  });

  test('an expired booster (until in the past) no longer contributes to the multiplier', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.f' });
      const { BOOSTERS } = window.PRODUCTS;
      const incomeBooster = BOOSTERS.find(b => b.mult && b.mult.income);
      state.boosters[incomeBooster.id] = { until: Date.now() - 1000, cdUntil: 0 };
      return state.boosterMultiplier('income');
    });
    expect(result).toBe(1);
  });

  test('addXp() levels up exactly as many times as the XP crosses thresholds, and caps at max level', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.g' });
      const startLevel = state.level;
      const need = window.PRODUCTS.xpForNext(startLevel);
      const gained = state.addXp(need + 1); // exactly one level, with 1 xp left over
      return { gained, newLevel: state.level, xpLeft: state.xp };
    });
    expect(result.gained).toBe(1);
    expect(result.xpLeft).toBeCloseTo(1, 6);
  });

  test('xpProgress() is between 0 and 1, and 0 for a freshly created state', async ({ page }) => {
    const p = await page.evaluate(() => new window.ECONOMY.GameState({ saveKey: 'test.h' }).xpProgress());
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

test.describe('economy — offline earnings (settleOffline)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ECONOMY);
  });

  test('a 3 hour absence pays out at the reduced offline efficiency, uncapped', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.off1' });
      window.PRODUCTS.PRODUCTS.forEach(p => { state.lines[p.id].unlocked = true; });
      const rate = state.incomePerMinute();
      const threeHoursAgo = Date.now() - 3 * 3600 * 1000;
      const report = state.settleOffline(threeHoursAgo);
      const expected = rate * (3 * 60) * window.PRODUCTS.BALANCE.offlineEfficiency;
      return { earned: report.earned, expected, capped: report.capped };
    });
    expect(result.capped).toBe(false);
    // a few ms of real time pass between reading `rate` and calling
    // settleOffline(), so compare within a small relative tolerance rather
    // than bit-for-bit equality.
    expect(Math.abs(result.earned - result.expected) / result.expected).toBeLessThan(1e-5);
  });

  test('a 48 hour absence is capped at 24 hours of offline earnings', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.off2' });
      window.PRODUCTS.PRODUCTS.forEach(p => { state.lines[p.id].unlocked = true; });
      const rate = state.incomePerMinute();
      const twoDaysAgo = Date.now() - 48 * 3600 * 1000;
      const report = state.settleOffline(twoDaysAgo);
      const expected = rate * (24 * 60) * window.PRODUCTS.BALANCE.offlineEfficiency;
      return { earned: report.earned, expected, capped: report.capped, awaySeconds: report.awaySeconds };
    });
    expect(result.capped).toBe(true);
    expect(result.awaySeconds).toBeCloseTo(24 * 3600, 0);
    expect(Math.abs(result.earned - result.expected) / result.expected).toBeLessThan(1e-5);
  });

  test('a clock that moved backwards (future save timestamp) pays out nothing', async ({ page }) => {
    const report = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.off3' });
      const future = Date.now() + 3600 * 1000;
      return state.settleOffline(future);
    });
    expect(report).toBeNull();
  });

  test('an absence shorter than offlineMinSeconds produces no report', async ({ page }) => {
    const report = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.off4' });
      return state.settleOffline(Date.now() - 5000); // 5s, min is 60s
    });
    expect(report).toBeNull();
  });

  test('an active income booster does not carry into offline settlement once expired', async ({ page }) => {
    const result = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.off5' });
      window.PRODUCTS.PRODUCTS.forEach(p => { state.lines[p.id].unlocked = true; });
      const { BOOSTERS } = window.PRODUCTS;
      const incomeBooster = BOOSTERS.find(b => b.mult && b.mult.income);
      // booster expired 1 hour ago, well before "now" during offline settlement
      state.boosters[incomeBooster.id] = { until: Date.now() - 3600 * 1000, cdUntil: 0 };
      const unboostedRate = state.incomePerMinute();
      const threeHoursAgo = Date.now() - 3 * 3600 * 1000;
      const report = state.settleOffline(threeHoursAgo);
      const expected = unboostedRate * (3 * 60) * window.PRODUCTS.BALANCE.offlineEfficiency;
      return { earned: report.earned, expected };
    });
    expect(Math.abs(result.earned - result.expected) / result.expected).toBeLessThan(1e-5);
  });
});

test.describe('economy — save/load robustness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ECONOMY);
  });

  test('save() then load() on a fresh state round-trips cash, level and line upgrades', async ({ page }) => {
    const result = await page.evaluate(() => {
      const key = 'test.roundtrip';
      const a = new window.ECONOMY.GameState({ saveKey: key });
      const { PRODUCTS: LIST } = window.PRODUCTS;
      a.cash = 12345;
      a.lines[LIST[0].id].speed = 7;
      a.save();

      const b = new window.ECONOMY.GameState({ saveKey: key });
      b.load();
      return { cash: b.cash, speed: b.lines[LIST[0].id].speed };
    });
    expect(result.cash).toBe(12345);
    expect(result.speed).toBe(7);
  });

  test('load() on a corrupt save discards it and reports fresh+corrupt without throwing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const key = 'test.corrupt';
      window.ECONOMY.Storage.set(key, '{not valid json!!');
      const state = new window.ECONOMY.GameState({ saveKey: key });
      let event = null;
      state.on('load', e => { event = e; });
      const report = state.load();
      const stillThere = window.ECONOMY.Storage.get(key);
      return { report, event, stillThere };
    });
    expect(result.report).toBeNull();
    expect(result.event).toEqual({ fresh: true, corrupt: true });
    expect(result.stillThere).toBeFalsy();
  });

  test('load() with no existing save reports fresh and does not throw', async ({ page }) => {
    const report = await page.evaluate(() => {
      const state = new window.ECONOMY.GameState({ saveKey: 'test.never-saved.' + Math.random() });
      return state.load();
    });
    expect(report).toBeNull();
  });

  test('the starter line is never left locked even if a corrupted/edited save claims otherwise', async ({ page }) => {
    const unlocked = await page.evaluate(() => {
      const key = 'test.starter';
      const { PRODUCTS: LIST } = window.PRODUCTS;
      const a = new window.ECONOMY.GameState({ saveKey: key });
      a.save();
      // tamper with the raw save to lock the starter line
      const raw = JSON.parse(window.ECONOMY.Storage.get(key));
      raw.lines[LIST[0].id].u = false;
      window.ECONOMY.Storage.set(key, JSON.stringify(raw));

      const b = new window.ECONOMY.GameState({ saveKey: key });
      b.load();
      return b.lines[LIST[0].id].unlocked;
    });
    expect(unlocked).toBe(true);
  });
});
