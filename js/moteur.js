/* =========================================================================
   Bataille Prismatique — moteur de jeu (pur, sans DOM, testable sous Node)

   Le principe qui gouverne toute la géométrie : chaque FACE d'une forme doit
   tomber sur une case identifiable, sinon le joueur ne peut pas déduire où son
   laser repart. D'où des pièces étalées sur plusieurs cases, à l'exception de
   l'étoile qui ne dévie rien et n'a donc aucune face à distinguer.
   ========================================================================= */

/* ───────────────────────── Géométrie de base ───────────────────────── */

/** Déviations d'un miroir selon la diagonale qu'il occupe. */
export const MIROIRS = {
  '\\': { E: 'S', S: 'E', W: 'N', N: 'W' },
  '/':  { E: 'N', N: 'E', W: 'S', S: 'W' }
};

/** Direction opposée : un demi-tour. */
export const OPPOSE = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Vecteur [dLigne, dColonne] de chaque direction. */
export const DIRS = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

/** Côté de sortie associé à la direction de déplacement au moment de sortir. */
export const COTE_SORTIE = { E: 'droite', W: 'gauche', S: 'bas', N: 'haut' };

/** Les quatre coins d'un bloc 2 × 2, qui servent aussi de noms de quart. */
export const COINS = ['NW', 'NE', 'SE', 'SW'];

/** Coin diamétralement opposé, dans un bloc 2 × 2. */
export const COIN_OPPOSE = { NW: 'SE', SE: 'NW', NE: 'SW', SW: 'NE' };

/** Décalage [ligne, colonne] de chaque quart par rapport au coin haut-gauche. */
export const DECALAGE = { NW: [0, 0], NE: [0, 1], SW: [1, 0], SE: [1, 1] };

/** Bords de case adjacents à un coin. */
export const BORDS_DU_COIN = { NW: ['N', 'W'], NE: ['N', 'E'], SE: ['S', 'E'], SW: ['S', 'W'] };

/** Diagonale portée par l'hypoténuse, selon la position de l'angle droit. */
export const HYPOTENUSE = { NW: '/', NE: '\\', SE: '/', SW: '\\' };

/** Description en clair d'une orientation de triangle. */
export const NOM_COIN = {
  NW: 'angle droit en haut à gauche',
  NE: 'angle droit en haut à droite',
  SE: 'angle droit en bas à droite',
  SW: 'angle droit en bas à gauche'
};

/**
 * Déviation dans une case portant un triangle rectangle.
 *
 *   • le laser qui entre par un bord longé par une CATHÈTE fait demi-tour,
 *     exactement comme sur un carré ;
 *   • celui qui entre par l'un des deux autres bords frappe l'HYPOTÉNUSE et
 *     rebondit à 90°.
 *
 * @param {'NW'|'NE'|'SE'|'SW'} coin  position de l'angle droit
 * @param {'N'|'S'|'E'|'W'} dir  direction de déplacement du laser
 */
export function devierTriangle(coin, dir) {
  const bordEntree = OPPOSE[dir];                                   // bord par lequel il entre
  if (BORDS_DU_COIN[coin].includes(bordEntree)) return OPPOSE[dir]; // cathète -> demi-tour
  return MIROIRS[HYPOTENUSE[coin]][dir];                            // hypoténuse -> 90°
}

/** Diagonale portée par chaque quart du losange. */
export const DIAGONALE_LOSANGE = { NW: '/', NE: '\\', SW: '\\', SE: '/' };

/* ───────────────────────── L'étoile et ses trois modes ─────────────────────────
   L'étoile ne dévie jamais le laser : elle n'agit que sur sa couleur. Son mode
   est une RÈGLE DE LA PARTIE, choisie à la configuration et commune aux deux
   joueurs — ce n'est donc pas quelque chose à deviner. Trois modes :

     • simple    — sa teinte s'ajoute au mélange, comme n'importe quelle forme ;
     • dominante — elle efface tout ce que le laser avait accumulé et impose sa
                   teinte ; les formes rencontrées ENSUITE se mélangent
                   normalement ;
     • blanche   — elle blanchit le laser et le verrouille : plus rien ne peut
                   le colorer, quoi qu'il rencontre après.

   Conséquence importante : en mode dominante ou blanche, la couleur n'est plus
   symétrique. Le trajet, lui, reste réversible — tirer depuis la sortie d'un
   tir ramène toujours à son entrée — mais la couleur obtenue peut différer
   selon le sens. C'est une source d'information à part entière.               */
