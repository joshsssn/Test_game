/* =========================================================================
   Lasers & Formes — interface et déroulé de la partie (2 joueurs, 1 appareil)
   ========================================================================= */
import * as M from './moteur.js';
import * as IA from './ia.js';

/* ───────────────────────── Utilitaires ───────────────────────── */
const $  = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

/** Échappe le texte destiné à innerHTML (les pseudos sont saisis par le joueur). */
const ech = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pluriel = (n, mot, pl = mot + 's') => `${n} ${n > 1 ? pl : mot}`;

/** Libellé court d'une déclinaison de forme. */
const libelleVariante = (type, variante) => M.nomForme({ type, variante });

/** Libellé long, pour les lecteurs d'écran et les info-bulles. */
function libelleLong(type, variante) {
  const detail = M.detailVariante(type, variante);
  return detail ? `${M.FORMES[type].nom}, ${detail}` : M.FORMES[type].nom;
}

/** Couleur de texte lisible au-dessus d'un fond donné. */
function texteSur(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#04121f' : '#e6edf9';
}

/* ─────────────────────── Rendu vectoriel des formes ───────────────────────
   Une pièce est dessinée dans un repère où chaque case vaut 100 × 100, à partir
   de son gabarit : on ne redessine donc jamais une forme « à la main », le
   dessin découle des règles. Sur le plateau, chaque case n'affiche que sa
   propre fenêtre de 100 × 100 ; dans les palettes on montre la pièce entière.

   Le trait porte l'information de jeu :
     • face BRILLANTE (trait plein avec un liseré clair) -> rebond à 90° ;
     • face en POINTILLÉS                                 -> demi-tour à 180°.  */

const U = 100;                                   // côté d'une case, en unités SVG
const MARGE = 9;                                 // retrait du tracé dans sa case

/** Étoile à cinq branches, dans une case de 100 × 100. */
const ETOILE_POINTS = [
  [50, 6], [60.6, 35.4], [91.8, 36.4], [67.1, 55.6], [75.9, 85.6],
  [50, 68], [24.1, 85.6], [32.9, 55.6], [8.2, 36.4], [39.4, 35.4]
];

/** Les quatre coins d'une case, en coordonnées absolues. */
const coinsDeLaCase = (x, y) => ({
  NW: [x, y], NE: [x + U, y], SE: [x + U, y + U], SW: [x, y + U]
});

/** Coins voisins d'un coin (ceux avec lesquels il partage un bord de case). */
const COINS_VOISINS = { NW: ['NE', 'SW'], NE: ['NW', 'SE'], SE: ['NE', 'SW'], SW: ['NW', 'SE'] };

/** Segment d'un bord de case. */
function bordDeLaCase(x, y, bord) {
  const c = coinsDeLaCase(x, y);
  return { N: [c.NW, c.NE], S: [c.SW, c.SE], W: [c.NW, c.SW], E: [c.NE, c.SE] }[bord];
}

/** Demi-case contenant un coin donné : ses trois sommets, et sa diagonale. */
function demiCase(coin, x, y) {
  const c = coinsDeLaCase(x, y);
  const [a, b] = COINS_VOISINS[coin];
  return { sommets: [c[coin], c[a], c[b]], diagonale: [c[a], c[b]] };
}

const pts = (liste) => liste.map((p) => p.join(',')).join(' ');
const VOISIN = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

/**
 * SVG d'une pièce, ou de la seule case affichée dans une cellule du plateau.
 * @param {string} type  clé de M.FORMES
 * @param {string|null} variante
 * @param {number|null} dr,dc  case à cadrer ; null = la pièce entière
 */
function svgForme(type, variante = null, dr = null, dc = null) {
  const cases = M.gabarit(type, variante);
  const occupees = new Set(cases.map((x) => `${x.dr},${x.dc}`));
  const c = M.CSS_COULEURS[M.couleurDe(type, modeEtoileCourant())];

  const corps = [];
  for (const cellule of cases) {
    const x = cellule.dc * U, y = cellule.dr * U;

    if (cellule.role === 'filtre') {
      corps.push(`<polygon points="${pts(ETOILE_POINTS.map(([px, py]) => [x + px, y + py]))}"
        fill="${c}" fill-opacity=".45" stroke="${c}" stroke-width="9" stroke-linejoin="round"/>`);
      continue;
    }

    // Matière de la case, et faces qui la bordent.
    let murs = [];
    if (cellule.role === 'mur') {
      corps.push(`<rect x="${x}" y="${y}" width="${U}" height="${U}" fill="${c}" fill-opacity=".3"/>`);
      murs = ['N', 'S', 'E', 'W'];
    } else if (cellule.role === 'triangle') {
      const d = demiCase(cellule.coin, x, y);
      corps.push(`<polygon points="${pts(d.sommets)}" fill="${c}" fill-opacity=".3"/>`);
      corps.push(miroir(d.diagonale, c));
      murs = M.BORDS_DU_COIN[cellule.coin];
    } else if (cellule.role === 'miroir') {
      // Quart de losange : la matière est du côté du centre du bloc.
      const d = demiCase(M.COIN_OPPOSE[cellule.part], x, y);
      corps.push(`<polygon points="${pts(d.sommets)}" fill="${c}" fill-opacity=".3"/>`);
      corps.push(miroir(d.diagonale, c));
    }

    // Un bord n'est dessiné que s'il donne sur l'extérieur : les jointures
    // entre deux cases d'une même pièce ne sont pas des faces.
    for (const bord of murs) {
      const [vr, vc] = VOISIN[bord];
      if (occupees.has(`${cellule.dr + vr},${cellule.dc + vc}`)) continue;
      corps.push(mur(bordDeLaCase(x, y, bord), c));
    }
  }

  const { h, l } = M.encombrement(type, variante);
  const vue = (dr === null)
    ? `${-MARGE} ${-MARGE} ${l * U + 2 * MARGE} ${h * U + 2 * MARGE}`
    : `${dc * U} ${dr * U} ${U} ${U}`;
  const classe = 'svg-forme' + (dr === null ? '' : ' svg-plein');
  return `<svg class="${classe}" viewBox="${vue}" aria-hidden="true" focusable="false">${corps.join('')}</svg>`;
}

/** Face qui renvoie à 90° : trait plein, avec un liseré clair qui la fait briller. */
function miroir([[x1, y1], [x2, y2]], c) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="17" stroke-linecap="round"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>`;
}

/** Face qui renvoie à 180°, comme un mur : trait en pointillés. */
function mur([[x1, y1], [x2, y2]], c) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="15"
    stroke-linecap="butt" stroke-dasharray="18 13"/>`;
}

/** Étoile dessinée aux couleurs d'un mode précis, pour les légendes. */
function svgEtoileMode(mode) {
  const c = M.CSS_COULEURS[M.COULEUR_MODE_ETOILE[mode]];
  return `<svg class="svg-forme" viewBox="${-MARGE} ${-MARGE} ${U + 2 * MARGE} ${U + 2 * MARGE}"
    aria-hidden="true" focusable="false">
    <polygon points="${pts(ETOILE_POINTS)}" fill="${c}" fill-opacity=".45"
      stroke="${c}" stroke-width="9" stroke-linejoin="round"/></svg>`;
}

/** SVG de la case occupée (chaque case connaît sa position dans la pièce). */
const svgDe = (f) => svgForme(f.type, f.variante ?? null, f.dr, f.dc);

/** Variantes affichables d'un type. */
const variantesDe = (type) => M.variantesDe(type);

/** Mode d'étoile en vigueur, selon l'écran affiché. */
function modeEtoileCourant() {
  if (ecranCourant === 'labo') return labo.mode;
  if (ecranCourant === 'config' || ecranCourant === 'regles') return cfgBrouillon.modeEtoile;
  return S?.cfg.modeEtoile ?? cfgBrouillon.modeEtoile;
}

/** Pastille colorée + nom de la couleur. */
function pastille(couleur) {
  return `<span class="pastille" style="background:${M.CSS_COULEURS[couleur]}"></span><strong>${couleur}</strong>`;
}

const ECRANS = ['menu', 'regles', 'config', 'placement', 'passage', 'tour', 'ia', 'fin', 'labo'];
let ecranCourant = 'menu';
function montrer(nom) {
  ecranCourant = nom;
  for (const e of ECRANS) $('#ecran-' + e).hidden = (e !== nom);
  window.scrollTo(0, 0);
  ajusterTous();
  if (nom === 'menu') majBoutonReprendre();
}

/* ───────────────────────── Modale générique ───────────────────────── */
const modale = $('#modale');
let fermetureModale = null;

function ouvrirModale({ titre, corps, actions, annulable = true }) {
  $('#modale-titre').textContent = titre;
  const boiteCorps = $('#modale-corps');
  boiteCorps.innerHTML = '';
  if (typeof corps === 'string') boiteCorps.innerHTML = corps;
  else if (corps) boiteCorps.appendChild(corps);

  const boiteActions = $('#modale-actions');
  boiteActions.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.classe || '');
    b.textContent = a.texte;
    b.disabled = !!a.desactive;
    if (a.id) b.id = a.id;
    b.addEventListener('click', () => a.onClic());
    boiteActions.appendChild(b);
  }
  fermetureModale = annulable ? fermerModale : null;
  modale.hidden = false;
}
function fermerModale() { modale.hidden = true; fermetureModale = null; }

