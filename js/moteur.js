/* =========================================================================
   Lasers & Formes — moteur de jeu (pur, sans DOM, testable sous Node)

   Toutes les pièces occupent un bloc de 2 × 2 cases. C'est ce qui rend le jeu
   déchiffrable : chaque FACE d'une forme tombe sur une case bien identifiée,
   donc le joueur sait toujours quelle face son laser a touchée, et peut en
   déduire où il repart.
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

/** Coin diamétralement opposé. */
export const COIN_OPPOSE = { NW: 'SE', SE: 'NW', NE: 'SW', SW: 'NE' };

/** Décalage [ligne, colonne] de chaque quart par rapport à l'ancre (coin haut-gauche). */
export const DECALAGE = { NW: [0, 0], NE: [0, 1], SW: [1, 0], SE: [1, 1] };

/** Bords de case adjacents à un coin. */
export const BORDS_DU_COIN = { NW: ['N', 'W'], NE: ['N', 'E'], SE: ['S', 'E'], SW: ['S', 'W'] };

/* ───────────────────────── Le triangle ─────────────────────────
   Un triangle rectangle inscrit dans le bloc. Son orientation est donnée par le
   coin où se trouve l'ANGLE DROIT. Ses trois faces agissent, mais pas de la
   même manière :

     • l'HYPOTÉNUSE renvoie le laser à 90° (c'est un miroir) ;
     • les deux CATHÈTES le renvoient à 180°, exactement comme un carré.

   Étalé sur 2 × 2, le bloc se décompose ainsi (ici angle droit en NW) :

        ┌─────┬─────┐    NW  le coin plein : deux cathètes, demi-tour partout
        │█████│██╲  │    NE  une cathète au nord, l'hypoténuse en diagonale
        ├─────┼─────┤    SW  une cathète à l'ouest, l'hypoténuse en diagonale
        │██╲  │     │    SE  hors du triangle : le laser passe sans être teinté
        └─────┴─────┘                                                          */

/** Diagonale portée par l'hypoténuse, selon la position de l'angle droit. */
export const HYPOTENUSE = { NW: '/', NE: '\\', SE: '/', SW: '\\' };

/** Description en clair d'une orientation. */
export const NOM_COIN = {
  NW: 'angle droit en haut à gauche',
  NE: 'angle droit en haut à droite',
  SE: 'angle droit en bas à droite',
  SW: 'angle droit en bas à gauche'
};

/**
 * Déviation dans un quart de triangle portant l'hypoténuse.
 * @param {'NW'|'NE'|'SE'|'SW'} coin  position de l'angle droit du bloc
 * @param {'N'|'S'|'E'|'W'} dir  direction de déplacement du laser
 */
export function devierTriangle(coin, dir) {
  const bordEntree = OPPOSE[dir];                                   // bord par lequel le laser entre
  if (BORDS_DU_COIN[coin].includes(bordEntree)) return OPPOSE[dir]; // cathète -> demi-tour
  return MIROIRS[HYPOTENUSE[coin]][dir];                            // hypoténuse -> 90°
}

/* ───────────────────────── Le losange ─────────────────────────
   Inscrit dans le bloc, ses sommets tombent au milieu des bords : chacune de
   ses quatre faces occupe exactement un quart, sur la diagonale de celui-ci.
   Le laser rebondit toujours à 90° et n'entre jamais dans le corps.

        ┌─────┬─────┐
        │  ╱  │  ╲  │
        ├─────┼─────┤
        │  ╲  │  ╱  │
        └─────┴─────┘                                                          */
export const DIAGONALE_LOSANGE = { NW: '/', NE: '\\', SW: '\\', SE: '/' };

/* ───────────────────────── Les formes ───────────────────────── */