export const MODES_ETOILE = ['simple', 'dominante', 'blanche'];

export const NOM_MODE_ETOILE = {
  simple:    'sa teinte magenta s\'ajoute au mélange',
  dominante: 'efface les teintes précédentes et impose le magenta',
  blanche:   'blanchit le laser et le verrouille définitivement'
};

export const COULEUR_MODE_ETOILE = { simple: 'magenta', dominante: 'magenta', blanche: 'blanc' };

/* ───────────────────────── La navette ─────────────────────────
   Quatre cases en ligne : deux cases pleines au milieu, et une pointe
   triangulaire à chaque bout. Les deux pointes sont coupées sur la MÊME
   diagonale, ce qui donne une pièce en biais, symétrique par demi-tour.

        ╱▏      ▕╲                                   Quatre variantes, une seule
        ██      ██        ╲████        ████╱         famille : la pièce couchée
        ██      ██        ████╱        ╲████         d'un quart de tour, et son
        ▏╱      ╲▕                                   image dans un miroir.
        v/      v\          h\           h/

   Elle se POSE par sa case pleine du bas (debout) ou de gauche (couchée), et
   s'ANNONCE comme toutes les autres : sur sa case la plus basse, et la plus à
   gauche à égalité.                                                           */
export const SENS_NAVETTE = ['v/', 'v\\', 'h/', 'h\\'];

export const NOM_SENS_NAVETTE = {
  'v/':  'debout, pointes coupées en ╱',
  'v\\': 'debout, pointes coupées en ╲',
  'h/':  'couchée, pointes coupées en ╱',
  'h\\': 'couchée, pointes coupées en ╲'
};

/**
 * Pour chaque variante : orientation, et angle droit de chacune des deux
 * pointes, dans l'ordre du haut vers le bas (debout) ou de gauche à droite
 * (couchée). Les deux coins d'une même variante portent toujours la même
 * diagonale — c'est ce qui donne à la pièce son allure penchée.
 */
const FORMES_NAVETTE = {
  'v/':  { vertical: true,  pointes: ['SE', 'NW'] },
  'v\\': { vertical: true,  pointes: ['SW', 'NE'] },
  'h/':  { vertical: false, pointes: ['SE', 'NW'] },
  'h\\': { vertical: false, pointes: ['NE', 'SW'] }
};

/* ───────────────────────── Les formes ─────────────────────────
   Chaque forme est décrite par un GABARIT : la liste des cases qu'elle occupe,
   avec le rôle de chacune vis-à-vis du laser.

     mur      — demi-tour à 180°, quel que soit le bord d'entrée
     miroir   — rebond à 90° sur la diagonale indiquée
     triangle — l'hypoténuse renvoie à 90°, les deux cathètes à 180°
     filtre   — le laser passe tout droit, il est seulement teinté

   Une case du gabarit porte `ref: true` : c'est la CASE DE RÉFÉRENCE, celle
   qu'on clique pour poser la pièce et celle qu'il faut viser pour l'annoncer.
   Elle est toujours choisie sur une partie « pleine » de la forme.            */

/** Les deux cases voisines d'un coin, à l'intérieur d'un bloc 2 × 2. */
const VOISINS_DU_COIN = { NW: ['NE', 'SW'], NE: ['NW', 'SE'], SE: ['NE', 'SW'], SW: ['NW', 'SE'] };

const avecDecalage = (x) => ({ ...x, dr: DECALAGE[x.part][0], dc: DECALAGE[x.part][1] });

/**
 * Triangle : trois cases seulement. La case de l'angle droit est pleine, les
 * deux voisines portent l'hypoténuse — et le quart opposé au coin est HORS du
 * triangle. Il reste donc libre, et une étoile peut très bien venir s'y loger.
 */
