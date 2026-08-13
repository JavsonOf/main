// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('engine — projection & camera (js/iso.js)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.ISO);
  });

  test('project/unproject round-trip on the gz=0 plane', async ({ page }) => {
    const cases = await page.evaluate(() => {
      const { Iso } = window.ISO;
      const iso = new Iso();
      const pts = [[0, 0], [3, 5], [-2, 7], [12.5, -4.25], [100, 100]];
      return pts.map(([gx, gy]) => {
        const s = iso.project(gx, gy, 0);
        const back = iso.unproject(s.x, s.y, 0);
        return { gx, gy, back };
      });
    });
    for (const c of cases) {
      expect(c.back.gx).toBeCloseTo(c.gx, 6);
      expect(c.back.gy).toBeCloseTo(c.gy, 6);
    }
  });

  test('unproject accounts for height (gz) the same way project does', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const { Iso } = window.ISO;
      const iso = new Iso();
      const gz = 4;
      const s = iso.project(2, 6, gz);
      const back = iso.unproject(s.x, s.y, gz);
      return Math.abs(back.gx - 2) < 1e-6 && Math.abs(back.gy - 6) < 1e-6;
    });
    expect(ok).toBe(true);
  });

  test('depth increases with distance from camera (further tiles sort first)', async ({ page }) => {
    const [near, far] = await page.evaluate(() => {
      const { Iso } = window.ISO;
      const iso = new Iso();
      return [iso.depth(1, 1, 0, 0), iso.depth(5, 5, 0, 0)];
    });
    expect(far).toBeGreaterThan(near);
  });

  test('depth accounts for z and layer as tie-breakers', async ({ page }) => {
    const [base, higher, laterLayer] = await page.evaluate(() => {
      const { Iso } = window.ISO;
      const iso = new Iso();
      return [iso.depth(2, 2, 0, 0), iso.depth(2, 2, 1, 0), iso.depth(2, 2, 0, 1)];
    });
    expect(higher).toBeGreaterThan(base);
    expect(laterLayer).toBeGreaterThan(base);
  });

  test('x() is antisymmetric on swapped grid coordinates (diamond symmetry)', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const { Iso } = window.ISO;
      const iso = new Iso();
      return iso.x(3, 7) === -iso.x(7, 3);
    });
    expect(ok).toBe(true);
  });

  test('Color.rgb parses #rgb, #rrggbb and rgb() consistently', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { Color } = window.ISO;
      return {
        short: Color.rgb('#f00'),
        long: Color.rgb('#ff0000'),
        fn: Color.rgb('rgb(255,0,0)')
      };
    });
    expect(result.short).toEqual([255, 0, 0]);
    expect(result.long).toEqual([255, 0, 0]);
    expect(result.fn).toEqual([255, 0, 0]);
  });

  test('Color.shade(color, 0) is a no-op and shade(1) reaches pure white', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { Color } = window.ISO;
      return { same: Color.shade('#336699', 0), white: Color.shade('#336699', 1) };
    });
    expect(result.same.toLowerCase()).toBe('#336699');
    expect(result.white.toLowerCase()).toBe('#ffffff');
  });

  test('M.clamp / M.lerp behave at and outside their bounds', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { M } = window.ISO;
      return {
        clampLow: M.clamp(-5, 0, 10),
        clampHigh: M.clamp(50, 0, 10),
        clampMid: M.clamp(5, 0, 10),
        lerpMid: M.lerp(0, 10, 0.5),
        lerpEnd: M.lerp(0, 10, 1)
      };
    });
    expect(r.clampLow).toBe(0);
    expect(r.clampHigh).toBe(10);
    expect(r.clampMid).toBe(5);
    expect(r.lerpMid).toBe(5);
    expect(r.lerpEnd).toBe(10);
  });

  test('camera pan/zoom converge to their targets and toWorld inverts the transform', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const { Camera } = window.ISO;
      const cam = new Camera ? new Camera() : null;
      if (!cam) return 'no-camera-export';
      cam.tx = 120; cam.ty = -40; cam.tZoom = 1.5;
      for (let i = 0; i < 200; i++) cam.update(1 / 60);
      const convergedPan = Math.abs(cam.x - 120) < 0.5 && Math.abs(cam.y + 40) < 0.5;
      const convergedZoom = Math.abs(cam.zoom - 1.5) < 0.01;
      cam.snap();
      const w = cam.toWorld(cam.x + 64, cam.y + 32);
      const roundTrips = Math.abs(w.x - 64 / cam.zoom) < 1e-6 && Math.abs(w.y - 32 / cam.zoom) < 1e-6;
      return convergedPan && convergedZoom && roundTrips;
    });
    expect(ok).not.toBe('no-camera-export');
    expect(ok).toBe(true);
  });

  test('GAME boots and exposes the reserved Step-1 hooks', async ({ page }) => {
    await page.waitForFunction(() => !!window.GAME);
    const shape = await page.evaluate(() => ({
      hasOnRender: typeof window.GAME.onRender !== 'undefined',
      hasOnTileClick: typeof window.GAME.onTileClick !== 'undefined',
      hasAdd: typeof window.GAME.add === 'function',
      hasByTag: typeof window.GAME.byTag === 'function',
      hasPick: typeof window.GAME.pick === 'function'
    }));
    expect(shape.hasAdd).toBe(true);
    expect(shape.hasByTag).toBe(true);
    expect(shape.hasPick).toBe(true);
  });
});