modale.addEventListener('click', (e) => { if (e.target === modale && fermetureModale) fermetureModale(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fermetureModale) fermetureModale(); });

/* ───────────────────────── Construction des plateaux ───────────────────────── */
const plateauxVisibles = new Map(); // élément -> dimensions {lignes, colonnes}
const TACTILE = window.matchMedia?.('(pointer: coarse)').matches ?? false;

function ajusterPlateau(el, d) {
  const petit = el.classList.contains('petit');
  const dispo = Math.min((el.parentElement?.clientWidth || 520) - 4, petit ? 340 : 620);
  // Au doigt, les flèches de bord méritent une cible plus large qu'à la souris.
  const large = d.colonnes > 8;
  const bord = petit ? 14 : (TACTILE ? (large ? 24 : 30) : (large ? 20 : 26));
  // Sur une grande grille on préfère des cases minuscules à un défilement horizontal.
  const min = petit ? 12 : 14;
  const max = petit ? 34 : 54;
  let cell = Math.floor((dispo - 2 * bord - (d.colonnes + 1) * 2) / d.colonnes);
  cell = Math.max(min, Math.min(max, cell));
  el.style.gridTemplateColumns = `${bord}px repeat(${d.colonnes}, ${cell}px) ${bord}px`;
  el.style.gridTemplateRows    = `${bord}px repeat(${d.lignes}, ${cell}px) ${bord}px`;
  el.style.setProperty('--cell', cell + 'px');
  el.style.setProperty('--bord', bord + 'px');
  // En dessous d'une certaine taille les coordonnées deviennent illisibles.
  el.classList.toggle('sans-coord', cell < 30);
}
function ajusterTous() {
  for (const [el, d] of plateauxVisibles) if (el.offsetParent !== null) ajusterPlateau(el, d);
}
window.addEventListener('resize', ajusterTous);
window.addEventListener('orientationchange', () => setTimeout(ajusterTous, 120));
for (const d of $$('details.bloc')) d.addEventListener('toggle', ajusterTous);

const SYMBOLES = { haut: '▼', bas: '▲', gauche: '▶', droite: '◀' };

/**
 * Construit un plateau de d.lignes × d.colonnes, entouré de ses boutons de bord.
 * @returns {{cases: HTMLElement[][], bords: Object}}
 */
function construirePlateau(el, d, { surCase = null, surBord = null, coords = true } = {}) {
  el.innerHTML = '';
  const cases = [];
  const bords = { haut: [], bas: [], gauche: [], droite: [] };

  for (let gr = 0; gr <= d.lignes + 1; gr++) {
    for (let gc = 0; gc <= d.colonnes + 1; gc++) {
      const surBordR = gr === 0 || gr === d.lignes + 1;
      const surBordC = gc === 0 || gc === d.colonnes + 1;

      if (surBordR && surBordC) {
        const coin = document.createElement('div');
        coin.className = 'coin';
        el.appendChild(coin);
        continue;
      }

      if (surBordR || surBordC) {
        let cote, index;
        if (gr === 0) { cote = 'haut'; index = gc; }
        else if (gr === d.lignes + 1) { cote = 'bas'; index = gc; }
        else if (gc === 0) { cote = 'gauche'; index = gr; }
        else { cote = 'droite'; index = gr; }

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bord';
        b.innerHTML = `<span class="fleche">${SYMBOLES[cote]}</span><span class="marque"></span>`;
        b.dataset.cote = cote;
        b.dataset.index = index;
        b.setAttribute('aria-label', `${CAP(cote)} ${index}`);
        if (surBord) { b.title = `Tirer depuis ${cote} ${index}`; b.addEventListener('click', () => surBord(cote, index)); }
        else b.disabled = true;
        bords[cote][index] = b;
        el.appendChild(b);
        continue;
      }

      const r = gr - 1, c = gc - 1;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'case';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.innerHTML = (coords ? `<span class="coord">${M.nomCase(r, c)}</span>` : '') + '<span class="forme"></span>';
      cell.setAttribute('aria-label', M.nomCase(r, c));
      if (surCase) cell.addEventListener('click', () => surCase(r, c));
      else cell.disabled = true;
      (cases[r] = cases[r] || [])[c] = cell;
      el.appendChild(cell);
    }
  }

  plateauxVisibles.set(el, d);
  ajusterPlateau(el, d);
  return { cases, bords };
}

/** Peint les formes d'une grille sur un plateau construit. */
function peindreFormes(cases, d, grille) {
  for (let r = 0; r < d.lignes; r++) for (let c = 0; c < d.colonnes; c++) {
    const span = $('.forme', cases[r][c]);
    const f = grille.get(M.cle(r, c));
    span.innerHTML = f ? svgDe(f) : '';
  }
}

/* ───────────────────────── Tables de référence ───────────────────────── */
function htmlMelanges() {
  return Object.entries(M.MELANGES).map(([source, nom]) => {
    const src = source === '' ? 'aucune forme' : source.split(',').join(' + ');
    return `<div class="mel"><span class="pastille" style="background:${M.CSS_COULEURS[nom]}"></span>
      <span><span class="mel-nom">${nom}</span><br><span class="mel-src">${src}</span></span></div>`;
  }).join('');
}

const DESCRIPTIONS = {
  triangle: '<strong>Trois cases.</strong> Quatre orientations, désignées par le coin où se trouve '
    + 'l\'angle droit. Ses trois faces agissent, mais différemment : l\'<strong>hypoténuse</strong> '
    + '(la face brillante) renvoie le laser à 90°, les deux <strong>cathètes</strong> (les faces en '
    + 'pointillés) le renvoient à 180°, comme un carré. Le quart de bloc opposé à l\'angle droit ne '
    + 'lui appartient pas : il reste libre, et une étoile peut très bien s\'y loger.',
  carre:    '<strong>Bloc de 2 × 2 cases.</strong> Ses quatre faces sont des murs : le laser repart '
    + 'toujours exactement d\'où il vient, quel que soit le bord par lequel il entre.',
  losange:  '<strong>Bloc de 2 × 2 cases.</strong> Ses quatre faces sont des miroirs, chacune sur sa '
    + 'propre case : on sait donc toujours laquelle a été touchée. Le laser rebondit à 90° et ne '
    + 'traverse jamais.',
  navette:  '<strong>Quatre cases en ligne</strong>, deux pleines au milieu et une pointe à chaque '
    + 'bout. Les deux pointes sont coupées dans le même sens, ce qui donne une pièce en biais. '
    + 'Debout ou couchée, et dans un sens ou dans l\'autre : quatre variantes. Les pointes renvoient '
    + 'à 90° sur leur hypoténuse et à 180° sur leurs cathètes, les cases pleines à 180° partout.',
  etoile:   '<strong>Une seule case</strong> — elle ne dévie rien, il n\'y a aucune face à identifier. '
    + 'Le laser la <strong>traverse tout droit</strong> et n\'en ressort que recoloré. Son effet exact '
    + 'dépend du <strong>mode choisi à la configuration</strong>, le même pour les deux joueurs.'
};

/** Fiche des trois modes d'étoile, avec un exemple pour chacun. */
const EXEMPLES_MODE = {
  simple:    'bleu → étoile → rouge donne <strong>bleu + magenta + rouge</strong>.',
  dominante: 'bleu → étoile → rouge donne <strong>magenta + rouge</strong> : le bleu est perdu.',
  blanche:   'bleu → étoile → rouge donne <strong>blanc</strong> : plus rien ne recolore le laser.'
};

function htmlModesEtoile(actif = null) {
  return M.MODES_ETOILE.map((mode) => `<div class="forme-fiche${mode === actif ? ' actif' : ''}">
    <span class="g">${svgEtoileMode(mode)}</span>
    <span><b>Étoile ${mode}</b><small>${CAP(M.NOM_MODE_ETOILE[mode])}. ${EXEMPLES_MODE[mode]}</small></span>
  </div>`).join('');
}

function htmlFiches() {
  const legende = `<p class="note">Le trait dit ce que fait la face :
    <strong style="color:${M.CSS_COULEURS.blanc}">trait brillant</strong> = rebond à 90°,
    <strong>trait en pointillés</strong> = demi-tour à 180°.</p>`;
  return legende + M.ORDRE_FORMES.map((type) => {
    const d = M.FORMES[type];
    const dessins = variantesDe(type).map((o) => svgForme(type, o)).join('');
    return `<div class="forme-fiche">
      <span class="g">${dessins}</span>
      <span><b>${d.nom} — teinte ${d.couleur}</b><small>${DESCRIPTIONS[type]}</small></span></div>`;
  }).join('');
}

