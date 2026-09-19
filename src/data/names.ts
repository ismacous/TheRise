export const MALE_NAMES = [
  'Aymeric', 'Baudouin', 'Colin', 'Denis', 'Eudes', 'Foulques', 'Gauthier', 'Hugues',
  'Isembart', 'Jehan', 'Lambert', 'Mahieu', 'Nivard', 'Ogier', 'Perrin', 'Renaud',
  'Sauvage', 'Thibaut', 'Urbain', 'Vivien', 'Guiscard', 'Amaury', 'Bertrand', 'Clément',
  'Firmin', 'Gérold', 'Herbert', 'Josselin', 'Léotard', 'Marcel', 'Odilon', 'Pierrot',
];

export const FEMALE_NAMES = [
  'Aalis', 'Béatrix', 'Clémence', 'Douce', 'Emeline', 'Flore', 'Gisèle', 'Hersende',
  'Isabeau', 'Jehanne', 'Liénor', 'Mahaut', 'Nicolette', 'Oriane', 'Perrette', 'Roësia',
  'Sibylle', 'Thiphaine', 'Ursule', 'Violaine', 'Ameline', 'Blanche', 'Colette', 'Edith',
  'Fremonde', 'Guillemette', 'Havoise', 'Isore', 'Léonie', 'Marguerite', 'Osanne', 'Peronelle',
];

export const SURNAMES = [
  'le Charron', 'du Gué', 'Bonnefoy', 'Tisserand', 'des Aulnes', 'Chapelain', 'Beaupré',
  'Lefranc', 'Morel', 'Sansterre', 'Poitevin', 'de la Haie', 'Courtebotte', 'Grandmain',
  'Vielleroche', 'Lavigne', 'Fontaine', 'Boisjoli', 'Malherbe', 'Quenouille', 'Rousseau',
  'Ferrand', 'Cherbois', 'Gastebled', 'Pincemaille', 'Blanchemain', 'Tirebois', 'Sourdeval',
];

/** Skin tones, from lightest to deepest. Kept small and stylised on purpose. */
export const SKIN_TONES = ['#f0c8a0', '#e0ac7e', '#c68b5f', '#9c6741', '#7a4a2b', '#5c3520'];

export const HAIR_COLORS = ['#2b1d12', '#4a2c17', '#7a4a20', '#a86c2a', '#c9a55a', '#8a8a8a', '#e0dcd0'];

/**
 * Village names, built from a prefix and a suffix so the list never repeats
 * itself twice in a session without holding a thousand entries.
 */
const VILLAGE_ROOTS = [
  'Aubrac', 'Beaulieu', 'Cherbois', 'Draguel', 'Escaudain', 'Fontenoy', 'Gravelle',
  'Hautrive', 'Irancy', 'Joncheray', 'Kerlouan', 'Lambrac', 'Montclair', 'Noirval',
  'Ormeteau', 'Pontivy', 'Quercy', 'Roquebrune', 'Salvagny', 'Tournemire', 'Ussel',
  'Valmont', 'Wisembac', 'Ygrande',
];

const VILLAGE_SUFFIXES = [
  '', '-sur-Loire', '-le-Vieux', '-en-Vallée', '-les-Bois', '-la-Forge', '-sous-Roche',
  '-aux-Moines', '-le-Haut', '-des-Prés', '-la-Fontaine', '-le-Franc',
];

export function randomVillageName(pick: <T>(list: T[]) => T): string {
  return `${pick(VILLAGE_ROOTS)}${pick(VILLAGE_SUFFIXES)}`;
}
