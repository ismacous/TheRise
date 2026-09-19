// Headless smoke test: boots the built game in Chromium, waits for the world
// to settle, and writes screenshots plus any console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const outDir = process.argv[3] ?? '/tmp/claude-0/shots';
const waitSeconds = Number(process.argv[4] ?? 12);
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
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(waitSeconds * 1000);
// A fresh valley opens with the "name your village" prompt. Nobody is here to
// answer it, and it would sit over every capture.
await page.evaluate(() => window.theRise?.closeDialogs?.());

const stats = await page.evaluate(() => {
  const g = window.game;
  if (!g) return { ready: false };
  const w = g.world;
  return {
    ready: true,
    day: w.time.day,
    population: w.stats.population,
    buildings: w.buildingList.length,
    nodes: w.nodes.size,
    gold: Math.round(w.treasury),
    foodDays: Number(w.stats.foodDays.toFixed(2)),
    happiness: Math.round(w.stats.happiness),
    drawCalls: g.renderer.renderer.info.render.calls,
    triangles: g.renderer.renderer.info.render.triangles,
  };
});

await page.screenshot({ path: `${outDir}/01-world.png` });

// Open the build sheet.
await page.evaluate(() => window.game.openSheet('build'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/02-build.png` });

await page.evaluate(() => window.game.openSheet('research'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/03-research.png` });

await page.evaluate(() => window.game.openSheet('village'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/04-village.png` });

// Trade needs a post and an unlocked route to show anything useful.
await page.evaluate(() => {
  const { game: g } = window.theRise;
  const w = g.world;
  w.research.completed.add('r_marketplace');
  w.research.completed.add('r_trade_post');
  w.modifiers.tradeTier = 2;
  w.treasury = 900;
  w.addToStock('planks', 120);
  w.addToStock('bread', 60);
  w.refreshStockCache();
  for (let r = 4; r < 40; r++) {
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = Math.round(w.startX + Math.cos(ang) * r);
      const y = Math.round(w.startY + Math.sin(ang) * r);
      if (w.canPlace('trade_post', x, y).ok && w.place('trade_post', x, y, 0, true)) return;
    }
  }
});
await page.evaluate(() => window.game.openSheet('trade'));
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/07-trade.png` });

await page.evaluate(() => {
  window.game.closeSheet();
  const w = window.game.world;
  window.game.focusOn(w.startX, w.startY, 16);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/05-close.png` });

// Placement mode, with the ghost and the working radius on screen.
await page.evaluate(() => {
  const g = window.game;
  g.focusOn(g.world.startX, g.world.startY, 34);
  g.beginPlacement('woodcutter_camp');
});
await page.mouse.move(206, 420);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/06-placement.png` });

console.log(JSON.stringify({ stats, errors: errors.slice(0, 25) }, null, 2));
await browser.close();