/* ═════════════════════════ ÉTAT DE LA PARTIE ═════════════════════════ */
const DEFAUT = {
  lignes: 8, colonnes: 8,
  modeEtoile: M.MODE_ETOILE_DEFAUT,
  solo: false, niveauIA: 'facile',
  counts: { triangle: 2, carre: 1, losange: 1, navette: 0, etoile: 1 }
};
let cfgBrouillon = { ...DEFAUT, counts: { ...DEFAUT.counts } };
const dimBrouillon = () => M.dim(cfgBrouillon.lignes, cfgBrouillon.colonnes);
let S = null;

function creerJoueur(nom) {
  return {
    nom,
    grille: new Map(),   // ses propres formes cachées
    trouve: new Map(),   // formes de l'adversaire qu'il a correctement annoncées
    rates: new Set(),    // cases où il a raté un call (mémo privé)
    marques: {},         // 'cote:index' -> { n, couleur }
    tires: [],           // bords déjà utilisés comme ENTRÉE, 'cote:index'
    journal: [],         // toutes ses actions
    recap: null,         // actions de son tour précédent
    nbTirs: 0,
    memoireIA: null,     // observations de l'IA, si ce joueur est tenu par elle
    journalIA: []        // ce que l'IA a fait, tel que le joueur humain l'a vu
  };
}

function nouvellePartie(cfg) {
  cerveau = null;
  S = {
    cfg: {
      dim: M.dim(cfg.lignes, cfg.colonnes),
      modeEtoile: cfg.modeEtoile,
      solo: !!cfg.solo,
      niveauIA: cfg.niveauIA,
      counts: { ...cfg.counts },
      noms: [...cfg.noms]
    },
    total: M.totalPieces(cfg.counts),
    joueurs: cfg.noms.map(creerJoueur),
    courant: 0,
    actionsTour: [],
    agit: false,          // le joueur a déjà agi ce tour-ci
    numeroTour: 0,
    phase: 'placement',   // 'placement' | 'passage' | 'tour'
    placementIndex: 0,
    passage: null,        // { nom, note, suite }
    resultat: null        // panneau de résultat en cours d'affichage
  };
}

const adversaireDe = (i) => S.joueurs[1 - i];

/** En solo, le joueur 2 est tenu par l'IA. */
const estIA = (i) => S.cfg.solo && i === 1;

/** Cerveau de l'IA — reconstruit à la demande, sa mémoire vit dans le joueur. */
let cerveau = null;
function obtenirCerveau() {
  if (!S.cfg.solo) return null;
  if (!cerveau) {
    cerveau = IA.creerIA(
      { dim: S.cfg.dim, counts: S.cfg.counts, modeEtoile: S.cfg.modeEtoile },
      S.cfg.niveauIA);
    cerveau.restaurer(S.joueurs[1].memoireIA || {});
  }
  return cerveau;
}

/** Nombre de pièces adverses correctement annoncées (un losange = 1 pièce, 4 cases). */
const nbTrouve = (joueur) => new Set([...joueur.trouve.values()].map((v) => v.id)).size;

/* ───────────────────────── Sauvegarde automatique ─────────────────────────
   Une partie se joue sur un seul appareil, souvent un téléphone : verrouillage
   de l'écran, appel entrant ou onglet rechargé ne doivent pas faire perdre la
   partie. On sérialise l'état complet après chaque action. */
const CLE_SAUVEGARDE = 'bataille-prismatique/partie/v4';

function sauver() {
  if (!S) return;
  try {
    localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({
      v: 4,
      cfg: S.cfg, total: S.total, courant: S.courant, agit: S.agit,
      numeroTour: S.numeroTour, phase: S.phase, placementIndex: S.placementIndex,
      passage: S.passage, actionsTour: S.actionsTour, resultat: S.resultat,
      joueurs: S.joueurs.map((j) => ({
        nom: j.nom, grille: [...j.grille], trouve: [...j.trouve], rates: [...j.rates],
        marques: j.marques, tires: j.tires, journal: j.journal, recap: j.recap, nbTirs: j.nbTirs,
        memoireIA: j.memoireIA, journalIA: j.journalIA
      }))
    }));
  } catch { /* mode privé ou quota plein : on joue sans filet */ }
}

function effacerSauvegarde() {
  try { localStorage.removeItem(CLE_SAUVEGARDE); } catch { /* ignoré */ }
}

function lireSauvegarde() {
  try {
    const brut = localStorage.getItem(CLE_SAUVEGARDE);
    if (!brut) return null;
    const d = JSON.parse(brut);
    return (d && d.v === 4 && Array.isArray(d.joueurs) && d.joueurs.length === 2) ? d : null;
  } catch { return null; }
}

function reprendrePartie() {
  const d = lireSauvegarde();
  if (!d) return false;
  S = {
    cfg: d.cfg, total: d.total, courant: d.courant, agit: d.agit,
    numeroTour: d.numeroTour, phase: d.phase, placementIndex: d.placementIndex,
    passage: d.passage, actionsTour: d.actionsTour || [], resultat: d.resultat || null,
    joueurs: d.joueurs.map((j) => ({
      nom: j.nom,
      grille: new Map(j.grille),
      trouve: new Map(j.trouve),
      rates: new Set(j.rates),
      marques: j.marques || {},
      tires: j.tires || [],
      journal: j.journal || [],
      recap: j.recap || null,
      nbTirs: j.nbTirs || 0,
      memoireIA: j.memoireIA || null,
      journalIA: j.journalIA || []
    }))
  };
  cerveau = null;
  if (S.phase === 'passage' && S.passage) allerPassage(S.passage.nom, S.passage.note, S.passage.suite);
  else if (S.phase === 'ia') jouerTourIA();          // le tour de l'IA se rejoue en entier
  else if (S.phase === 'tour') rendreTour();
  else lancerPlacement(S.placementIndex ?? 0);
  return true;
}

function majBoutonReprendre() {
  const d = lireSauvegarde();
  const b = $('#menu-reprendre');
  b.hidden = !d;
  if (d) b.textContent = `↩️ Reprendre : ${d.joueurs[0].nom} vs ${d.joueurs[1].nom}`;
  // Une seule action mise en avant à la fois.
  $('#menu-jouer').classList.toggle('primaire', !d);
}

/* ═════════════════════════ MENU & RÈGLES ═════════════════════════ */
$('#menu-jouer').addEventListener('click', () => {
  if (lireSauvegarde()) {
    ouvrirModale({
      titre: 'Une partie est en cours',
      corps: '<p>Démarrer une nouvelle partie effacera la partie sauvegardée.</p>',
      actions: [
        { texte: 'Reprendre', classe: 'primaire', onClic: () => { fermerModale(); reprendrePartie(); } },
        { texte: 'Nouvelle partie', classe: 'danger', onClic: () => { fermerModale(); effacerSauvegarde(); ouvrirConfig(); } }
      ]
    });
    return;
  }
  ouvrirConfig();
});
$('#menu-reprendre').addEventListener('click', () => { if (!reprendrePartie()) majBoutonReprendre(); });
$('#menu-regles').addEventListener('click', () => {
  $('#regles-formes').innerHTML = htmlFiches();
  $('#regles-modes').innerHTML = htmlModesEtoile();
  $('#regles-melanges').innerHTML = htmlMelanges();
  montrer('regles');
});
$('#menu-labo').addEventListener('click', ouvrirLabo);
for (const b of $$('[data-retour-menu]')) b.addEventListener('click', () => montrer('menu'));

/* ═════════════════════════ CONFIGURATION ═════════════════════════ */
function ouvrirConfig() {
  $('#nom1').value = S?.cfg.noms[0] || 'Joueur 1';
  $('#nom2').value = S?.cfg.noms[1] || 'Joueur 2';
  rendreConfig();
  montrer('config');
}