function gabaritTriangle(coin) {
  return [
    avecDecalage({ part: coin, role: 'mur', ref: true }),
    ...VOISINS_DU_COIN[coin].map((part) => avecDecalage({ part, role: 'triangle', coin }))
  ];
}

/** Carré et losange : un bloc 2 × 2 plein, référence au coin en bas à gauche. */
function gabaritBloc(role) {
  return COINS.map((part) => avecDecalage({
    part, role,
    diag: role === 'miroir' ? DIAGONALE_LOSANGE[part] : undefined,
    ref: part === 'SW'
  }));
}

/** Navette : deux pointes, deux cases pleines, posée par la pleine basse/gauche. */
function gabaritNavette(sens) {
  const { vertical, pointes } = FORMES_NAVETTE[sens];
  const pos = (i) => (vertical ? { dr: i, dc: 0 } : { dr: 0, dc: i });
  return [
    { part: 'P0', role: 'triangle', coin: pointes[0], ...pos(0) },
    { part: 'P1', role: 'mur', ...pos(1), ref: !vertical },   // couchée : la pleine de gauche
    { part: 'P2', role: 'mur', ...pos(2), ref: vertical },    // debout : la pleine du bas
    { part: 'P3', role: 'triangle', coin: pointes[1], ...pos(3) }
  ];
}

export const FORMES = {
  triangle: {
    nom: 'Triangle', couleur: 'bleu',
    variantes: COINS,
    nomsVariantes: { NW: 'Triangle ◤', NE: 'Triangle ◥', SE: 'Triangle ◢', SW: 'Triangle ◣' },
    detailsVariantes: NOM_COIN,
    gabarit: gabaritTriangle
  },
  carre: {
    nom: 'Carré', couleur: 'rouge', glyphe: '■',
    variantes: null,
    gabarit: () => gabaritBloc('mur')
  },
  losange: {
    nom: 'Losange', couleur: 'jaune', glyphe: '◆',
    variantes: null,
    gabarit: () => gabaritBloc('miroir')
  },
  navette: {
    nom: 'Navette', couleur: 'cyan',
    variantes: SENS_NAVETTE,
    nomsVariantes: {
      'v/': 'Navette ▮╱', 'v\\': 'Navette ▮╲', 'h/': 'Navette ▬╱', 'h\\': 'Navette ▬╲'
    },
    detailsVariantes: NOM_SENS_NAVETTE,
    gabarit: gabaritNavette
  },
  etoile: {
    nom: 'Étoile', couleur: 'magenta', glyphe: '★',
    variantes: null,
    gabarit: () => [{ part: null, role: 'filtre', dr: 0, dc: 0, ref: true }]
  }
};

export const ORDRE_FORMES = ['triangle', 'carre', 'losange', 'navette', 'etoile'];

/** Mode d'étoile appliqué par défaut. */
export const MODE_ETOILE_DEFAUT = 'simple';

/** Déclinaisons d'un type : ses variantes, ou [null] s'il n'en a pas. */
export const variantesDe = (type) => FORMES[type].variantes ?? [null];

/**
 * La case d'ANNONCE d'une pièce : la plus basse, et la plus à gauche à égalité.
 * On la déduit du gabarit plutôt que de la déclarer, pour qu'elle reste juste
 * quelle que soit la forme — y compris quand celle-ci a un creux, comme le
 * triangle dont le coin opposé à l'angle droit ne lui appartient pas.
 */
function marquerCaseDeCall(cases) {
  let visee = cases[0];
  for (const x of cases) {
    if (x.dr > visee.dr || (x.dr === visee.dr && x.dc < visee.dc)) visee = x;
  }
  return cases.map((x) => (x === visee ? { ...x, call: true } : x));
}

/** Gabarit d'une déclinaison : cases occupées, rôles, case de pose et d'annonce.
    Sans variante précisée, on prend la première — toutes ont la même emprise. */
export const gabarit = (type, variante = null) =>
  marquerCaseDeCall(FORMES[type].gabarit(variante ?? variantesDe(type)[0]));

/** Nombre de cases occupées par une forme. */
export const emprise = (type, variante = null) => gabarit(type, variante).length;

