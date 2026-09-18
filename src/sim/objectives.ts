import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { World } from './world';

export interface Objective {
  id: string;
  title: string;
  hint: string;
  icon: string;
  reward: { research?: number; gold?: number };
  /** Current progress as [done, target]; used for the bar. */
  progress: (w: World) => [number, number];
}

const countBuildings = (w: World, def: BuildingId, states = ['active']): number =>
  w.buildingList.filter((b) => b.def === def && states.includes(b.state)).length;

const anyOf = (w: World, defs: BuildingId[]): number =>
  defs.reduce((n, d) => n + countBuildings(w, d), 0);

const stock = (w: World, good: GoodId): number => w.stockOf(good);

const obj = (
  id: string,
  icon: string,
  title: string,
  hint: string,
  reward: Objective['reward'],
  progress: Objective['progress'],
): Objective => ({ id, icon, title, hint, reward, progress });

/**
 * The guided path through the first hours. Objectives are checked in order and
 * three are shown at a time, so the player always has something to aim at
 * without being handed a checklist the length of an arm.
 */
export const OBJECTIVES: Objective[] = [
  obj(
    'wood',
    '🪓',
    'Ouvrir un camp de bûcherons',
    "Placez-le au milieu des arbres : le rayon de coupe compte plus que la distance au village.",
    { research: 5 },
    (w) => [anyOf(w, ['woodcutter_camp', 'lumber_camp']), 1],
  ),
  obj(
    'sawmill',
    '🪚',
    'Construire une scierie',
    'Les rondins ne servent à rien tels quels. Les planches, si.',
    { research: 6, gold: 20 },
    (w) => [anyOf(w, ['sawmill', 'water_sawmill']), 1],
  ),
  obj(
    'food',
    '🧺',
    'Nourrir le village',
    'Une hutte de cueilleur près des buissons à baies suffit pour commencer.',
    { research: 6 },
    (w) => [anyOf(w, ['gatherer_hut', 'fisher_hut', 'hunter_camp', 'wheat_field']), 1],
  ),
  obj(
    'houses',
    '🛖',
    'Loger tout le monde',
    'Un villageois sans lit est un villageois malheureux — et qui ne fondera pas de famille.',
    { research: 8, gold: 30 },
    (w) => [Math.min(w.stats.housingCapacity, w.stats.population + 4), w.stats.population + 4],
  ),
  obj(
    'research',
    '📜',
    'Lancer votre première recherche',
    "Les points tombent tout seuls. Ouvrez « Savoir » et dépensez-les : rien ne se débloque sans ça.",
    { gold: 40 },
    (w) => [w.research.completed.size, 1],
  ),
  obj(
    'forester',
    '🌱',
    'Planter une hutte de forestier',
    'Sans replantation, vos bûcherons finiront par annoncer « aucune ressource à portée ».',
    { research: 12 },
    (w) => [countBuildings(w, 'forester_hut'), 1],
  ),
  obj(
    'market',
    '🏪',
    'Ouvrir un marché',
    'Les foyers viennent y chercher vivres et confort. Sans marché, le bonheur plafonne.',
    { research: 15, gold: 50 },
    (w) => [anyOf(w, ['market', 'grand_market']), 1],
  ),
  obj(
    'pop20',
    '👥',
    'Atteindre 20 habitants',
    'Plus de bras, plus de métiers possibles.',
    { research: 20, gold: 60 },
    (w) => [w.stats.population, 20],
  ),
  obj(
    'stone',
    '🪨',
    'Exploiter la pierre',
    "Cherchez un affleurement rocheux : la carrière se bâtit directement dessus.",
    { research: 18 },
    (w) => [anyOf(w, ['quarry', 'great_quarry']), 1],
  ),
  obj(
    'bread',
    '🍞',
    'Faire cuire du pain',
    'Champ → moulin → boulangerie. Trois bâtiments, et la famine appartient au passé.',
    { research: 30, gold: 80 },
    (w) => [Math.min(stock(w, 'bread'), 20), 20],
  ),
  obj(
    'trade',
    '⚖️',
    'Ouvrir une route commerciale',
    'Le comptoir de commerce transforme vos surplus en or.',
    { research: 25, gold: 60 },
    (w) => [countBuildings(w, 'trade_post'), 1],
  ),
  obj(
    'clothes',
    '👕',
    'Habiller vos villageois',
    'Élevage → laine → tissu → vêtements. La première vraie chaîne de confort.',
    { research: 35, gold: 100 },
    (w) => [Math.min(stock(w, 'clothes'), 10), 10],
  ),
  obj(
    'iron',
    '⚒️',
    'Couler un lingot de fer',
    'Mine de fer et fonderie. Le fer ouvre les outils, la mer et les grands bâtiments.',
    { research: 45, gold: 120 },
    (w) => [Math.min(stock(w, 'iron_ingot'), 10), 10],
  ),
  obj(
    'pop60',
    '🏘️',
    'Devenir un gros bourg',
    '60 habitants, 50 % de bonheur et deux services.',
    { research: 60, gold: 200 },
    (w) => [w.stats.population, 60],
  ),
  obj(
    'tools',
    '🔨',
    'Forger des outils',
    'Les outils accélèrent tous vos récolteurs. Ils se remboursent en quelques jours.',
    { research: 50, gold: 150 },
    (w) => [Math.min(stock(w, 'tools'), 15), 15],
  ),
  obj(
    'jewel',
    '💍',
    "Vendre de l'orfèvrerie",
    "Or, fonderie, atelier d'orfèvre. L'objet le plus cher du jeu.",
    { research: 90, gold: 400 },
    (w) => [Math.min(stock(w, 'jewellery'), 3), 3],
  ),
  obj(
    'city',
    '🏰',
    'Fonder une cité',
    '220 habitants, 60 % de bonheur, cinq services. Le sommet de la vallée.',
    { research: 150, gold: 800 },
    (w) => [w.stats.tier, 5],
  ),
];

export const OBJECTIVE_BY_ID = new Map(OBJECTIVES.map((o) => [o.id, o]));

/** The next three unfinished objectives, in order. */
export function activeObjectives(w: World): Objective[] {
  return OBJECTIVES.filter((o) => !w.completedObjectives.has(o.id)).slice(0, 3);
}

export function updateObjectives(w: World): void {
  for (const o of activeObjectives(w)) {
    const [done, target] = o.progress(w);
    if (done < target) continue;
    w.completedObjectives.add(o.id);
    if (o.reward.research) w.research.points += o.reward.research;
    if (o.reward.gold) w.treasury += o.reward.gold;
    const reward = [
      o.reward.research ? `${o.reward.research} points` : null,
      o.reward.gold ? `${o.reward.gold} pièces` : null,
    ]
      .filter(Boolean)
      .join(' et ');
    w.notify(`Objectif atteint : ${o.title}${reward ? ` (+${reward})` : ''}`, '🏅', 'good');
  }
}

/** Human-readable name for the building an objective points at, if any. */
export function objectiveBuildingHint(o: Objective): string | null {
  const map: Record<string, BuildingId> = {
    wood: 'woodcutter_camp',
    sawmill: 'sawmill',
    food: 'gatherer_hut',
    forester: 'forester_hut',
    market: 'market',
    stone: 'quarry',
    trade: 'trade_post',
  };
  const id = map[o.id];
  return id ? BUILDINGS[id].name : null;
}