function rendreConfig() {
  for (const b of $$('#cfg-mode-jeu .seg')) b.classList.toggle('actif', (b.dataset.solo === '1') === cfgBrouillon.solo);
  $('#cfg-ia-boite').hidden = !cfgBrouillon.solo;
  $('#cfg-nom2-boite').hidden = cfgBrouillon.solo;
  $('#cfg-label-nom1').textContent = cfgBrouillon.solo ? 'Ton pseudo' : 'Joueur 1';
  for (const b of $$('#cfg-ia .seg')) b.classList.toggle('actif', b.dataset.niveau === cfgBrouillon.niveauIA);
  $('#cfg-ia-detail').innerHTML =
    `<strong>${IA.INFOS_NIVEAU[cfgBrouillon.niveauIA].nom}</strong> — ${IA.INFOS_NIVEAU[cfgBrouillon.niveauIA].resume}`;

  $('#cfg-lignes').value = cfgBrouillon.lignes;
  $('#cfg-colonnes').value = cfgBrouillon.colonnes;
  $('#cfg-dim-resume').textContent =
    `${cfgBrouillon.colonnes} colonnes (A → ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[cfgBrouillon.colonnes - 1]}) `
    + `× ${cfgBrouillon.lignes} lignes (1 → ${cfgBrouillon.lignes})`;

  for (const b of $$('#cfg-etoile .seg')) b.classList.toggle('actif', b.dataset.mode === cfgBrouillon.modeEtoile);
  $('#cfg-etoile-detail').innerHTML =
    `<strong>Étoile ${cfgBrouillon.modeEtoile}</strong> — ${M.NOM_MODE_ETOILE[cfgBrouillon.modeEtoile]}.`
    + (cfgBrouillon.modeEtoile === 'simple' ? ''
      : ' Attention : dans ce mode, la couleur d\'un tir dépend du sens dans lequel on le tire.');

  $('#cfg-inventaire').innerHTML = M.ORDRE_FORMES.map((type) => {
    const d = M.FORMES[type];
    return `<div class="inv-ligne">
      <span class="inv-glyphe">${svgForme(type, variantesDe(type)[0])}</span>
      <span class="inv-nom">${d.nom}<small>teinte ${M.couleurDe(type, cfgBrouillon.modeEtoile)} · ${
        pluriel(M.emprise(type), 'case')}</small></span>
      <button class="btn" type="button" data-inv="${type}" data-pas="-1" aria-label="Moins de ${d.nom}">−</button>
      <span class="inv-compteur" id="inv-${type}">${cfgBrouillon.counts[type]}</span>
      <button class="btn" type="button" data-inv="${type}" data-pas="1" aria-label="Plus de ${d.nom}">+</button>
    </div>`;
  }).join('');

  for (const b of $$('#cfg-inventaire [data-inv]')) {
    b.addEventListener('click', () => {
      const t = b.dataset.inv;
      cfgBrouillon.counts[t] = Math.min(maxParForme(t), Math.max(0, cfgBrouillon.counts[t] + (+b.dataset.pas)));
      rendreConfig();
    });
  }

  const total = M.totalPieces(cfgBrouillon.counts);
  const cases = M.cellulesRequises(cfgBrouillon.counts);
  const plafond = plafondCases();
  let alerte = '';
  if (total === 0) alerte = 'Il faut au moins une forme par joueur.';
  else if (cases > plafond) alerte = `${cases} cases occupées : c'est trop pour une grille `
    + `${cfgBrouillon.colonnes}×${cfgBrouillon.lignes} (maximum ${plafond}).`;
  else if (!inventaireCasable()) alerte = 'Cet inventaire ne rentre pas dans une grille '
    + `${cfgBrouillon.colonnes}×${cfgBrouillon.lignes} : les pièces se gênent les unes les autres.`;

  $('#cfg-total').innerHTML = alerte
    ? `<span class="avert">${alerte}</span>`
    : `<strong>${pluriel(total, 'forme')}</strong> à cacher (${cases} cases sur ${plafond} disponibles)
       — et donc <strong>${pluriel(total, 'call')}</strong> à réussir pour gagner.`;
  $('#cfg-lancer').disabled = !!alerte;
}

/**
 * Toutes les pièces peuvent-elles vraiment coexister sur cette grille ? Plutôt
 * qu'une formule approximative, on essaie réellement de les poser : c'est le
 * seul test qui ne se trompe pas, et il coûte quelques millisecondes.
 */
function inventaireCasable() {
  const d = dimBrouillon();
  const attendu = M.totalPieces(cfgBrouillon.counts);
  for (let essai = 0; essai < 12; essai++) {
    if (M.compterPieces(M.placementAleatoire(d, cfgBrouillon.counts)) === attendu) return true;
  }
  return false;
}

/** Le plateau doit rester majoritairement vide pour que la déduction ait du sens. */
const plafondCases = () => Math.floor(cfgBrouillon.lignes * cfgBrouillon.colonnes * 0.45);

/** Combien de pièces de ce type peut-on encore ajouter sans dépasser le plafond ? */
function maxParForme(type) {
  const autres = M.cellulesRequises({ ...cfgBrouillon.counts, [type]: 0 });
  return Math.min(20, Math.floor((plafondCases() - autres) / M.emprise(type)));
}

/** Ramène l'inventaire dans les clous après un changement de dimensions. */
function rognerInventaire() {
  for (const type of [...M.ORDRE_FORMES].reverse()) {
    cfgBrouillon.counts[type] = Math.max(0, Math.min(cfgBrouillon.counts[type], maxParForme(type)));
  }
}

const MIN_COTE = 4;

for (const champ of ['lignes', 'colonnes']) {
  const input = $('#cfg-' + champ);
  const max = champ === 'colonnes' ? M.MAX_COLONNES : 40;
  input.min = MIN_COTE;
  input.max = max;
  const appliquer = () => {
    const v = parseInt(input.value, 10);
    cfgBrouillon[champ] = Number.isFinite(v) ? Math.max(MIN_COTE, Math.min(max, v)) : DEFAUT[champ];
    rognerInventaire();
    rendreConfig();
  };
  input.addEventListener('change', appliquer);
  input.addEventListener('blur', appliquer);
}

for (const b of $$('#cfg-dim-presets .seg')) {
  b.addEventListener('click', () => {
    cfgBrouillon.lignes = +b.dataset.lignes;
    cfgBrouillon.colonnes = +b.dataset.colonnes;
    rognerInventaire();
    rendreConfig();
  });
}

for (const b of $$('#cfg-etoile .seg')) {
  b.addEventListener('click', () => { cfgBrouillon.modeEtoile = b.dataset.mode; rendreConfig(); });
}

for (const b of $$('#cfg-mode-jeu .seg')) {
  b.addEventListener('click', () => {
    cfgBrouillon.solo = b.dataset.solo === '1';
    // On ajuste le pseudo par défaut, sans écraser ce que le joueur a saisi.
    const champ = $('#nom1');
    if (cfgBrouillon.solo && champ.value.trim() === 'Joueur 1') champ.value = 'Toi';
    else if (!cfgBrouillon.solo && champ.value.trim() === 'Toi') champ.value = 'Joueur 1';
    rendreConfig();
  });
}
for (const b of $$('#cfg-ia .seg')) {
  b.addEventListener('click', () => { cfgBrouillon.niveauIA = b.dataset.niveau; rendreConfig(); });
}

$('#cfg-lancer').addEventListener('click', () => {
  const noms = cfgBrouillon.solo
    ? [$('#nom1').value.trim() || 'Toi', IA.INFOS_NIVEAU[cfgBrouillon.niveauIA].nom]
    : [$('#nom1').value.trim() || 'Joueur 1', $('#nom2').value.trim() || 'Joueur 2'];
  if (noms[0] === noms[1]) { noms[0] += ' (1)'; noms[1] += ' (2)'; }
  effacerSauvegarde();
  nouvellePartie({ ...cfgBrouillon, noms });
  lancerPlacement(0);
});

/* ═════════════════════════ PLACEMENT SECRET ═════════════════════════ */
let placement = null;

function lancerPlacement(indexJoueur) {
  placement = { i: indexJoueur, outil: null, plateau: null };
  S.phase = 'placement';
  S.placementIndex = indexJoueur;
  const joueur = S.joueurs[indexJoueur];
  joueur.grille.clear();
  sauver();

  $('#place-titre').textContent = `${joueur.nom} — place tes formes`;
  placement.plateau = construirePlateau($('#place-plateau'), S.cfg.dim, { surCase: clicPlacement });
  choisirOutilDisponible();
  rendrePlacement();
  montrer('placement');
}

function stockRestant() {
  const reste = { ...S.cfg.counts };
  const pose = M.inventairePose(S.joueurs[placement.i].grille);
  for (const type of M.ORDRE_FORMES) reste[type] -= (pose[type] || 0);
  return reste;
}

function choisirOutilDisponible() {
  const reste = stockRestant();
  for (const type of M.ORDRE_FORMES) {
    if (reste[type] > 0) {
      placement.outil = { type, variante: variantesDe(type)[0] };
      return;
    }
  }
  placement.outil = null;
}

function clicPlacement(r, c) {
  const grille = S.joueurs[placement.i].grille;
  const presente = grille.get(M.cle(r, c));
  const outil = placement.outil;

  if (presente) {
    // Retaper un triangle avec l'outil triangle le fait pivoter d'un quart de tour ;
    // n'importe quel autre clic retire la pièce entière (les 4 cases d'un bloc).
    if (outil && outil.type === presente.type && M.FORMES[presente.type].variantes) {
      const v = (presente.variante === outil.variante)
        ? M.varianteSuivante(grille, S.cfg.dim, r, c)
        : M.changerVariante(grille, S.cfg.dim, r, c, outil.variante);
      if (v) placement.outil = { type: presente.type, variante: v };
    } else {
      M.retirerPiece(grille, r, c);
    }
  } else if (outil && stockRestant()[outil.type] > 0) {
    if (!poserDepuisClic(grille, S.cfg.dim, outil, r, c)) {
      const { h, l } = M.encombrement(outil.type, outil.variante);
      $('#place-etat').innerHTML = `<span class="avert">Pas la place ici : ${
        M.FORMES[outil.type].nom.toLowerCase()} occupe ${h} × ${l} cases libres.</span>`;
      return;
    }
    if (stockRestant()[outil.type] === 0) choisirOutilDisponible();
  }
  rendrePlacement();
}