/** Encombrement { h, l } du rectangle englobant. */
export function encombrement(type, variante = null) {
  const g = gabarit(type, variante);
  return { h: Math.max(...g.map((x) => x.dr)) + 1, l: Math.max(...g.map((x) => x.dc)) + 1 };
}

/** Décalage [dr, dc] de la case par laquelle on POSE la pièce. */
export function decalageReference(type, variante = null) {
  const ref = gabarit(type, variante).find((x) => x.ref);
  return [ref.dr, ref.dc];
}

/** Décalage [dr, dc] de la case par laquelle on ANNONCE la pièce. */
export function decalageCall(type, variante = null) {
  const visee = gabarit(type, variante).find((x) => x.call);
  return [visee.dr, visee.dc];
}

/** Case à viser pour annoncer la pièce ancrée en (r, c). */
export function caseDeCall(type, variante, r, c) {
  const [dr, dc] = decalageCall(type, variante);
  return { r: r + dr, c: c + dc };
}

/**
 * Couleur d'affichage d'une forme. L'étoile prend celle de son mode, qui est
 * une règle de la partie : les deux joueurs la connaissent.
 */
export function couleurDe(type, modeEtoile = MODE_ETOILE_DEFAUT) {
  return type === 'etoile' ? COULEUR_MODE_ETOILE[modeEtoile] : FORMES[type].couleur;
}

/* ───────────────────────── Couleurs ─────────────────────────
   Cinq teintes de base, donc 32 mélanges possibles. Le nom compte plus que la
   nuance : c'est lui qui est écrit dans le journal, et la table complète est
   consultable en jeu. Certaines nuances sombres se ressemblent forcément — à
   32 couleurs, l'œil ne suffit plus, le nom tranche.                          */

/** Les cinq teintes de base, dans l'ordre de tri des clés de mélange. */
export const BASES = ['bleu', 'cyan', 'jaune', 'magenta', 'rouge'];

export const MELANGES = {
  '':                              'blanc',
  'bleu':                          'bleu',
  'cyan':                          'cyan',
  'jaune':                         'jaune',
  'magenta':                       'magenta',
  'rouge':                         'rouge',
  'bleu,cyan':                     'azur',
  'bleu,jaune':                    'vert',
  'bleu,magenta':                  'indigo',
  'bleu,rouge':                    'violet',
  'cyan,jaune':                    'anis',
  'cyan,magenta':                  'lilas',
  'cyan,rouge':                    'ardoise',
  'jaune,magenta':                 'corail',
  'jaune,rouge':                   'orange',
  'magenta,rouge':                 'bordeaux',
  'bleu,cyan,jaune':               'sapin',
  'bleu,cyan,magenta':             'pervenche',
  'bleu,cyan,rouge':               'acier',
  'bleu,jaune,magenta':            'olive',
  'bleu,jaune,rouge':              'marron',
  'bleu,magenta,rouge':            'prune',
  'cyan,jaune,magenta':            'perle',
  'cyan,jaune,rouge':              'rouille',
  'cyan,magenta,rouge':            'mauve',
  'jaune,magenta,rouge':           'ocre',
  'bleu,cyan,jaune,magenta':       'jade',
  'bleu,cyan,jaune,rouge':         'kaki',
  'bleu,cyan,magenta,rouge':       'schiste',
  'bleu,jaune,magenta,rouge':      'charbon',
  'cyan,jaune,magenta,rouge':      'taupe',
  'bleu,cyan,jaune,magenta,rouge': 'noir'
};

export const CSS_COULEURS = {
  blanc:     '#eef2f9',
  bleu:      '#3b82f6',
  cyan:      '#22d3ee',
  jaune:     '#facc15',
  magenta:   '#ec4899',
  rouge:     '#ef4444',
  azur:      '#0284c7',
  vert:      '#22c55e',
  indigo:    '#4f46e5',
  violet:    '#a855f7',
  anis:      '#a3e635',
  lilas:     '#e9d5ff',
  ardoise:   '#64748b',
  corail:    '#fda4af',
  orange:    '#f97316',
  bordeaux:  '#9f1239',
  sapin:     '#15803d',
  pervenche: '#818cf8',
  acier:     '#1e3a5f',
  olive:     '#4d7c0f',
  marron:    '#7c2d12',
  prune:     '#6b21a8',
  perle:     '#cbd5e1',
  rouille:   '#b45309',
  mauve:     '#d946ef',
  ocre:      '#a16207',
  jade:      '#2dd4bf',
  kaki:      '#3f6212',
  schiste:   '#3f3f46',
  charbon:   '#78350f',
  taupe:     '#a8a29e',
  noir:      '#0b1120'
};