/**
 * Les quatre formes du jeu.
 *  - triangle : bloc 2 × 2. Hypoténuse à 90°, cathètes à 180°. Quatre orientations. Bleu.
 *  - carre    : bloc 2 × 2. Demi-tour à 180° sur ses quatre faces. Rouge.
 *  - losange  : bloc 2 × 2. Rebond à 90° sur la face touchée. Jaune.
 *  - etoile   : une seule case. Elle ne dévie rien, donc aucune face à
 *               identifier : elle teinte le laser, et c'est tout. Magenta.
 */
export const FORMES = {
  triangle: { nom: 'Triangle', couleur: 'bleu',    orientable: true, bloc: true,
              glyphes: { NW: '◤', NE: '◥', SE: '◢', SW: '◣' } },
  carre:    { nom: 'Carré',    couleur: 'rouge',   orientable: false, bloc: true,  glyphe: '■' },
  losange:  { nom: 'Losange',  couleur: 'jaune',   orientable: false, bloc: true,  glyphe: '◆' },
  etoile:   { nom: 'Étoile',   couleur: 'magenta', orientable: false, bloc: false, glyphe: '★' }
};

export const ORDRE_FORMES = ['triangle', 'carre', 'losange', 'etoile'];

/** Côté, en cases, d'une pièce en bloc. */
export const COTE_BLOC = 2;

/* ───────────────────────── Couleurs ───────────────────────── */

/** Les quatre teintes de base, dans l'ordre de tri utilisé par les clés de mélange. */
export const BASES = ['bleu', 'jaune', 'magenta', 'rouge'];

/** Table des 16 mélanges possibles (clé = teintes triées, séparées par des virgules). */
export const MELANGES = {
  '':                         'blanc',
  'bleu':                     'bleu',
  'jaune':                    'jaune',
  'magenta':                  'magenta',
  'rouge':                    'rouge',
  'bleu,jaune':               'vert',
  'bleu,magenta':             'turquoise',
  'bleu,rouge':               'violet',
  'jaune,magenta':            'corail',
  'jaune,rouge':              'orange',
  'magenta,rouge':            'bordeaux',
  'bleu,jaune,magenta':       'olive',
  'bleu,jaune,rouge':         'marron',
  'bleu,magenta,rouge':       'prune',
  'jaune,magenta,rouge':      'ocre',
  'bleu,jaune,magenta,rouge': 'noir'
};

/** Rendu CSS de chaque couleur résultante. */
export const CSS_COULEURS = {
  blanc:     '#e9eef8',
  bleu:      '#3b82f6',
  jaune:     '#facc15',
  magenta:   '#ec4899',
  rouge:     '#ef4444',
  vert:      '#22c55e',
  turquoise: '#06b6d4',
  violet:    '#8b5cf6',
  corail:    '#fda4af',
  orange:    '#f97316',
  bordeaux:  '#881337',
  olive:     '#3f6212',
  marron:    '#7c2d12',
  prune:     '#4c1d95',
  ocre:      '#a16207',
  noir:      '#0b1120'
};

const LETTRES = 'ABCDEFGHIJKLMNOP';

/** Clé de grille pour une case. */
export const cle = (r, c) => r + ',' + c;

/** Nom lisible d'une case : colonne en lettre, ligne en chiffre (ex. [3,2] -> "C4"). */
export const nomCase = (r, c) => LETTRES[c] + (r + 1);

/** Mélange un ensemble de teintes de base en une couleur nommée. */
export function melanger(ensemble) {
  return MELANGES[[...ensemble].sort().join(',')] ?? 'blanc';
}

/* ───────────────────────── Effet d'une case ───────────────────────── */

/**
 * Vrai si la case est dans l'emprise d'une pièce mais hors de la forme
 * elle-même : le quart opposé à l'angle droit d'un triangle. Le laser la
 * traverse sans être dévié ni teinté.
 */
export const caseInerte = (cellule) =>
  cellule.type === 'triangle' && cellule.part === COIN_OPPOSE[cellule.orientation];