/**
 * Pose une forme à partir de la case cliquée, qui est sa CASE DE POSE : le coin
 * en bas à gauche d'un carré ou d'un losange, la case pleine d'un triangle, la
 * case pleine du bas (ou de gauche) d'une navette. Si la pièce dépasse d'un
 * bord, on la recale au plus près plutôt que de refuser le clic.
 */
function poserDepuisClic(grille, d, outil, r, c) {
  const v = outil.variante ?? null;
  const [ar, ac] = M.ancreDepuisReference(outil.type, v, r, c);
  if (M.poserPiece(grille, d, outil.type, ar, ac, v)) return true;
  const [rr, rc] = M.ancreValide(outil.type, v, d, ar, ac);
  return M.poserPiece(grille, d, outil.type, rr, rc, v);
}

function rendrePlacement() {
  const joueur = S.joueurs[placement.i];
  const reste = stockRestant();
  const outil = placement.outil;

  const boutons = [];
  for (const type of M.ORDRE_FORMES) {
    for (const o of variantesDe(type)) {
      const actif = outil && outil.type === type && (o === null || outil.variante === o);
      boutons.push(`<button class="pal-btn ${actif ? 'actif' : ''} ${reste[type] <= 0 ? 'epuise' : ''}"
        type="button" data-type="${type}" ${o ? `data-variante="${o}"` : ''}
        aria-label="${libelleLong(type, o)}" title="${libelleLong(type, o)}">
        <span class="pal-glyphe">${svgForme(type, o)}</span>
        <span class="pal-reste">${reste[type]} / ${S.cfg.counts[type]}</span></button>`);
    }
  }
  $('#place-palette').innerHTML = boutons.join('');
  for (const b of $$('#place-palette .pal-btn')) {
    b.addEventListener('click', () => {
      placement.outil = { type: b.dataset.type, variante: b.dataset.variante ?? null };
      rendrePlacement();
    });
  }

  peindreFormes(placement.plateau.cases, S.cfg.dim, joueur.grille);

  const pose = M.compterPieces(joueur.grille);
  const total = S.total;
  $('#place-etat').innerHTML = pose === total
    ? '✅ Toutes tes formes sont posées. Clique une forme posée pour la retirer, ou un triangle pour le pivoter.'
    : `${pose} / ${total} posées — sélectionne une forme puis clique une case.`;
  $('#place-valider').disabled = pose !== total;
}

$('#place-alea').addEventListener('click', () => {
  const j = S.joueurs[placement.i];
  j.grille = M.placementAleatoire(S.cfg.dim, S.cfg.counts);
  choisirOutilDisponible();
  rendrePlacement();
});
$('#place-vide').addEventListener('click', () => {
  S.joueurs[placement.i].grille.clear();
  choisirOutilDisponible();
  rendrePlacement();
});
$('#place-valider').addEventListener('click', () => {
  if (placement.i === 0 && S.cfg.solo) {
    // L'IA cache ses formes elle-même : rien à se passer de main en main.
    S.joueurs[1].grille = obtenirCerveau().placer();
    S.courant = 0;
    demarrerTour();
    return;
  }
  if (placement.i === 0) {
    allerPassage(S.joueurs[1].nom, 'C\'est au tour de l\'autre joueur de cacher ses formes.', 'placer1');
  } else {
    S.courant = 0;
    allerPassage(S.joueurs[0].nom, 'Les deux grilles sont cachées. La partie commence !', 'tour');
  }
});

/* ═════════════════════════ PASSAGE D'APPAREIL ═════════════════════════ */
/* La suite est désignée par une clé (et non par une fonction) pour rester
   sérialisable dans la sauvegarde. */
const SUITES = {
  placer0: () => lancerPlacement(0),
  placer1: () => lancerPlacement(1),
  tour: () => demarrerTour()
};

function allerPassage(nom, note, suite) {
  S.phase = 'passage';
  S.passage = { nom, note, suite };
  $('#passage-nom').textContent = nom;
  $('#passage-nom2').textContent = nom;
  $('#passage-note').textContent = note;
  sauver();
  montrer('passage');
}
$('#passage-ok').addEventListener('click', () => {
  const suite = S?.passage?.suite;
  if (suite) SUITES[suite]();
});

/* ═════════════════════════ TOUR DE JEU ═════════════════════════ */
let plateauTour = null;

function demarrerTour() {
  S.agit = false;
  S.actionsTour = [];
  S.resultat = null;
  S.numeroTour++;
  S.phase = 'tour';
  rendreTour();
  sauver();
}

/** Reconstruit intégralement l'écran de tour depuis l'état — utilisé aussi
    pour reprendre une partie sauvegardée en plein milieu d'un tour. */
function rendreTour() {
  S.phase = 'tour';
  const joueur = S.joueurs[S.courant];
  const cible = adversaireDe(S.courant);

  $('#tour-titre').textContent = `Tour de ${joueur.nom}`;
  majScore();

  plateauTour = construirePlateau($('#tour-plateau'), S.cfg.dim, {
    surCase: clicCall,
    surBord: clicTir
  });

  // Grille personnelle, consultable à la demande.
  $('#tour-magrille-boite').open = false;
  const perso = construirePlateau($('#tour-magrille'), S.cfg.dim, {});
  peindreFormes(perso.cases, S.cfg.dim, joueur.grille);

  $('#tour-melanges').innerHTML = htmlMelanges();
  $('#tour-mode-etoile').innerHTML = htmlModesEtoile(S.cfg.modeEtoile);
  const boiteIA = $('#tour-ia-boite');
  boiteIA.hidden = !S.cfg.solo || !joueur.journalIA.length;
  if (!boiteIA.hidden) {
    $('#tour-ia-journal').innerHTML =
      [...joueur.journalIA].reverse().map((h) => `<li>${h}</li>`).join('');
  }
  $('#tour-resultat').hidden = true;
  $('#tour-consigne').innerHTML =
    'Clique une <strong>flèche</strong> pour tirer un laser, ou une <strong>case</strong> pour faire un call.';

  rendreRappel(joueur);
  rendreTraces(joueur);
  rendreRestant(joueur);
  rendreJournal(joueur);
  if (S.agit) verrouillerPlateau(); else deverrouillerPlateau();
  if (S.resultat) peindreResultat();
  montrer('tour');
}

function majScore() {
  const joueur = S.joueurs[S.courant];
  $('#tour-score').textContent =
    `${nbTrouve(joueur)}/${S.total} trouvées · ${pluriel(joueur.nbTirs, 'tir')} · cible : ${adversaireDe(S.courant).nom}`;
}

/** Bandeau « ton tour précédent », pour prendre ses notes tranquillement. */
function rendreRappel(joueur) {
  const boite = $('#tour-rappel');
  if (!joueur.recap || !joueur.recap.length) {
    boite.innerHTML = `<h4>Premier tour</h4>Tu n'as encore aucune information sur la grille de
      ${ech(adversaireDe(S.courant).nom)}. À toi de jouer.`;
    return;
  }
  boite.innerHTML = `<h4>Résultat de ton tour précédent</h4><ul>${
    joueur.recap.map((a) => `<li>${a.html}</li>`).join('')}</ul>`;
}

/** Marques laissées par les tirs passés sur les bords, et formes déjà trouvées. */
function rendreTraces(joueur) {
  for (const [k, info] of Object.entries(joueur.marques)) {
    const [cote, index] = k.split(':');
    const b = plateauTour.bords[cote][+index];
    if (!b) continue;
    const fond = M.CSS_COULEURS[info.couleur];
    b.classList.add('a-marque');
    const marque = $('.marque', b);
    marque.style.background = fond;
    marque.style.color = texteSur(fond);
    marque.textContent = info.n;
    b.title = `Tir n°${info.n} — couleur ${info.couleur}`;
  }
  for (const [k, f] of joueur.trouve) {
    const [r, c] = k.split(',').map(Number);
    const cell = plateauTour.cases[r][c];
    cell.classList.add('trouvee');
    $('.forme', cell).innerHTML = svgDe(f);
  }
  for (const k of joueur.rates) {
    const [r, c] = k.split(',').map(Number);
    plateauTour.cases[r][c].classList.add('rate');
  }
}

function rendreRestant(joueur) {
  const trouvesParType = {};
  const vus = new Set();
  for (const f of joueur.trouve.values()) {
    if (vus.has(f.id)) continue;
    vus.add(f.id);
    trouvesParType[f.type] = (trouvesParType[f.type] || 0) + 1;
  }
  $('#tour-restant').innerHTML = M.ORDRE_FORMES.filter((t) => S.cfg.counts[t] > 0).map((t) => {
    const d = M.FORMES[t];
    const reste = S.cfg.counts[t] - (trouvesParType[t] || 0);
    return `<span class="restant-item ${reste === 0 ? 'fini' : ''}">
      <span class="g">${svgForme(t, variantesDe(t)[0])}</span>${d.nom} × ${reste}</span>`;
  }).join('');
}