const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Nombre maximum de colonnes nommables (A à Z). */
export const MAX_COLONNES = LETTRES.length;

/** Clé de grille pour une case. */
export const cle = (r, c) => r + ',' + c;

/** Nom lisible d'une case : colonne en lettre, ligne en chiffre (ex. [3,2] -> "C4"). */
export const nomCase = (r, c) => LETTRES[c] + (r + 1);

/** Mélange un ensemble de teintes de base en une couleur nommée. */
export function melanger(ensemble) {
  return MELANGES[[...ensemble].sort().join(',')] ?? 'blanc';
}

/* ───────────────────────── Effet d'une case ───────────────────────── */

/** Nouvelle direction du laser après avoir rencontré une case occupée. */
export function nouvelleDirection(cellule, dir) {
  switch (cellule.role) {
    case 'mur':      return OPPOSE[dir];
    case 'miroir':   return MIROIRS[cellule.diag][dir];
    case 'triangle': return devierTriangle(cellule.coin, dir);
    default:         return dir;                    // 'filtre' : elle traverse
  }
}

/**
 * Applique à l'état de couleur du laser l'effet d'une case occupée.
 * @param {{teintes: Set<string>, verrouille: boolean}} etat  modifié sur place
 * @param {object} cellule
 * @param {'simple'|'dominante'|'blanche'} modeEtoile  règle de la partie
 */
export function appliquerTeinte(etat, cellule, modeEtoile = MODE_ETOILE_DEFAUT) {
  if (etat.verrouille) return;
  if (cellule.type !== 'etoile') { etat.teintes.add(FORMES[cellule.type].couleur); return; }
  switch (modeEtoile) {
    case 'dominante': etat.teintes.clear(); etat.teintes.add('magenta'); break;
    case 'blanche':   etat.teintes.clear(); etat.verrouille = true;      break;
    default:          etat.teintes.add('magenta');                       break;   // 'simple'
  }
}

/* ───────────────────────── Propagation ───────────────────────── */

/** Dimensions d'une grille. */
export const dim = (lignes, colonnes = lignes) => ({ lignes, colonnes });

/** Nombre de bords tirables d'un côté donné. */
export const bordsDuCote = (d, cote) =>
  (cote === 'gauche' || cote === 'droite') ? d.lignes : d.colonnes;

/** Point de départ d'un tir : case fictive hors grille + direction d'entrée. */
export function depart(d, cote, index) {
  switch (cote) {
    case 'gauche': return { pos: [index - 1, -1],         dir: 'E' };
    case 'droite': return { pos: [index - 1, d.colonnes], dir: 'W' };
    case 'haut':   return { pos: [-1, index - 1],         dir: 'S' };
    case 'bas':    return { pos: [d.lignes, index - 1],   dir: 'N' };
    default: throw new Error('Côté inconnu : ' + cote);
  }
}

/**
 * Propage un laser dans la grille.
 * @param {Map<string,object>} grille  case -> morceau de pièce
 * @param {{lignes:number, colonnes:number}} d  dimensions de la grille
 * @param {'gauche'|'droite'|'haut'|'bas'} cote  bord d'entrée
 * @param {number} index   numéro du bord d'entrée, à partir de 1
 * @param {'simple'|'dominante'|'blanche'} modeEtoile  mode d'étoile de la partie
 *
 * Chaque case applique une permutation des directions et le déplacement en
 * découle, donc (case, direction) -> (case, direction) est une bijection :
 * aucun cycle n'est atteignable depuis un bord, et le TRAJET est réversible.
 * Le statut 'piege' est un garde-fou qui ne devrait jamais se déclencher.
 */
