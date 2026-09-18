// Drives a real playthrough headlessly: places a production chain, runs the
// simulation fast, and reports whether the economy actually works.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outDir = process.argv[3] ?? '/tmp/claude-0/play';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.game, null, { timeout: 30000 });

// Build a starter village next to the town hall.
const built = await page.evaluate(() => {
  const g = window.game;
  const w = g.world;
  w.treasury = 4000;
  const log = [];

  function placeNear(def, preferNode) {
    for (let r = 3; r < 60; r++) {
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        const x = Math.round(w.startX + Math.cos(ang) * r);
        const y = Math.round(w.startY + Math.sin(ang) * r);
        if (!w.canPlace(def, x, y).ok) continue;
        if (preferNode) {
          let n = 0;
          w.nodeGrid.query(x, y, 12, (node) => {
            if (node.kind === preferNode) n++;
          });
          if (n < 6) continue;
        }
        const b = w.place(def, x, y, 0, true);
        if (b) {
          log.push(def);
          return b;
        }
      }
    }
    return null;
  }

  for (const r of ['r_shelter', 'r_forestry', 'r_agriculture', 'r_milling', 'r_charcoal', 'r_baking', 'r_marketplace', 'r_quarrying', 'r_hunting', 'r_butchery', 'r_cottages']) {
    w.research.completed.add(r);
  }

  placeNear('woodcutter_camp', 'tree');
  placeNear('woodcutter_camp', 'tree');
  placeNear('forester_hut', 'tree');
  placeNear('gatherer_hut', 'berry_bush');
  placeNear('sawmill');
  placeNear('storehouse');
  placeNear('market');
  placeNear('wheat_field');
  placeNear('windmill');
  placeNear('charcoal_burner');
  placeNear('bakery');
  placeNear('hunter_camp', 'tree');
  placeNear('butcher');
  placeNear('quarry', 'stone_rock');
  for (let i = 0; i < 6; i++) placeNear('cottage');
  return log;
});

await page.evaluate(() => window.game.setSpeed(4));

const samples = [];
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(20000);
  const s = await page.evaluate(() => {
    const w = window.game.world;
    const stock = {};
    for (const [k, v] of Object.entries(w.stock)) if (v > 0) stock[k] = Math.round(v);
    return {
      day: w.time.day,
      season: w.time.season,
      pop: w.stats.population,
      employed: w.stats.employed,
      idle: w.stats.idle,
      foodDays: Number(w.stats.foodDays.toFixed(1)),
      happy: Math.round(w.stats.happiness),
      gold: Math.round(w.treasury),
      research: Math.round(w.research.points),
      stock,
      stalls: w.buildingList.filter((b) => b.stall).map((b) => `${b.def}: ${b.stall}`),
      drawCalls: window.game.renderer.renderer.info.render.calls,
      triangles: window.game.renderer.renderer.info.render.triangles,
    };
  });
  samples.push(s);
}

await page.evaluate(() => {
  const w = window.game.world;
  window.game.focusOn(w.startX, w.startY, 34);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/village.png` });
await page.evaluate(() => window.game.focusOn(window.game.world.startX, window.game.world.startY, 60));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/village-wide.png` });

console.log(JSON.stringify({ built, samples, errors: errors.slice(0, 10) }, null, 2));
await browser.close();