function rendreJournal(joueur) {
  const ol = $('#tour-journal');
  $('#tour-journal-vide').hidden = joueur.journal.length > 0;
  ol.innerHTML = [...joueur.journal].reverse().map((a) =>
    `<li class="${a.classe}" data-tir="${a.tir ?? ''}">${a.html}</li>`).join('');
  for (const li of $$('#tour-journal li[data-tir]:not([data-tir=""])')) {
    li.addEventListener('click', () => surlignerTir(joueur, +li.dataset.tir, li));
  }
}

function surlignerTir(joueur, n, li) {
  for (const b of $$('#tour-plateau .bord.surligne')) b.classList.remove('surligne');
  for (const autre of $$('#tour-journal li.sel')) autre.classList.remove('sel');
  li.classList.add('sel');
  for (const [k, info] of Object.entries(joueur.marques)) {
    if (info.n !== n) continue;
    const [cote, index] = k.split(':');
    plateauTour.bords[cote][+index]?.classList.add('surligne');
  }
}

/* ─────────────── Action : tirer un laser ─────────────── */
function clicTir(cote, index) {
  if (S.agit) return;
  const joueur = S.joueurs[S.courant];
  const k = `${cote}:${index}`;
  const dejaVu = joueur.marques[k];
  if (!dejaVu) { executerTir(cote, index); return; }

  const dejaTire = joueur.tires.includes(k);
  const couleurSymetrique = S.cfg.modeEtoile === 'simple';
  ouvrirModale({
    titre: 'Bord déjà connu',
    corps: dejaTire
      ? `<p>Tu as déjà tiré depuis ce bord (tir n°${dejaVu.n}, ${pastille(dejaVu.couleur)}).
         Le résultat sera identique.</p><p class="avert">Tu perdrais ton tour pour rien.</p>`
      : couleurSymetrique
        ? `<p>Ce bord est la sortie du tir n°${dejaVu.n} (${pastille(dejaVu.couleur)}). Le trajet étant
           réversible et la partie se jouant en étoile <strong>simple</strong>, tu retomberas sur son
           entrée avec la même couleur.</p><p class="avert">Tu perdrais ton tour pour rien.</p>`
        : `<p>Ce bord est la sortie du tir n°${dejaVu.n} (${pastille(dejaVu.couleur)}). Le trajet sera le
           même à l'envers, mais la partie se joue en étoile <strong>${S.cfg.modeEtoile}</strong> :
           la couleur, elle, peut être différente dans ce sens.</p>
           <p class="note">Ça peut donc valoir le tour.</p>`,
    actions: [
      { texte: 'Annuler', onClic: fermerModale },
      { texte: 'Tirer quand même', classe: dejaTire ? 'danger' : 'primaire',
        onClic: () => { fermerModale(); executerTir(cote, index); } }
    ]
  });
}

function executerTir(cote, index) {
  const joueur = S.joueurs[S.courant];
  const cible = adversaireDe(S.courant);
  S.agit = true;
  verrouillerPlateau();

  const res = M.tirer(cible.grille, S.cfg.dim, cote, index, S.cfg.modeEtoile);
  const n = ++joueur.nbTirs;

  const entree = plateauTour.bords[cote][index];
  entree.classList.add('surligne');

  // On n'affiche jamais le trajet : seule la sortie est révélée, après un court délai.
  setTimeout(() => {
    let html, resume;
    if (res.statut === 'sorti') {
      joueur.marques[`${cote}:${index}`] = { n, couleur: res.couleur };
      joueur.marques[`${res.coteSortie}:${res.indexSortie}`] = { n, couleur: res.couleur };
      joueur.tires.push(`${cote}:${index}`);
      resume = res.retour
        ? `<strong>Tir n°${n}</strong> — ${CAP(cote)} ${index} → <em>retour à l'entrée</em> ${pastille(res.couleur)}`
        : `<strong>Tir n°${n}</strong> — ${CAP(cote)} ${index} → ${CAP(res.coteSortie)} ${res.indexSortie} ${pastille(res.couleur)}`;
      html = `<h3>Le laser ressort</h3><p>${resume}</p>`;
    } else {
      // Garde-fou : théoriquement inatteignable (voir moteur.js).
      joueur.marques[`${cote}:${index}`] = { n, couleur: 'noir' };
      resume = `<strong>Tir n°${n}</strong> — ${CAP(cote)} ${index} → le laser ne ressort pas`;
      html = `<h3>Laser piégé</h3><p>${resume}</p>`;
    }

    const action = { html: resume, classe: '', tir: n };
    joueur.journal.push(action);
    S.actionsTour.push(action);

    rendreTraces(joueur);
    rendreJournal(joueur);
    entree.classList.add('surligne');
    if (res.statut === 'sorti') plateauTour.bords[res.coteSortie][res.indexSortie]?.classList.add('surligne');

    afficherResultat(html, '', texteFinDeTour(), 'fin');
  }, 420);
}

/* ─────────────── Action : faire un call ─────────────── */
function clicCall(r, c) {
  if (S.agit) return;
  const joueur = S.joueurs[S.courant];
  const k = M.cle(r, c);
  if (joueur.trouve.has(k)) {
    ouvrirModale({
      titre: M.nomCase(r, c),
      corps: `<p>Tu as déjà trouvé cette case : <strong>${M.nomForme(joueur.trouve.get(k))}</strong>.</p>`,
      actions: [{ texte: 'Fermer', classe: 'primaire', onClic: fermerModale }]
    });
    return;
  }

  /*
     La case visée est la case d'ANNONCE de la pièce : la plus basse, et la plus
     à gauche à égalité. La forme s'étend donc vers le haut et/ou la droite, et
     près d'un bord certaines déclinaisons ne peuvent tout simplement pas avoir
     leur case d'annonce ici. On ne propose que celles qui tiennent — c'est de
     la géométrie visible, pas une indiscrétion sur la grille adverse.
  */
  const tientIci = (type, variante) => {
    const [dr, dc] = M.decalageCall(type, variante);
    const { h, l } = M.encombrement(type, variante);
    const ar = r - dr, ac = c - dc;
    return ar >= 0 && ac >= 0 && ar + h <= S.cfg.dim.lignes && ac + l <= S.cfg.dim.colonnes;
  };
  const proposables = M.ORDRE_FORMES
    .filter((t) => S.cfg.counts[t] > 0)
    .flatMap((type) => variantesDe(type).filter((v) => tientIci(type, v)).map((v) => ({ type, variante: v })));

  if (!proposables.length) {
    ouvrirModale({
      titre: M.nomCase(r, c),
      corps: '<p>Aucune forme de cette partie ne peut avoir sa case d\'annonce ici : trop près du bord.</p>',
      actions: [{ texte: 'Fermer', classe: 'primaire', onClic: fermerModale }]
    });
    return;
  }

  let choix = null;
  const corps = document.createElement('div');
  corps.innerHTML = `<p>Annonce la forme dont <strong>${M.nomCase(r, c)}</strong> est la
    <strong>case d'annonce</strong>, sur la grille de ${ech(adversaireDe(S.courant).nom)}.</p>
    <p class="note">Une forme s'annonce toujours par sa case la plus basse — la plus à gauche
    s'il y en a plusieurs. Elle s'étend donc vers le haut et vers la droite depuis
    ${M.nomCase(r, c)}.</p>
    <div class="choix-formes"></div>
    <p class="avert">Si tu as raison, la forme est révélée et tu rejoues.
    Si tu te trompes, tu ne sauras rien de plus et le tour passe à l'adversaire.</p>`;

  const zone = $('.choix-formes', corps);
  for (const { type, variante } of proposables) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pal-btn';
    b.innerHTML = `<span class="pal-glyphe">${svgForme(type, variante)}</span>
      <span class="pal-reste">${M.FORMES[type].nom}</span>`;
    b.setAttribute('aria-label', libelleLong(type, variante));
    b.title = libelleLong(type, variante);
    b.addEventListener('click', () => {
      choix = { type, variante };
      for (const autre of $$('.pal-btn', zone)) autre.classList.remove('actif');
      b.classList.add('actif');
      $('#modale-confirmer').disabled = false;
    });
    zone.appendChild(b);
  }

  ouvrirModale({
    titre: `Call sur ${M.nomCase(r, c)}`,
    corps,
    actions: [
      { texte: 'Annuler', onClic: fermerModale },
      { texte: 'Confirmer le call', classe: 'primaire', id: 'modale-confirmer', desactive: true,
        onClic: () => { fermerModale(); executerCall(r, c, choix); } }
    ]
  });
}

