// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('shell — UI interactions (js/ui.js)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!window.UI && !!window.STATE);
  });

  test('the PRODUCTS panel is open by default and FACTORY/BOOSTERS start hidden', async ({ page }) => {
    await expect(page.locator('#panel-products')).toBeVisible();
    await expect(page.locator('#panel-factory')).toBeHidden();
    await expect(page.locator('#modal-boosters')).toBeHidden();
  });

  test('clicking the FACTORY tab shows the factory panel and hides products', async ({ page }) => {
    await page.locator('[data-tab="factory"]').click();
    await expect(page.locator('#panel-factory')).toBeVisible();
    await expect(page.locator('#panel-products')).toBeHidden();
  });

  test('clicking the same tab again toggles the sheet closed', async ({ page }) => {
    await page.locator('[data-tab="products"]').click(); // products is already open -> closes it
    await expect(page.locator('#panel-products')).toBeHidden();
  });

  test('clicking the BOOSTERS tab opens the boosters modal with rows populated', async ({ page }) => {
    await page.locator('[data-tab="boosters"]').click();
    const modal = page.locator('#modal-boosters');
    await expect(modal).toBeVisible();
    const rows = page.locator('#ui-booster-rows .brow, #ui-booster-rows [data-id]');
    await expect(rows.first()).toBeAttached();
  });

  test('clicking the modal backdrop (data-close) closes the boosters modal', async ({ page }) => {
    await page.locator('[data-tab="boosters"]').click();
    await expect(page.locator('#modal-boosters')).toBeVisible();
    await page.locator('#modal-boosters [data-close]').click();
    await page.waitForTimeout(250); // closeModal() hides after a 180ms transition
    await expect(page.locator('#modal-boosters')).toBeHidden();
  });

  test('keyboard shortcuts 1/2/3 switch panels and open the boosters modal', async ({ page }) => {
    await page.keyboard.press('2');
    await expect(page.locator('#panel-factory')).toBeVisible();
    await page.keyboard.press('3');
    await expect(page.locator('#modal-boosters')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await expect(page.locator('#modal-boosters')).toBeHidden();
    await page.keyboard.press('1');
    await expect(page.locator('#panel-products')).toBeVisible();
  });

  test('the "m" key toggles mute and updates the icon + aria-pressed', async ({ page }) => {
    const before = await page.locator('#ui-mute').getAttribute('aria-pressed');
    await page.keyboard.press('m');
    const after = await page.locator('#ui-mute').getAttribute('aria-pressed');
    expect(after).not.toBe(before);
    // toggling twice returns to the original state
    await page.keyboard.press('m');
    const restored = await page.locator('#ui-mute').getAttribute('aria-pressed');
    expect(restored).toBe(before);
  });

  test('the "d" key toggles the diagnostics overlay', async ({ page }) => {
    const diag = page.locator('#ui-diag');
    await expect(diag).toBeHidden();
    await page.keyboard.press('d');
    await expect(diag).toBeVisible();
    await page.keyboard.press('d');
    await expect(diag).toBeHidden();
  });

  test('clicking an unlocked product row selects it and switches to the FACTORY panel', async ({ page }) => {
    // the starter line is unlocked by default; its row is clickable
    const firstRow = page.locator('#ui-product-rows .prow').first();
    await firstRow.waitFor();
    await firstRow.click();
    await expect(page.locator('#panel-factory')).toBeVisible();
  });

  test('buying an axis upgrade the player cannot afford surfaces a warning toast, not a thrown error', async ({ page }) => {
    await page.evaluate(() => { window.STATE.cash = 0; }); // guarantee unaffordable
    await page.locator('[data-tab="factory"]').click();
    const buyBtn = page.locator('#ui-axis-rows .abuy').first();
    await buyBtn.waitFor();
    await buyBtn.click();
    await expect(page.locator('#toasts')).toContainText(/cash|upgraded/i);
  });

  test('the header reflects live cash changes made on STATE without a page reload', async ({ page }) => {
    await page.evaluate(() => { window.STATE.cash = 4_200_000; window.STATE.emit('change', {}); });
    // ui.js polls at 10Hz; give it a couple of frames to redraw
    await expect(page.locator('#ui-cash')).toContainText('$4.20M', { timeout: 2000 });
  });
});
