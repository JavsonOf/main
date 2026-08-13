// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Headless test config for ISO FACTORY. Every module attaches its API to
 * `window` (ISO, ECONOMY, PRODUCTS, AUDIO, ENTITIES, GAME, STATE, VIEW, UI),
 * so tests load index.html in a real browser and drive those globals
 * directly with page.evaluate — no build step, no server framework needed.
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'node ' + JSON.stringify(__dirname + '/tests/static-server.js'),
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