export function tirer(grille, d, cote, index, modeEtoile = MODE_ETOILE_DEFAUT) {
  const dep = depart(d, cote, index);
  let [r, c] = dep.pos;
  let dir = dep.dir;
  const etat = { teintes: new Set(), verrouille: false };
  const vus = new Set();
  const etapes = [];

  for (;;) {
    r += DIRS[dir][0];
    c += DIRS[dir][1];

    if (r < 0 || r >= d.lignes || c < 0 || c >= d.colonnes) {
      const coteSortie = COTE_SORTIE[dir];
      const indexSortie = (coteSortie === 'gauche' || coteSortie === 'droite') ? r + 1 : c + 1;
      return {
        statut: 'sorti',
        coteSortie,
        indexSortie,
        retour: coteSortie === cote && indexSortie === index,
        couleur: melanger(etat.teintes),
        etapes
      };
    }

    const signature = r + ',' + c + ',' + dir;
    if (vus.has(signature)) return { statut: 'piege', couleur: null, etapes };
    vus.add(signature);

    const cellule = grille.get(cle(r, c));
    if (cellule) appliquerTeinte(etat, cellule, modeEtoile);
    etapes.push({ r, c, dir, couleur: melanger(etat.teintes) });
    if (cellule) dir = nouvelleDirection(cellule, dir);
  }
}

/* ───────────────────────── Pièces et placement ───────────────────────── */

/** Deux formes sont identiques si même type et, le cas échéant, même variante. */
export function memeForme(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  return FORMES[a.type].variantes ? a.variante === b.variante : true;
}

/** Nom complet d'une forme, variante comprise. */
export function nomForme(f) {
  if (!f) return 'case vide';
  const def = FORMES[f.type];
  return def.variantes ? (def.nomsVariantes[f.variante] ?? def.nom) : def.nom;
}

/** Précision en clair sur la variante. */
export function detailVariante(type, variante) {
  const def = FORMES[type];
  return def.variantes && variante ? def.detailsVariantes[variante] : '';
}

/** Vrai si cette case est celle qu'il faut viser pour annoncer la pièce. */
export const estCaseDeCall = (cellule) => !!cellule.call;

/** Nombre total de pièces d'un inventaire. */
export const totalPieces = (counts) => ORDRE_FORMES.reduce((s, t) => s + (counts[t] || 0), 0);

/** Nombre de cases occupées par un inventaire (pour le type, toutes variantes
    ont la même emprise). */
export const cellulesRequises = (counts) =>
  ORDRE_FORMES.reduce((s, t) => s + (counts[t] || 0) * emprise(t, variantesDe(t)[0]), 0);

/** Cases occupées par une pièce ancrée en (r, c), avec leur rôle. */
export function empriseDe(type, variante, r, c) {
  return gabarit(type, variante).map((g) => ({ ...g, r: r + g.dr, c: c + g.dc }));
}

/** Ancre valide la plus proche : une pièce posée au bord se recale dans la grille. */
export function ancreValide(type, variante, d, r, c) {
  const { h, l } = encombrement(type, variante);
  return [Math.max(0, Math.min(d.lignes - h, r)), Math.max(0, Math.min(d.colonnes - l, c))];
}

/** Ancre correspondant à une case de référence cliquée. */
export function ancreDepuisReference(type, variante, r, c) {
  const [dr, dc] = decalageReference(type, variante);
  return [r - dr, c - dc];
}

/** La pièce tient-elle ici sans déborder ni chevaucher une autre ? */
export function placeLibre(grille, d, type, variante, r, c) {
  return empriseDe(type, variante, r, c).every(
    (u) => u.r >= 0 && u.r < d.lignes && u.c >= 0 && u.c < d.colonnes && !grille.has(cle(u.r, u.c)));
}

/**
 * Pose une pièce. Ses cases partagent le même identifiant, ce qui permet de la
 * retirer ou de la révéler d'un bloc.
 * @returns {boolean} vrai si la pièce a pu être posée
 */
