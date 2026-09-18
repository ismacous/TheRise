import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.theRise, null, { timeout: 30000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const g = window.theRise.game, w = g.world;
  // Place a woodcutter camp in the trees and select it.
  for (let r = 5; r < 50; r++) for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    const x = Math.round(w.startX + Math.cos(ang) * r), y = Math.round(w.startY + Math.sin(ang) * r);
    if (!w.canPlace('woodcutter_camp', x, y).ok) continue;
    let n = 0; w.nodeGrid.query(x, y, 14, (c) => { if (c.kind === 'tree' && c.alive) n++; });
    if (n < 25) continue;
    const b = w.place('woodcutter_camp', x, y, 0, true);
    if (b) { g.selectBuilding(b.id); return { placed: true, slots: b.workers.length }; }
  }
  return { placed: false };
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/claude-0/s1/building-panel.png' });
console.log(JSON.stringify({ info, errors: errors.slice(0, 5) }));
await browser.close();