/** Nouvelle direction du laser après avoir rencontré une case occupée. */
export function nouvelleDirection(cellule, dir) {
  if (caseInerte(cellule)) return dir;
  switch (cellule.type) {
    case 'carre':   return OPPOSE[dir];                                        // mur sur les 4 faces
    case 'etoile':  return dir;                                                // traverse tout droit
    case 'losange': return MIROIRS[DIAGONALE_LOSANGE[cellule.part]][dir];      // rebond 90°
    case 'triangle':
      if (cellule.part === cellule.orientation) return OPPOSE[dir];            // coin plein : deux cathètes
      return devierTriangle(cellule.orientation, dir);
    default: return dir;
  }
}

/* ───────────────────────── Propagation ───────────────────────── */

/** Point de départ d'un tir : case fictive hors grille + direction d'entrée. */
export function depart(taille, cote, index) {
  switch (cote) {
    case 'gauche': return { pos: [index - 1, -1],     dir: 'E' };
    case 'droite': return { pos: [index - 1, taille], dir: 'W' };
    case 'haut':   return { pos: [-1, index - 1],     dir: 'S' };
    case 'bas':    return { pos: [taille, index - 1], dir: 'N' };
    default: throw new Error('Côté inconnu : ' + cote);
  }
}

/**
 * Propage un laser dans la grille.
 * @param {Map<string,object>} grille  case -> quart de pièce
 * @param {number} taille  côté de la grille
 * @param {'gauche'|'droite'|'haut'|'bas'} cote  bord d'entrée
 * @param {number} index   numéro du bord d'entrée, de 1 à `taille`
 * @returns {{statut:'sorti'|'piege', coteSortie?:string, indexSortie?:number,
 *            retour?:boolean, couleur:string|null, etapes:Array}}
 *
 * Note : chaque case applique une permutation des directions et le déplacement
 * en découle, donc (case, direction) -> (case, direction) est une bijection.
 * Aucun cycle n'est atteignable depuis un bord : le statut 'piege' est un
 * garde-fou qui ne devrait jamais se déclencher (vérifié par fuzzing dans
 * tests/moteur.test.mjs).
 */
export function tirer(grille, taille, cote, index) {
  const d = depart(taille, cote, index);
  let [r, c] = d.pos;
  let dir = d.dir;
  const teintes = new Set();
  const vus = new Set();
  const etapes = [];

  for (;;) {
    r += DIRS[dir][0];
    c += DIRS[dir][1];

    if (r < 0 || r >= taille || c < 0 || c >= taille) {
      const coteSortie = COTE_SORTIE[dir];
      const indexSortie = (coteSortie === 'gauche' || coteSortie === 'droite') ? r + 1 : c + 1;
      return {
        statut: 'sorti',
        coteSortie,
        indexSortie,
        retour: coteSortie === cote && indexSortie === index,
        couleur: melanger(teintes),
        etapes
      };
    }

    const signature = r + ',' + c + ',' + dir;
    if (vus.has(signature)) return { statut: 'piege', couleur: null, etapes };
    vus.add(signature);

    const cellule = grille.get(cle(r, c));
    const agit = cellule && !caseInerte(cellule);
    if (agit) teintes.add(FORMES[cellule.type].couleur);
    etapes.push({ r, c, dir, couleur: melanger(teintes) });
    if (agit) dir = nouvelleDirection(cellule, dir);
  }
}

/* ───────────────────────── Pièces et placement ───────────────────────── */

/** Deux formes sont identiques si même type et, pour un triangle, même orientation. */
export function memeForme(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (FORMES[a.type].orientable) return a.orientation === b.orientation;
  return true;
}

/** Nom complet d'une forme, orientation comprise. */
export function nomForme(f) {
  if (!f) return 'case vide';
  const def = FORMES[f.type];
  return def.orientable ? `${def.nom} ${def.glyphes[f.orientation]}` : def.nom;
}

