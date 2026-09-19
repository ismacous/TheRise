// Photographs one or more buildings at ranks I, II and III, side by side.
//
//   node scripts/ranks.mjs http://127.0.0.1:4173/ /tmp/ranks blacksmith,bakery
//
// Each shot flattens a patch of ground, clears it, drops the three ranks along
// the camera's diagonal and zooms in. It is the fastest way to check that a
// building still reads as itself — and that its rank is legible — without an
// Android device.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const url = process.argv[2];
const out = process.argv[3];
const ids = (process.argv[4] ?? 'hunter_camp').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 560 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.theRise, null, { timeout: 30000 });

for (const id of ids) {
  const centre = await page.evaluate((id) => {
    const { game: g, RESEARCH } = window.theRise;
    const w = g.world;
    g.setSpeed(0);
    g.closeSheet();
    w.treasury = 5e6;
    for (const r of Object.keys(RESEARCH)) w.research.completed.add(r);
    document.getElementById('ui-root').style.display = 'none';
    const ox = w.startX - 10;
    const oy = w.startY - 10;
    const flat = w.map.height[w.map.idx(ox, oy)];
    for (let y = oy - 12; y < oy + 20; y++) {
      for (let x = ox - 8; x < ox + 28; x++) {
        if (!w.map.inBounds(x, y)) continue;
        const i = w.map.idx(x, y);
        w.map.terrain[i] = 0;
        w.map.height[i] = flat;
        if (w.map.blocker[i] !== -1) w.killNode(w.map.blocker[i]);
        w.map.occupancy[i] = -1;
      }
    }
    for (const b of [...w.buildingList]) w.removeBuilding(b.id, false);
    w.terrainChanges.push({ x: ox - 8, y: oy - 12, w: 38, h: 34 });
    // The camera looks down the 45-degree diagonal, so stepping (+8, -8)
    // lays the three ranks out left to right on screen.
    for (let lv = 1; lv <= 3; lv++) {
      const b = w.place(id, ox + (lv - 1) * 6, oy + 6 - (lv - 1) * 6, 0, true);
      if (b) b.level = lv;
    }
    w.refreshStockCache();
    return [ox + 6, oy];
  }, id);
  await page.evaluate((c) => {
    const ctl = window.theRise.game.renderer.controls;
    ctl.limits.minDistance = 2;
    ctl.snapTo(c[0], c[1], 11);
    ctl.desiredPitch = 0.55;
    ctl.pitch = 0.55;
  }, centre);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${id}.png` });
}
console.log(JSON.stringify({ errors: errors.slice(0, 4) }));
await browser.close();