function executerCall(r, c, forme) {
  const joueur = S.joueurs[S.courant];
  const cible = adversaireDe(S.courant);
  const k = M.cle(r, c);
  const reelle = cible.grille.get(k);
  // Un bloc ne se laisse annoncer que sur son quart en bas à gauche.
  const juste = !!reelle && M.estCaseDeCall(reelle) && M.memeForme(reelle, forme);
  const nom = M.nomCase(r, c);

  if (juste) {
    // Un losange s'étend sur 4 cases : le trouver les révèle toutes.
    for (const kc of M.casesDeLaPiece(cible.grille, r, c)) {
      joueur.trouve.set(kc, { ...cible.grille.get(kc) });
      joueur.rates.delete(kc);
    }
    const etendue = M.emprise(reelle.type) > 1
      ? ` (bloc ${M.nomCase(...reelle.ancre)}–${M.nomCase(reelle.ancre[0] + 1, reelle.ancre[1] + 1)})` : '';
    const action = { html: `✅ <strong>Call ${nom}</strong> = ${M.nomForme(reelle)}${etendue} — trouvé`, classe: 'est-call-ok' };
    joueur.journal.push(action);
    S.actionsTour.push(action);

    rendreTraces(joueur);
    rendreRestant(joueur);
    rendreJournal(joueur);
    majScore();

    if (nbTrouve(joueur) === S.total) { terminerPartie(S.courant); return; }

    afficherResultat(
      `<h3>✅ Call réussi</h3><p><strong>${nom}</strong> contient bien ${M.nomForme(reelle)}${
        M.emprise(reelle.type) > 1 ? ', dont les 4 cases sont maintenant révélées' : ''}.
       Il te reste <strong>${pluriel(S.total - nbTrouve(joueur), 'forme')}</strong> à trouver.</p>`,
      'ok', 'Continuer mon tour', 'continuer');
    return;
  }

  S.agit = true;
  verrouillerPlateau();
  joueur.rates.add(k);
  const action = { html: `❌ <strong>Call ${nom}</strong> = ${M.nomForme(forme)} — raté`, classe: 'est-call-ko' };
  joueur.journal.push(action);
  S.actionsTour.push(action);
  rendreTraces(joueur);
  rendreJournal(joueur);

  afficherResultat(
    `<h3>❌ Call raté</h3><p><strong>${nom}</strong> n'est pas la case d'annonce
     d'${M.nomForme(forme).toLowerCase().startsWith('é') ? 'une' : 'un'} ${M.nomForme(forme)}.</p>
     <p>C'est tout ce que tu apprends : on ne te dira ni quelle forme s'y trouve, ni si la case est
     vide, ni si tu as visé la mauvaise case d'une forme pourtant bien là.</p>
     <p class="note">Et tu n'as pas tiré ce tour-ci : aucune information nouvelle sur la grille.</p>`,
    'ko', texteFinDeTour(), 'fin');
}

/* ─────────────── Fin de tour ─────────────── */
/** Le bouton de fin de tour ne parle d'appareil que s'il y a quelqu'un à qui le passer. */
const texteFinDeTour = () =>
  S.cfg.solo ? 'Terminer le tour' : 'Terminer le tour — passer l\'appareil';

/** Suites possibles après l'affichage d'un résultat (clés sérialisables). */
const APRES = {
  fin: () => finirTour(),
  continuer: () => {
    S.agit = false;
    S.resultat = null;
    deverrouillerPlateau();
    $('#tour-resultat').hidden = true;
    $('#tour-consigne').innerHTML =
      'Clique une <strong>flèche</strong> pour tirer un laser, ou une <strong>case</strong> pour faire un call.';
    sauver();
  }
};