export function poserPiece(grille, d, type, r, c, variante = null) {
  const v = variante ?? variantesDe(type)[0];
  if (!placeLibre(grille, d, type, v, r, c)) return false;
  const id = `${type}@${r},${c}`;
  for (const u of empriseDe(type, v, r, c)) {
    const cellule = { id, type, ancre: [r, c], role: u.role, dr: u.dr, dc: u.dc };
    if (u.part) cellule.part = u.part;
    if (u.coin) cellule.coin = u.coin;
    if (u.diag) cellule.diag = u.diag;
    if (u.ref) cellule.ref = true;
    if (u.call) cellule.call = true;
    if (FORMES[type].variantes) cellule.variante = v;
    grille.set(cle(u.r, u.c), cellule);
  }
  return true;
}

/** Retire la pièce qui occupe une case (toutes ses cases). */
export function retirerPiece(grille, r, c) {
  const cellule = grille.get(cle(r, c));
  if (!cellule) return false;
  for (const [k, v] of [...grille]) if (v.id === cellule.id) grille.delete(k);
  return true;
}

/**
 * Change la variante de la pièce qui occupe une case. La forme changeant de
 * gabarit, on la repose : l'opération échoue si la nouvelle forme ne tient pas.
 * L'ancre est conservée, la case de référence peut donc se déplacer.
 */
export function changerVariante(grille, d, r, c, variante) {
  const cellule = grille.get(cle(r, c));
  if (!cellule || !FORMES[cellule.type].variantes) return null;
  const { type, ancre } = cellule;
  const ancienne = cellule.variante;
  retirerPiece(grille, r, c);
  if (poserPiece(grille, d, type, ancre[0], ancre[1], variante)) return variante;
  poserPiece(grille, d, type, ancre[0], ancre[1], ancienne);   // remise en l'état
  return null;
}

/** Passe à la variante suivante qui tient à cet emplacement. */
export function varianteSuivante(grille, d, r, c) {
  const cellule = grille.get(cle(r, c));
  if (!cellule) return null;
  const liste = FORMES[cellule.type].variantes;
  if (!liste) return null;
  const depart = liste.indexOf(cellule.variante);
  const ancre = [...cellule.ancre];
  for (let i = 1; i <= liste.length; i++) {
    const essai = liste[(depart + i) % liste.length];
    if (changerVariante(grille, d, ancre[0], ancre[1], essai)) return essai;
  }
  return null;
}

/** Clés des cases occupées par la pièce dont on connaît une case. */
export function casesDeLaPiece(grille, r, c) {
  const cellule = grille.get(cle(r, c));
  if (!cellule) return [];
  return [...grille].filter(([, v]) => v.id === cellule.id).map(([k]) => k);
}

/** Nombre de pièces distinctes présentes dans une grille. */
export const compterPieces = (grille) => new Set([...grille.values()].map((v) => v.id)).size;

/** Inventaire réellement posé, par type. */
export function inventairePose(grille) {
  const vus = new Set(), parType = {};
  for (const v of grille.values()) {
    if (vus.has(v.id)) continue;
    vus.add(v.id);
    parType[v.type] = (parType[v.type] || 0) + 1;
  }
  return parType;
}

/** Tire un entier dans [0, n[. */
const alea = (n) => Math.floor(Math.random() * n);

/** Génère un placement aléatoire respectant l'inventaire demandé. */
export function placementAleatoire(d, counts) {
  const grille = new Map();
  const ancres = [];
  for (let r = 0; r < d.lignes; r++) for (let c = 0; c < d.colonnes; c++) ancres.push([r, c]);

  // Les pièces encombrantes d'abord : elles trouvent bien plus difficilement leur place.
  const types = [...ORDRE_FORMES].sort((a, b) => emprise(b) - emprise(a));
  for (const type of types) {
    const liste = variantesDe(type);
    for (let n = 0; n < (counts[type] || 0); n++) {
      for (let i = ancres.length - 1; i > 0; i--) {              // mélange de Fisher-Yates
        const j = alea(i + 1);
        [ancres[i], ancres[j]] = [ancres[j], ancres[i]];
      }
      const variante = liste[alea(liste.length)];
      // On tente la variante tirée, puis les autres : près d'un bord, certaines
      // orientations ne tiennent pas alors que d'autres oui.
      const ordre = [variante, ...liste.filter((v) => v !== variante)];
      ancres.some(([r, c]) => ordre.some((v) => poserPiece(grille, d, type, r, c, v)));
    }
  }
  return grille;
}