/** Côté occupé par une forme : 2 pour les blocs, 1 pour l'étoile. */
export const coteDe = (type) => (FORMES[type].bloc ? COTE_BLOC : 1);

/** Nombre de cases occupées par une forme. */
export const emprise = (type) => coteDe(type) ** 2;

/** Nombre total de pièces d'un inventaire. */
export const totalPieces = (counts) => ORDRE_FORMES.reduce((s, t) => s + (counts[t] || 0), 0);

/** Nombre total de cases occupées par un inventaire. */
export const cellulesRequises = (counts) =>
  ORDRE_FORMES.reduce((s, t) => s + (counts[t] || 0) * emprise(t), 0);

/** Cases occupées par une pièce ancrée en (r, c), avec le quart correspondant. */
export function empriseDe(type, r, c) {
  if (!FORMES[type].bloc) return [{ r, c, part: null }];
  return COINS.map((part) => {
    const [dr, dc] = DECALAGE[part];
    return { r: r + dr, c: c + dc, part };
  });
}

/** Ancre valide la plus proche : une pièce posée au bord se recale dans la grille. */
export function ancreValide(type, taille, r, c) {
  const max = taille - coteDe(type);
  return [Math.max(0, Math.min(max, r)), Math.max(0, Math.min(max, c))];
}

/** La pièce tient-elle ici sans déborder ni chevaucher une autre ? */
export function placeLibre(grille, taille, type, r, c) {
  return empriseDe(type, r, c).every(
    (u) => u.r >= 0 && u.r < taille && u.c >= 0 && u.c < taille && !grille.has(cle(u.r, u.c)));
}

/**
 * Pose une pièce. Ses quatre cases partagent le même identifiant, ce qui permet
 * de la retirer ou de la révéler d'un bloc.
 * @returns {boolean} vrai si la pièce a pu être posée
 */
export function poserPiece(grille, taille, type, r, c, orientation = null) {
  if (!placeLibre(grille, taille, type, r, c)) return false;
  const id = `${type}@${r},${c}`;
  for (const u of empriseDe(type, r, c)) {
    const cellule = { id, type, ancre: [r, c] };
    if (u.part) cellule.part = u.part;
    if (FORMES[type].orientable) cellule.orientation = orientation ?? COINS[0];
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

/** Change l'orientation du triangle qui occupe une case (ses quatre quarts). */
export function orienterTriangle(grille, r, c, coin) {
  const cellule = grille.get(cle(r, c));
  if (!cellule || cellule.type !== 'triangle') return null;
  for (const v of grille.values()) if (v.id === cellule.id) v.orientation = coin;
  return coin;
}

/** Fait pivoter d'un quart de tour le triangle qui occupe une case. */
export function pivoterTriangle(grille, r, c) {
  const cellule = grille.get(cle(r, c));
  if (!cellule || cellule.type !== 'triangle') return null;
  return orienterTriangle(grille, r, c, COINS[(COINS.indexOf(cellule.orientation) + 1) % COINS.length]);
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
export function placementAleatoire(taille, counts) {
  const grille = new Map();
  const ancres = [];
  for (let r = 0; r < taille; r++) for (let c = 0; c < taille; c++) ancres.push([r, c]);

  // Les blocs d'abord : ils trouvent bien plus difficilement leur place que l'étoile.
  const types = [...ORDRE_FORMES].sort((a, b) => emprise(b) - emprise(a));
  for (const type of types) {
    for (let n = 0; n < (counts[type] || 0); n++) {
      for (let i = ancres.length - 1; i > 0; i--) {              // mélange de Fisher-Yates
        const j = alea(i + 1);
        [ancres[i], ancres[j]] = [ancres[j], ancres[i]];
      }
      const orientation = FORMES[type].orientable ? COINS[alea(COINS.length)] : null;
      ancres.some(([r, c]) => poserPiece(grille, taille, type, r, c, orientation));
    }
  }
  return grille;
}
