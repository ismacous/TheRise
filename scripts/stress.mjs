// Stress test: grows a large village, then measures frame time, draw calls and
// simulation cost. Runs against software WebGL, so real hardware is faster.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outDir = process.argv[3] ?? '/tmp/claude-0/stress';
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
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.game, null, { timeout: 30000 });
// A fresh valley opens with the "name your village" prompt. Nobody is here to
// answer it, and it would sit over every capture.
await page.evaluate(() => window.theRise?.closeDialogs?.());

const built = await page.evaluate(() => {
  const { game: g, RESEARCH, createVillager } = window.theRise;
  const w = g.world;
  w.treasury = 500000;
  for (const id of Object.keys(RESEARCH)) w.research.completed.add(id);

  const defs = [
    'cottage', 'house', 'shack', 'storehouse', 'sawmill', 'woodcutter_camp',
    'gatherer_hut', 'forester_hut', 'market', 'bakery', 'windmill', 'wheat_field',
    'carpenter', 'weaver', 'tavern', 'chapel', 'blacksmith', 'brewery',
  ];
  let placed = 0;
  let attempt = 0;
  for (let r = 4; r < 80 && placed < 240; r += 1) {
    for (let a = 0; a < 72 && placed < 240; a++) {
      const ang = (a / 72) * Math.PI * 2;
      const x = Math.round(w.startX + Math.cos(ang) * r);
      const y = Math.round(w.startY + Math.sin(ang) * r);
      const def = defs[attempt++ % defs.length];
      if (!w.canPlace(def, x, y).ok) continue;
      if (w.place(def, x, y, placed % 4, true)) placed++;
    }
  }

  // Populate directly: growing 400 villagers through births would take hours.
  for (let i = 0; i < 400; i++) {
    createVillager(w, w.startX + (Math.random() - 0.5) * 30, w.startY + (Math.random() - 0.5) * 30, 18 + Math.random() * 25);
  }
  return { placed, buildings: w.buildingList.length, population: w.villagers.length };
});

await page.evaluate(() => window.game.setSpeed(4));
await page.waitForTimeout(25000);

const sample = await page.evaluate(async () => {
  const g = window.game;
  const w = g.world;

  // Measure simulation cost alone.
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) g.sim.tick(0.1);
  const simMs = (performance.now() - t0) / 100;

  // Measure frame time over two seconds of real rendering.
  const frames = [];
  await new Promise((resolve) => {
    let last = performance.now();
    let n = 0;
    const step = (now) => {
      frames.push(now - last);
      last = now;
      if (++n < 120) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  frames.sort((a, b) => a - b);
  const median = frames[Math.floor(frames.length / 2)];
  const p95 = frames[Math.floor(frames.length * 0.95)];

  return {
    population: w.stats.population,
    buildings: w.buildingList.length,
    nodes: w.nodes.size,
    haulJobs: w.haulJobs.length,
    simMsPerTick: Number(simMs.toFixed(3)),
    medianFrameMs: Number(median.toFixed(2)),
    p95FrameMs: Number(p95.toFixed(2)),
    fps: Number((1000 / median).toFixed(1)),
    drawCalls: g.renderer.renderer.info.render.calls,
    triangles: g.renderer.renderer.info.render.triangles,
    geometries: g.renderer.renderer.info.memory.geometries,
    textures: g.renderer.renderer.info.memory.textures,
  };
});

await page.evaluate(() => window.game.focusOn(window.game.world.startX, window.game.world.startY, 60));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/big-village.png` });

console.log(JSON.stringify({ built, sample, errors: errors.slice(0, 5) }, null, 2));
await browser.close();
