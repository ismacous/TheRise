import { Game } from './game';
import { createNewGame } from './sim/simulation';
import { deserialize, readSave } from './sim/save';
import { askText, closeDialogs } from './ui/dialog';
import type { WorldGenOptions } from './sim/worldgen';

const DEFAULT_GEN: Partial<WorldGenOptions> = {
  width: 208,
  height: 208,
  forestDensity: 0.62,
  waterAmount: 0.55,
  relief: 0.5,
};

function setBoot(progress: number, status: string): void {
  const fill = document.getElementById('boot-bar-fill');
  const text = document.getElementById('boot-status');
  if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
  if (text) text.textContent = status;
}

function hideBoot(): void {
  const boot = document.getElementById('boot-screen');
  if (!boot) return;
  boot.classList.add('hidden');
  setTimeout(() => boot.remove(), 700);
}

/** Yields to the browser so the boot screen can actually paint between steps. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) throw new Error('Structure HTML manquante');

  setBoot(0.1, 'Recherche d’une sauvegarde…');
  await nextFrame();

  let sim = null;
  let gen: Partial<WorldGenOptions> = { ...DEFAULT_GEN, seed: `vallee-${Date.now()}` };
  try {
    const saved = await readSave();
    if (saved) {
      setBoot(0.3, 'Réveil de votre village…');
      await nextFrame();
      sim = deserialize(saved);
      gen = saved.gen;
    }
  } catch (err) {
    console.warn('Sauvegarde ignorée', err);
  }

  let founding = false;
  if (!sim) {
    setBoot(0.35, 'Façonnage de la vallée…');
    await nextFrame();
    sim = createNewGame(gen);
    founding = true;
  }

  setBoot(0.7, 'Plantation des forêts…');
  await nextFrame();

  const game = new Game(canvas, uiRoot, sim, gen);

  setBoot(0.95, 'Les premiers habitants arrivent…');
  await nextFrame();

  game.start();
  setBoot(1, 'Prêt');
  setTimeout(hideBoot, 260);

  // Exposed for the device console and for the headless test harness: the
  // catalogues and a few constructors, so a session can be driven from script.
  // This must be assigned *before* the founding dialog: the harness waits on
  // `window.theRise`, and awaiting a prompt nobody is there to answer would
  // hang every screenshot and stress run on a fresh valley.
  const debugApi = {
    game,
    BUILDINGS: (await import('./data/buildings')).BUILDINGS,
    RESEARCH: (await import('./data/research')).RESEARCH,
    GOODS: (await import('./data/goods')).GOODS,
    createVillager: (await import('./sim/villagers')).createVillager,
    workerSlots: (await import('./sim/levels')).workerSlots,
    closeDialogs,
  };
  Object.assign(window as unknown as Record<string, unknown>, {
    game,
    theRise: debugApi,
  });

  // A village you named is a village you come back to. Asked once, at the
  // founding, over a game that is already running, with a suggestion filled in
  // so it is one tap to accept and one to decline.
  if (founding) {
    void askText({
      title: 'Fondez votre village',
      label: 'Quel nom lui donnez-vous ?',
      value: game.world.villageName,
      confirm: 'Fonder',
      cancel: 'Garder ce nom',
    }).then((chosen) => {
      if (chosen) game.world.villageName = chosen.value;
      game.world.notify(`${game.world.villageName} est fondé.`, 'flag', 'good');
      game.requestUiRefresh();
    });
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  const status = document.getElementById('boot-status');
  if (status) {
    status.textContent = `Erreur au démarrage : ${err instanceof Error ? err.message : String(err)}`;
    status.style.color = '#e0705c';
  }
});
