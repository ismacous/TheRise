// Plays a coherent village headlessly and reports whether the economy works:
// does bread get baked, does iron get smelted, does the population grow.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outDir = process.argv[3] ?? '/tmp/claude-0/play';
const minutes = Number(process.argv[4] ?? 5);
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
await page.waitForFunction(() => !!window.theRise, null, { timeout: 30000 });

const built = await page.evaluate(() => {
  const { game: g, RESEARCH, createVillager } = window.theRise;
  const w = g.world;
  w.treasury = 20000;
  for (const id of Object.keys(RESEARCH)) w.research.completed.add(id);

  const place = (def, node, min = 8) => {
    for (let r = 4; r < 70; r++) {
      for (let a = 0; a < 56; a++) {
        const ang = (a / 56) * Math.PI * 2;
        const x = Math.round(w.startX + Math.cos(ang) * r);
        const y = Math.round(w.startY + Math.sin(ang) * r);
        if (!w.canPlace(def, x, y).ok) continue;
        if (node) {
          let n = 0;
          w.nodeGrid.query(x, y, 14, (c) => {
            if (c.kind === node && c.alive) n++;
          });
          if (n < min) continue;
        }
        const b = w.place(def, x, y, 0, true);
        if (b) return def;
      }
    }
    return `FAILED:${def}`;
  };

  const log = [];
  // Wood and food first, then the refining chains that depend on them.
  log.push(place('woodcutter_camp', 'tree', 25));
  log.push(place('woodcutter_camp', 'tree', 20));
  log.push(place('forester_hut', 'tree', 5));
  log.push(place('sawmill'));
  log.push(place('gatherer_hut', 'berry_bush', 3));
  log.push(place('storehouse'));
  log.push(place('market'));
  log.push(place('wheat_field'));
  log.push(place('wheat_field'));
  log.push(place('windmill'));
  log.push(place('charcoal_burner'));
  log.push(place('bakery'));
  log.push(place('hunter_camp', 'wild_animal', 1));
  log.push(place('butcher'));
  log.push(place('quarry', 'stone_rock', 1));
  log.push(place('coal_mine', 'coal_vein', 1));
  log.push(place('iron_mine', 'iron_vein', 1));
  log.push(place('smelter'));
  log.push(place('blacksmith'));
  log.push(place('chicken_coop'));
  log.push(place('sheep_pasture'));
  log.push(place('weaver'));
  log.push(place('tailor'));
  log.push(place('well'));
  log.push(place('chapel'));
  for (let i = 0; i < 14; i++) place('cottage');

  // Seed enough hands that the chains can actually be staffed.
  for (let i = 0; i < 70; i++) {
    createVillager(w, w.startX + (Math.random() - 0.5) * 16, w.startY + (Math.random() - 0.5) * 16, 18 + Math.random() * 20);
  }
  return log.filter((l) => l.startsWith('FAILED'));
});

await page.evaluate(() => window.game.setSpeed(4));

const samples = [];
for (let i = 0; i < minutes; i++) {
  await page.waitForTimeout(60000);
  samples.push(
    await page.evaluate(() => {
      const w = window.game.world;
      const stock = {};
      for (const [k, v] of Object.entries(w.stock)) if (v > 0.5) stock[k] = Math.round(v);
      const stalls = {};
      for (const b of w.buildingList) if (b.stall) stalls[`${b.def}`] = b.stall;
      return {
        day: w.time.day,
        season: w.time.season,
        pop: w.stats.population,
        idle: w.stats.idle,
        foodDays: Number(w.stats.foodDays.toFixed(1)),
        happy: Math.round(w.stats.happiness),
        gold: Math.round(w.treasury),
        tier: w.stats.tier,
        objectives: w.completedObjectives.size,
        stock,
        stalls,
      };
    }),
  );
}

await page.evaluate(() => {
  const w = window.game.world;
  window.game.closeSheet();
  window.game.focusOn(w.startX, w.startY, 40);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/village.png` });

console.log(JSON.stringify({ built, samples, errors: errors.slice(0, 6) }, null, 2));
await browser.close();