function afficherResultat(html, classe, texteBouton, suite) {
  S.resultat = { html, classe, texteBouton, suite };
  peindreResultat();
  sauver();
  $('#tour-resultat').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function peindreResultat() {
  const { html, classe, texteBouton, suite } = S.resultat;
  const boite = $('#tour-resultat');
  boite.className = 'resultat ' + classe;
  boite.innerHTML = html;
  const b = document.createElement('button');
  b.className = 'btn primaire';
  b.textContent = texteBouton;
  b.addEventListener('click', () => APRES[suite]());
  boite.appendChild(b);
  boite.hidden = false;
  $('#tour-consigne').innerHTML = S.agit
    ? (S.cfg.solo
        ? '📝 <strong>Note ton résultat</strong>, puis termine ton tour.'
        : '📝 <strong>Note ton résultat</strong> avant de passer l\'appareil.')
    : 'Tu rejoues : nouvelle flèche pour tirer, ou nouvelle case pour un call.';
}

function verrouillerPlateau() {
  for (const b of $$('#tour-plateau .bord, #tour-plateau .case')) b.disabled = true;
}
function deverrouillerPlateau() {
  const joueur = S.joueurs[S.courant];
  for (const b of $$('#tour-plateau .bord')) b.disabled = false;
  for (const cell of $$('#tour-plateau .case')) {
    cell.disabled = joueur.trouve.has(M.cle(+cell.dataset.r, +cell.dataset.c));
  }
}

function finirTour() {
  const joueur = S.joueurs[S.courant];
  joueur.recap = [...S.actionsTour];
  S.courant = 1 - S.courant;
  if (S.cfg.solo) {
    // Personne à qui passer l'appareil : on enchaîne directement.
    if (estIA(S.courant)) jouerTourIA(); else demarrerTour();
    return;
  }
  allerPassage(S.joueurs[S.courant].nom, 'Le tour est passé. Ne regarde que si c\'est bien toi.', 'tour');
}

/* ═════════════════════════ TOUR DE L'IA ═════════════════════════ */

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ligne de journal pour une action de l'IA, telle que le joueur la voit. */
function ligneIA(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  $('#ia-actions').appendChild(li);
  return li;
}

async function jouerTourIA() {
  const ia = obtenirCerveau();
  const robot = S.joueurs[1];
  const humain = S.joueurs[0];
  S.phase = 'ia';
  S.actionsTour = [];
  sauver();                        // point de reprise : le tour se rejouera en entier

  $('#ia-titre').textContent = `🤖 Tour de ${robot.nom}`;
  $('#ia-sous-titre').textContent =
    `${nbTrouve(robot)} / ${S.total} de tes formes trouvées · ${pluriel(robot.nbTirs, 'tir')}`;
  $('#ia-actions').innerHTML = '';
  $('#ia-continuer').disabled = true;
  $('#ia-reflexion').hidden = false;

  const vue = construirePlateau($('#ia-plateau'), S.cfg.dim, {});
  peindreFormes(vue.cases, S.cfg.dim, humain.grille);
  const marquerVue = () => {
    for (const [k, info] of Object.entries(robot.marques)) {
      const [cote, index] = k.split(':');
      const b = vue.bords[cote]?.[+index];
      if (!b) continue;
      const fond = M.CSS_COULEURS[info.couleur];
      b.classList.add('a-marque');
      const marque = $('.marque', b);
      marque.style.background = fond;
      marque.style.color = texteSur(fond);
      marque.textContent = info.n;
    }
  };
  marquerVue();
  montrer('ia');

  let continuer = true;
  while (continuer) {
    $('#ia-reflexion').hidden = false;
    const action = await ia.choisirAction();
    $('#ia-reflexion').hidden = true;
    await attendre(180);

    if (action.type === 'tir') {
      const res = M.tirer(humain.grille, S.cfg.dim, action.cote, action.index, S.cfg.modeEtoile);
      ia.noterTir(action.cote, action.index, res);
      const n = ++robot.nbTirs;
      robot.marques[`${action.cote}:${action.index}`] = { n, couleur: res.couleur };
      robot.marques[`${res.coteSortie}:${res.indexSortie}`] = { n, couleur: res.couleur };
      robot.tires.push(`${action.cote}:${action.index}`);
      const html = res.retour
        ? `🔦 <strong>Tir n°${n}</strong> — ${CAP(action.cote)} ${action.index} → <em>retour à l'entrée</em> ${pastille(res.couleur)}`
        : `🔦 <strong>Tir n°${n}</strong> — ${CAP(action.cote)} ${action.index} → ${CAP(res.coteSortie)} ${res.indexSortie} ${pastille(res.couleur)}`;
      ligneIA(html);
      humain.journalIA.push(html);
      robot.journal.push({ html, classe: '', tir: n });
      marquerVue();
      continuer = false;
    } else {
      const nom = M.nomCase(action.r, action.c);
      const reelle = humain.grille.get(M.cle(action.r, action.c));
      const juste = !!reelle && M.estCaseDeCall(reelle) && M.memeForme(reelle, action.forme);

      if (juste) {
        for (const kc of M.casesDeLaPiece(humain.grille, action.r, action.c)) {
          robot.trouve.set(kc, { ...humain.grille.get(kc) });
        }
        ia.noterCall(action.r, action.c, action.forme, true, {
          type: reelle.type, r: reelle.ancre[0], c: reelle.ancre[1], variante: reelle.variante ?? null
        });
        const html = `✅ <strong>Call ${nom}</strong> = ${M.nomForme(action.forme)} — trouvé, elle rejoue`;
        ligneIA(html);
        humain.journalIA.push(html);
        robot.journal.push({ html, classe: 'est-call-ok' });
        $('#ia-sous-titre').textContent =
          `${nbTrouve(robot)} / ${S.total} de tes formes trouvées · ${pluriel(robot.nbTirs, 'tir')}`;
        robot.memoireIA = ia.memoire();
        if (nbTrouve(robot) === S.total) { terminerPartie(1); return; }
        await attendre(450);
        continuer = true;
      } else {
        ia.noterCall(action.r, action.c, action.forme, false, null);
        const html = `❌ <strong>Call ${nom}</strong> = ${M.nomForme(action.forme)} — raté`;
        ligneIA(html);
        humain.journalIA.push(html);
        robot.journal.push({ html, classe: 'est-call-ko' });
        continuer = false;
      }
    }
    robot.memoireIA = ia.memoire();
  }

  robot.recap = [];
  S.courant = 0;
  S.phase = 'tour';
  sauver();
  $('#ia-continuer').disabled = false;
}

$('#ia-continuer').addEventListener('click', () => demarrerTour());

$('#tour-abandon').addEventListener('click', () => {
  ouvrirModale({
    titre: 'Quitter la partie ?',
    corps: '<p>La partie en cours sera perdue.</p>',
    actions: [
      { texte: 'Continuer à jouer', classe: 'primaire', onClic: fermerModale },
      { texte: 'Quitter', classe: 'danger', onClic: () => { fermerModale(); effacerSauvegarde(); S = null; montrer('menu'); } }
    ]
  });
});

/* ═════════════════════════ FIN DE PARTIE ═════════════════════════ */
function terminerPartie(gagnant) {
  effacerSauvegarde();
  const j = S.joueurs[gagnant];
  const p = S.joueurs[1 - gagnant];
  $('#fin-titre').textContent = `🏆 ${j.nom} gagne !`;
  $('#fin-detail').innerHTML =
    `${ech(j.nom)} a annoncé les <strong>${S.total}</strong> formes de ${ech(p.nom)} en
     <strong>${pluriel(j.nbTirs, 'tir')}</strong>.
     ${ech(p.nom)} en avait trouvé <strong>${nbTrouve(p)} / ${S.total}</strong>.`;

  $('#fin-nom1').textContent = `Grille de ${S.joueurs[0].nom}`;
  $('#fin-nom2').textContent = `Grille de ${S.joueurs[1].nom}`;
  const p1 = construirePlateau($('#fin-plateau1'), S.cfg.dim, {});
  const p2 = construirePlateau($('#fin-plateau2'), S.cfg.dim, {});
  peindreFormes(p1.cases, S.cfg.dim, S.joueurs[0].grille);
  peindreFormes(p2.cases, S.cfg.dim, S.joueurs[1].grille);
  montrer('fin');
}

$('#fin-rejouer').addEventListener('click', () => {
  effacerSauvegarde();
  nouvellePartie({
    lignes: S.cfg.dim.lignes, colonnes: S.cfg.dim.colonnes,
    modeEtoile: S.cfg.modeEtoile, solo: S.cfg.solo, niveauIA: S.cfg.niveauIA,
    counts: S.cfg.counts, noms: S.cfg.noms
  });
  lancerPlacement(0);
});

/* ═════════════════════════ LABORATOIRE (bac à sable solo) ═════════════════════════ */
const labo = {
  dim: M.dim(8), mode: M.MODE_ETOILE_DEFAUT, grille: new Map(),
  outil: { type: 'triangle', variante: M.COINS[0] }, plateau: null, minuteurs: [], n: 0
};

function ouvrirLabo() {
  labo.plateau = construirePlateau($('#labo-plateau'), labo.dim, { surCase: clicLabo, surBord: tirLabo });
  $('#labo-melanges').innerHTML = htmlMelanges();
  rendreLabo();
  montrer('labo');
}

function clicLabo(r, c) {
  effacerRayons();
  const presente = labo.grille.get(M.cle(r, c));
  const memeTypeOrientable = presente && labo.outil !== 'gomme'
    && presente.type === labo.outil.type && M.FORMES[presente.type].variantes;
  if (labo.outil === 'gomme' || (presente && !memeTypeOrientable)) {
    M.retirerPiece(labo.grille, r, c);
  } else if (presente) {
    const v = (presente.variante === labo.outil.variante)
      ? M.varianteSuivante(labo.grille, labo.dim, r, c)
      : M.changerVariante(labo.grille, labo.dim, r, c, labo.outil.variante);
    if (v) labo.outil = { type: presente.type, variante: v };
  } else {
    poserDepuisClic(labo.grille, labo.dim, labo.outil, r, c);
  }
  rendreLabo();
}

function rendreLabo() {
  const boutons = [];
  for (const type of M.ORDRE_FORMES) {
    for (const o of variantesDe(type)) {
      const actif = labo.outil !== 'gomme' && labo.outil.type === type && (o === null || labo.outil.variante === o);
      boutons.push(`<button class="pal-btn ${actif ? 'actif' : ''}" type="button" data-type="${type}"
        ${o ? `data-variante="${o}"` : ''} aria-label="${libelleLong(type, o)}" title="${libelleLong(type, o)}">
        <span class="pal-glyphe">${svgForme(type, o)}</span>
        <span class="pal-reste">${M.FORMES[type].nom}</span></button>`);
    }
  }
  boutons.push(`<button class="pal-btn ${labo.outil === 'gomme' ? 'actif' : ''}" type="button" data-type="gomme">
    <span class="pal-glyphe">✕</span><span class="pal-reste">Gomme</span></button>`);
  $('#labo-palette').innerHTML = boutons.join('');
  for (const b of $$('#labo-palette .pal-btn')) {
    b.addEventListener('click', () => {
      const type = b.dataset.type;
      if (type === 'gomme') labo.outil = 'gomme';
      else labo.outil = { type, variante: b.dataset.variante ?? null };
      rendreLabo();
    });
  }
  peindreFormes(labo.plateau.cases, labo.dim, labo.grille);
}

function effacerRayons() {
  labo.minuteurs.forEach(clearTimeout);
  labo.minuteurs = [];
  for (const e of $$('#labo-plateau .rayon')) e.remove();
  for (const b of $$('#labo-plateau .bord')) {
    b.classList.remove('surligne', 'a-marque');
    const m = $('.marque', b);
    m.style.background = ''; m.textContent = '';
  }
}

function tirLabo(cote, index) {
  effacerRayons();
  const res = M.tirer(labo.grille, labo.dim, cote, index, labo.mode);
  labo.n++;
  labo.plateau.bords[cote][index].classList.add('surligne');

  res.etapes.forEach((e, i) => {
    labo.minuteurs.push(setTimeout(() => {
      const s = document.createElement('span');
      s.className = 'rayon ' + ((e.dir === 'E' || e.dir === 'W') ? 'rayon-h' : 'rayon-v');
      const coul = M.CSS_COULEURS[e.couleur];
      s.style.background = coul;
      s.style.boxShadow = `0 0 12px ${coul}`;
      labo.plateau.cases[e.r][e.c].appendChild(s);
    }, i * 90));
  });

  labo.minuteurs.push(setTimeout(() => {
    if (res.statut === 'sorti') {
      const bs = labo.plateau.bords[res.coteSortie][res.indexSortie];
      const fond = M.CSS_COULEURS[res.couleur];
      bs.classList.add('a-marque');
      const m = $('.marque', bs);
      m.style.background = fond;
      m.style.color = texteSur(fond);
      m.textContent = labo.n;
      $('#labo-resultat').innerHTML = res.retour
        ? `<strong>Tir n°${labo.n}</strong> — ${CAP(cote)} ${index} → retour à l'entrée ${pastille(res.couleur)}`
        : `<strong>Tir n°${labo.n}</strong> — ${CAP(cote)} ${index} → ${CAP(res.coteSortie)} ${res.indexSortie} ${pastille(res.couleur)}`;
    } else {
      $('#labo-resultat').innerHTML = `<strong>Tir n°${labo.n}</strong> — le laser ne ressort pas.`;
    }
  }, res.etapes.length * 90 + 80));
}

for (const b of $$('#labo-etoile .seg')) {
  b.addEventListener('click', () => {
    labo.mode = b.dataset.mode;
    for (const autre of $$('#labo-etoile .seg')) autre.classList.toggle('actif', autre === b);
    effacerRayons();
    rendreLabo();
    $('#labo-resultat').innerHTML =
      `Mode <strong>étoile ${labo.mode}</strong> : ${M.NOM_MODE_ETOILE[labo.mode]}. Clique une flèche pour tirer…`;
  });
}

$('#labo-alea').addEventListener('click', () => {
  effacerRayons();
  labo.grille = M.placementAleatoire(labo.dim, { triangle: 3, carre: 1, losange: 1, etoile: 2 });
  rendreLabo();
});
$('#labo-vide').addEventListener('click', () => {
  effacerRayons();
  labo.grille.clear();
  rendreLabo();
  $('#labo-resultat').textContent = 'Clique une flèche pour tirer…';
});

/* ═════════════════════════ Démarrage ═════════════════════════ */
// Filet de sécurité supplémentaire : on resauvegarde si l'onglet passe en arrière-plan.
document.addEventListener('visibilitychange', () => { if (document.hidden) sauver(); });

rendreConfig();
montrer('menu');
