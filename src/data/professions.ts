export type ProfessionId =
  | 'idle'
  | 'builder'
  | 'carrier'
  | 'woodcutter'
  | 'forester'
  | 'gatherer'
  | 'hunter'
  | 'fisher'
  | 'farmer'
  | 'shepherd'
  | 'quarrier'
  | 'miner'
  | 'sawyer'
  | 'mason'
  | 'smelter'
  | 'blacksmith'
  | 'goldsmith'
  | 'butcher'
  | 'baker'
  | 'miller'
  | 'brewer'
  | 'weaver'
  | 'tailor'
  | 'tanner'
  | 'cobbler'
  | 'carpenter'
  | 'fletcher'
  | 'chandler'
  | 'merchant'
  | 'scholar'
  | 'priest'
  | 'innkeeper'
  | 'healer'
  | 'firewarden'
  | 'child';

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  /** Hex tint used for the villager's tunic. */
  tunic: string;
  /** Optional hat / accessory variant index used by the mesh factory. */
  hat: number;
  icon: string;
}

const p = (id: ProfessionId, name: string, tunic: string, hat: number, icon: string): ProfessionDef => ({
  id,
  name,
  tunic,
  hat,
  icon,
});

export const PROFESSIONS: Record<ProfessionId, ProfessionDef> = {
  idle: p('idle', 'Sans emploi', '#9c9384', 0, '🚶'),
  child: p('child', 'Enfant', '#c4b89f', 0, '🧒'),
  builder: p('builder', 'Bâtisseur', '#c9762f', 1, '🔨'),
  carrier: p('carrier', 'Porteur', '#a98a55', 0, '📦'),
  woodcutter: p('woodcutter', 'Bûcheron', '#6d4a2a', 1, '🪓'),
  forester: p('forester', 'Forestier', '#4f7a3c', 2, '🌱'),
  gatherer: p('gatherer', 'Cueilleur', '#7d9a58', 0, '🧺'),
  hunter: p('hunter', 'Chasseur', '#5a5236', 2, '🏹'),
  fisher: p('fisher', 'Pêcheur', '#4b7f94', 3, '🎣'),
  farmer: p('farmer', 'Fermier', '#b09541', 3, '🌾'),
  shepherd: p('shepherd', 'Éleveur', '#8c9a6b', 3, '🐑'),
  quarrier: p('quarrier', 'Carrier', '#7f7f86', 1, '⛏️'),
  miner: p('miner', 'Mineur', '#55565c', 1, '⛏️'),
  sawyer: p('sawyer', 'Scieur', '#a4712f', 0, '🪚'),
  mason: p('mason', 'Maçon', '#8b8377', 1, '🧱'),
  smelter: p('smelter', 'Fondeur', '#8a4b31', 1, '🔥'),
  blacksmith: p('blacksmith', 'Forgeron', '#6b4230', 1, '🔨'),
  goldsmith: p('goldsmith', 'Orfèvre', '#b89330', 4, '💍'),
  butcher: p('butcher', 'Boucher', '#9c3f3f', 0, '🔪'),
  baker: p('baker', 'Boulanger', '#d8c9a3', 4, '🍞'),
  miller: p('miller', 'Meunier', '#cfc3a2', 4, '🌫️'),
  brewer: p('brewer', 'Brasseur', '#b07c34', 0, '🍺'),
  weaver: p('weaver', 'Tisserand', '#8d7fa8', 0, '🧵'),
  tailor: p('tailor', 'Tailleur', '#6f8fae', 4, '👕'),
  tanner: p('tanner', 'Tanneur', '#7c5230', 0, '🟤'),
  cobbler: p('cobbler', 'Cordonnier', '#6b4a2f', 0, '🥾'),
  carpenter: p('carpenter', 'Menuisier', '#b07b46', 1, '🪑'),
  fletcher: p('fletcher', 'Fléchier', '#a8925f', 2, '🏹'),
  chandler: p('chandler', 'Cirier', '#e0cf92', 4, '🕯️'),
  merchant: p('merchant', 'Marchand', '#7a4f8a', 4, '⚖️'),
  scholar: p('scholar', 'Érudit', '#3f5b8c', 5, '📜'),
  priest: p('priest', 'Prêtre', '#e8e4da', 5, '⛪'),
  innkeeper: p('innkeeper', 'Aubergiste', '#a86b3c', 0, '🍻'),
  healer: p('healer', 'Guérisseuse', '#5f8a76', 5, '🌿'),
  firewarden: p('firewarden', 'Guet du feu', '#b5442f', 2, '🚒'),
};
