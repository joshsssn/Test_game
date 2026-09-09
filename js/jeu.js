/* =========================================================================
   Lasers & Formes — interface et déroulé de la partie (2 joueurs, 1 appareil)
   ========================================================================= */
import * as M from './moteur.js';

/* ───────────────────────── Utilitaires ───────────────────────── */
const $  = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

/** Échappe le texte destiné à innerHTML (les pseudos sont saisis par le joueur). */
const ech = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pluriel = (n, mot, pl = mot + 's') => `${n} ${n > 1 ? pl : mot}`;

/** Libellé court d'une variante de forme, orientation comprise. */
function libelleVariante(type, orientation) {
  const d = M.FORMES[type];
  return orientation ? `${d.nom} ${d.glyphes[orientation]}` : d.nom;
}

/** Libellé long, pour les lecteurs d'écran et les info-bulles. */
function libelleLong(type, orientation) {
  return orientation ? `${M.FORMES[type].nom}, ${M.NOM_COIN[orientation]}` : M.FORMES[type].nom;
}

/** Couleur de texte lisible au-dessus d'un fond donné. */
function texteSur(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#04121f' : '#e6edf9';
}

/* ─────────────────────── Rendu vectoriel des formes ───────────────────────
   Chaque pièce est dessinée une fois dans un carré de 200 × 200, c'est-à-dire à
   l'échelle de son bloc de 2 × 2 cases. Chaque case n'affiche ensuite que sa
   fenêtre de 100 × 100 : les quatre quarts se recomposent en une forme continue.

   Le trait porte l'information de jeu :
     • face BRILLANTE (trait plein avec un liseré clair) -> rebond à 90° ;
     • face en POINTILLÉS                                 -> demi-tour à 180°.  */

const B = 200;          // côté du bloc en unités SVG
const M0 = 14, M1 = B - 14;   // marge intérieure du tracé

/** Sommets et faces du triangle, selon la position de l'angle droit. */
const TRIANGLE = {
  NW: { pts: [[M0, M0], [M1, M0], [M0, M1]], murs: [[M0, M0, M1, M0], [M0, M0, M0, M1]], hypo: [M1, M0, M0, M1] },
  NE: { pts: [[M1, M0], [M0, M0], [M1, M1]], murs: [[M1, M0, M0, M0], [M1, M0, M1, M1]], hypo: [M0, M0, M1, M1] },
  SE: { pts: [[M1, M1], [M1, M0], [M0, M1]], murs: [[M1, M1, M1, M0], [M1, M1, M0, M1]], hypo: [M1, M0, M0, M1] },
  SW: { pts: [[M0, M1], [M0, M0], [M1, M1]], murs: [[M0, M1, M0, M0], [M0, M1, M1, M1]], hypo: [M0, M0, M1, M1] }
};

/** Étoile à cinq branches, mise à l'échelle du bloc. */
const ETOILE_POINTS = [
  [100, 12], [121.2, 70.8], [183.6, 72.8], [134.2, 111.2], [151.8, 171.2],
  [100, 136], [48.2, 171.2], [65.8, 111.2], [16.4, 72.8], [78.8, 70.8]
].map((p) => p.join(',')).join(' ');

const trace = (pts) => pts.map((p) => p.join(',')).join(' ');

/**
 * SVG d'une pièce, ou du quart de pièce affiché dans une case.
 * @param {string} type  clé de M.FORMES
 * @param {string|null} orientation  coin de l'angle droit, pour le triangle
 * @param {string|null} part  quart affiché ; null = la pièce entière (palettes, légendes)
 */
function svgForme(type, orientation = null, part = null) {
  const c = M.CSS_COULEURS[M.FORMES[type].couleur];
  const [dy, dx] = part ? M.DECALAGE[part] : [0, 0];
  const vue = part ? `${dx * 100} ${dy * 100} 100 100` : `0 0 ${B} ${B}`;
  const classe = 'svg-forme' + (part ? ' svg-plein' : '');

  // Une face qui renvoie à 90° : trait plein, avec un liseré clair qui la fait briller.
  const miroir = ([x1, y1, x2, y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="20" stroke-linecap="round"/>
     <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-opacity=".62" stroke-width="6" stroke-linecap="round"/>`;
  // Une face qui renvoie à 180°, comme un mur : trait en pointillés.
  const mur = ([x1, y1, x2, y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="18"
       stroke-linecap="butt" stroke-dasharray="21 15"/>`;

  let contenu;
  switch (type) {
    case 'triangle': {
      const t = TRIANGLE[orientation] || TRIANGLE.NW;
      contenu = `<polygon points="${trace(t.pts)}" fill="${c}" fill-opacity=".26"/>
        ${t.murs.map(mur).join('')}${miroir(t.hypo)}`;
      break;
    }
    case 'carre':
      // Les quatre faces sont des murs : contour entièrement en pointillés.
      contenu = `<rect x="${M0}" y="${M0}" width="${M1 - M0}" height="${M1 - M0}" rx="16"
        fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="18" stroke-dasharray="21 15"/>`;
      break;
    case 'losange': {
      // Les quatre faces sont des miroirs : contour brillant.
      const pts = trace([[100, 10], [190, 100], [100, 190], [10, 100]]);
      contenu = `<polygon points="${pts}" fill="${c}" fill-opacity=".3"
          stroke="${c}" stroke-width="20" stroke-linejoin="round"/>
        <polygon points="${pts}" fill="none" stroke="#ffffff" stroke-opacity=".55"
          stroke-width="6" stroke-linejoin="round"/>`;
      break;
    }
    case 'etoile':
      // Aucune face n'agit : ni pointillés, ni éclat, le laser passe.
      contenu = `<polygon points="${ETOILE_POINTS}" fill="${c}" fill-opacity=".42"
        stroke="${c}" stroke-width="9" stroke-linejoin="round"/>`;
      break;
    default:
      return '';
  }
  return `<svg class="${classe}" viewBox="${vue}" aria-hidden="true" focusable="false">${contenu}</svg>`;
}

/** SVG de la case occupée (chaque case connaît le quart qu'elle représente). */
const svgDe = (f) => svgForme(f.type, f.orientation ?? null, f.part ?? null);

/** Variantes affichables d'un type : [null], ou les quatre orientations du triangle. */
const variantesDe = (type) => (M.FORMES[type].orientable ? M.COINS : [null]);

/** Pastille colorée + nom de la couleur. */
function pastille(couleur) {
  return `<span class="pastille" style="background:${M.CSS_COULEURS[couleur]}"></span><strong>${couleur}</strong>`;
}

const ECRANS = ['menu', 'regles', 'config', 'placement', 'passage', 'tour', 'fin', 'labo'];
function montrer(nom) {
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
const plateauxVisibles = new Map(); // élément -> taille
const TACTILE = window.matchMedia?.('(pointer: coarse)').matches ?? false;

function ajusterPlateau(el, taille) {
  const petit = el.classList.contains('petit');
  const dispo = Math.min((el.parentElement?.clientWidth || 520) - 4, petit ? 340 : 560);
  // Au doigt, les flèches de bord méritent une cible plus large qu'à la souris.
  const bord = petit ? 14 : (TACTILE ? (taille > 8 ? 26 : 30) : (taille > 8 ? 22 : 26));
  const min = petit ? 20 : 28;
  const max = petit ? 34 : 54;
  let cell = Math.floor((dispo - 2 * bord - (taille + 1) * 2) / taille);
  cell = Math.max(min, Math.min(max, cell));
  el.style.gridTemplateColumns = `${bord}px repeat(${taille}, ${cell}px) ${bord}px`;
  el.style.gridTemplateRows    = `${bord}px repeat(${taille}, ${cell}px) ${bord}px`;
  el.style.setProperty('--cell', cell + 'px');
  el.style.setProperty('--bord', bord + 'px');
}
function ajusterTous() {
  for (const [el, taille] of plateauxVisibles) if (el.offsetParent !== null) ajusterPlateau(el, taille);
}
window.addEventListener('resize', ajusterTous);
window.addEventListener('orientationchange', () => setTimeout(ajusterTous, 120));
for (const d of $$('details.bloc')) d.addEventListener('toggle', ajusterTous);

const SYMBOLES = { haut: '▼', bas: '▲', gauche: '▶', droite: '◀' };

/**
 * Construit un plateau taille×taille entouré de ses boutons de bord.
 * @returns {{cases: HTMLElement[][], bords: Object}}
 */
function construirePlateau(el, taille, { surCase = null, surBord = null, coords = true } = {}) {
  el.innerHTML = '';
  const cases = [];
  const bords = { haut: [], bas: [], gauche: [], droite: [] };

  for (let gr = 0; gr <= taille + 1; gr++) {
    for (let gc = 0; gc <= taille + 1; gc++) {
      const surBordR = gr === 0 || gr === taille + 1;
      const surBordC = gc === 0 || gc === taille + 1;

      if (surBordR && surBordC) {
        const coin = document.createElement('div');
        coin.className = 'coin';
        el.appendChild(coin);
        continue;
      }

      if (surBordR || surBordC) {
        let cote, index;
        if (gr === 0) { cote = 'haut'; index = gc; }
        else if (gr === taille + 1) { cote = 'bas'; index = gc; }
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

  plateauxVisibles.set(el, taille);
  ajusterPlateau(el, taille);
  return { cases, bords };
}

/** Peint les formes d'une grille sur un plateau construit. */
function peindreFormes(cases, taille, grille) {
  for (let r = 0; r < taille; r++) for (let c = 0; c < taille; c++) {
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
  triangle: 'Bloc de <strong>2 × 2 cases</strong>, quatre orientations désignées par le coin où se '
    + 'trouve l\'angle droit. Ses <strong>trois faces agissent</strong>, mais différemment : '
    + 'l\'<strong>hypoténuse</strong> (la face brillante) renvoie le laser à 90°, les deux '
    + '<strong>cathètes</strong> (les faces en pointillés) le renvoient à 180°, comme un carré. '
    + 'Le quart opposé à l\'angle droit est hors du triangle : le laser le traverse sans être teinté.',
  carre:    'Bloc de <strong>2 × 2 cases</strong>. Ses quatre faces sont des murs : le laser repart '
    + 'toujours exactement d\'où il vient, quel que soit le bord par lequel il entre.',
  losange:  'Bloc de <strong>2 × 2 cases</strong>. Ses quatre faces sont des miroirs, chacune sur sa '
    + 'propre case : on sait donc toujours laquelle a été touchée. Le laser rebondit à 90° et ne '
    + 'traverse jamais.',
  etoile:   '<strong>Une seule case</strong> — elle ne dévie rien, il n\'y a aucune face à identifier. '
    + 'Le laser la <strong>traverse tout droit</strong> et en ressort teinté de magenta, une couleur '
    + 'qu\'aucune autre forme ne produit. C\'est le piège du jeu : le magenta prouve qu\'une étoile est '
    + 'sur la trajectoire, sans rien dire de l\'endroit.'
};

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
const DEFAUT = { taille: 8, counts: { triangle: 2, carre: 1, losange: 1, etoile: 1 } };
let cfgBrouillon = { taille: DEFAUT.taille, counts: { ...DEFAUT.counts } };
let S = null;

function creerJoueur(nom) {
  return {
    nom,
    grille: new Map(),   // ses propres formes cachées
    trouve: new Map(),   // formes de l'adversaire qu'il a correctement annoncées
    rates: new Set(),    // cases où il a raté un call (mémo privé)
    marques: {},         // 'cote:index' -> { n, couleur }
    journal: [],         // toutes ses actions
    recap: null,         // actions de son tour précédent
    nbTirs: 0
  };
}

function nouvellePartie(cfg) {
  S = {
    cfg: { taille: cfg.taille, counts: { ...cfg.counts }, noms: [...cfg.noms] },
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

/** Nombre de pièces adverses correctement annoncées (un losange = 1 pièce, 4 cases). */
const nbTrouve = (joueur) => new Set([...joueur.trouve.values()].map((v) => v.id)).size;

/* ───────────────────────── Sauvegarde automatique ─────────────────────────
   Une partie se joue sur un seul appareil, souvent un téléphone : verrouillage
   de l'écran, appel entrant ou onglet rechargé ne doivent pas faire perdre la
   partie. On sérialise l'état complet après chaque action. */
const CLE_SAUVEGARDE = 'lasers-formes/partie/v2';

function sauver() {
  if (!S) return;
  try {
    localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({
      v: 2,
      cfg: S.cfg, total: S.total, courant: S.courant, agit: S.agit,
      numeroTour: S.numeroTour, phase: S.phase, placementIndex: S.placementIndex,
      passage: S.passage, actionsTour: S.actionsTour, resultat: S.resultat,
      joueurs: S.joueurs.map((j) => ({
        nom: j.nom, grille: [...j.grille], trouve: [...j.trouve], rates: [...j.rates],
        marques: j.marques, journal: j.journal, recap: j.recap, nbTirs: j.nbTirs
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
    return (d && d.v === 2 && Array.isArray(d.joueurs) && d.joueurs.length === 2) ? d : null;
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
      journal: j.journal || [],
      recap: j.recap || null,
      nbTirs: j.nbTirs || 0
    }))
  };
  if (S.phase === 'passage' && S.passage) allerPassage(S.passage.nom, S.passage.note, S.passage.suite);
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
  for (const b of $$('#cfg-taille .seg')) b.classList.toggle('actif', +b.dataset.taille === cfgBrouillon.taille);

  $('#cfg-inventaire').innerHTML = M.ORDRE_FORMES.map((type) => {
    const d = M.FORMES[type];
    return `<div class="inv-ligne">
      <span class="inv-glyphe">${svgForme(type, d.orientable ? M.COINS[0] : null)}</span>
      <span class="inv-nom">${d.nom}<small>teinte ${d.couleur} · ${M.emprise(type) > 1 ? 'bloc 2 × 2' : '1 case'}</small></span>
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
  const trop = cases > plafond;
  $('#cfg-total').innerHTML = total === 0
    ? '<span class="avert">Il faut au moins une forme par joueur.</span>'
    : trop
      ? `<span class="avert">${cases} cases occupées : c'est trop pour une grille
         ${cfgBrouillon.taille}×${cfgBrouillon.taille} (maximum ${plafond}). Chaque bloc en occupe 4.</span>`
      : `<strong>${pluriel(total, 'forme')}</strong> à cacher (${cases} cases sur ${plafond} disponibles)
         — et donc <strong>${pluriel(total, 'call')}</strong> à réussir pour gagner.`;
  $('#cfg-lancer').disabled = total === 0 || trop;
}

/** Le plateau doit rester majoritairement vide pour que la déduction ait du sens. */
const plafondCases = () => Math.floor(cfgBrouillon.taille * cfgBrouillon.taille * 0.45);

/** Combien de pièces de ce type peut-on encore ajouter sans dépasser le plafond ? */
function maxParForme(type) {
  const autres = M.cellulesRequises({ ...cfgBrouillon.counts, [type]: 0 });
  return Math.min(12, Math.floor((plafondCases() - autres) / M.emprise(type)));
}

for (const b of $$('#cfg-taille .seg')) {
  b.addEventListener('click', () => {
    cfgBrouillon.taille = +b.dataset.taille;
    // Réduire la grille peut rendre l'inventaire trop encombrant : on le rogne.
    for (const type of [...M.ORDRE_FORMES].reverse()) {
      cfgBrouillon.counts[type] = Math.max(0, Math.min(cfgBrouillon.counts[type], maxParForme(type)));
    }
    rendreConfig();
  });
}

$('#cfg-lancer').addEventListener('click', () => {
  const noms = [$('#nom1').value.trim() || 'Joueur 1', $('#nom2').value.trim() || 'Joueur 2'];
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
  placement.plateau = construirePlateau($('#place-plateau'), S.cfg.taille, { surCase: clicPlacement });
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
      placement.outil = M.FORMES[type].orientable ? { type, orientation: M.COINS[0] } : { type };
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
    // n'importe quel autre clic retire la pièce entière (les 4 cases d'un losange).
    if (outil && outil.type === 'triangle' && presente.type === 'triangle') {
      const coin = (presente.orientation === outil.orientation)
        ? M.pivoterTriangle(grille, r, c)
        : M.orienterTriangle(grille, r, c, outil.orientation);
      placement.outil = { type: 'triangle', orientation: coin };
    } else {
      M.retirerPiece(grille, r, c);
    }
  } else if (outil && stockRestant()[outil.type] > 0) {
    // Un losange posé près d'un bord se recale pour tenir entièrement dans la grille.
    const [ar, ac] = M.ancreValide(outil.type, S.cfg.taille, r, c);
    const pose = M.poserPiece(grille, S.cfg.taille, outil.type, ar, ac, outil.orientation ?? null);
    if (!pose) {
      $('#place-etat').innerHTML =
        `<span class="avert">Pas la place ici : ${M.FORMES[outil.type].nom.toLowerCase()} occupe un bloc de 2 × 2 cases libres.</span>`;
      return;
    }
    if (stockRestant()[outil.type] === 0) choisirOutilDisponible();
  }
  rendrePlacement();
}

function rendrePlacement() {
  const joueur = S.joueurs[placement.i];
  const reste = stockRestant();
  const outil = placement.outil;

  const boutons = [];
  for (const type of M.ORDRE_FORMES) {
    for (const o of variantesDe(type)) {
      const actif = outil && outil.type === type && (o === null || outil.orientation === o);
      boutons.push(`<button class="pal-btn ${actif ? 'actif' : ''} ${reste[type] <= 0 ? 'epuise' : ''}"
        type="button" data-type="${type}" ${o ? `data-orientation="${o}"` : ''}
        aria-label="${libelleLong(type, o)}" title="${libelleLong(type, o)}">
        <span class="pal-glyphe">${svgForme(type, o)}</span>
        <span class="pal-reste">${reste[type]} / ${S.cfg.counts[type]}</span></button>`);
    }
  }
  $('#place-palette').innerHTML = boutons.join('');
  for (const b of $$('#place-palette .pal-btn')) {
    b.addEventListener('click', () => {
      const type = b.dataset.type;
      placement.outil = M.FORMES[type].orientable
        ? { type, orientation: b.dataset.orientation } : { type };
      rendrePlacement();
    });
  }

  peindreFormes(placement.plateau.cases, S.cfg.taille, joueur.grille);

  const pose = M.compterPieces(joueur.grille);
  const total = S.total;
  $('#place-etat').innerHTML = pose === total
    ? '✅ Toutes tes formes sont posées. Clique une forme posée pour la retirer, ou un triangle pour le pivoter.'
    : `${pose} / ${total} posées — sélectionne une forme puis clique une case.`;
  $('#place-valider').disabled = pose !== total;
}

$('#place-alea').addEventListener('click', () => {
  const j = S.joueurs[placement.i];
  j.grille = M.placementAleatoire(S.cfg.taille, S.cfg.counts);
  choisirOutilDisponible();
  rendrePlacement();
});
$('#place-vide').addEventListener('click', () => {
  S.joueurs[placement.i].grille.clear();
  choisirOutilDisponible();
  rendrePlacement();
});
$('#place-valider').addEventListener('click', () => {
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

  plateauTour = construirePlateau($('#tour-plateau'), S.cfg.taille, {
    surCase: clicCall,
    surBord: clicTir
  });

  // Grille personnelle, consultable à la demande.
  $('#tour-magrille-boite').open = false;
  const perso = construirePlateau($('#tour-magrille'), S.cfg.taille, {});
  peindreFormes(perso.cases, S.cfg.taille, joueur.grille);

  $('#tour-melanges').innerHTML = htmlMelanges();
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
      <span class="g">${svgForme(t, d.orientable ? M.COINS[0] : null)}</span>${d.nom} × ${reste}</span>`;
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
  const dejaVu = joueur.marques[`${cote}:${index}`];
  if (dejaVu) {
    ouvrirModale({
      titre: 'Bord déjà connu',
      corps: `<p>Ce bord porte déjà la marque du tir n°${dejaVu.n} (${pastille(dejaVu.couleur)}).
        Un laser étant réversible, tirer ici te redonnera exactement la même information.</p>
        <p class="avert">Tu perdrais ton tour pour rien.</p>`,
      actions: [
        { texte: 'Annuler', onClic: fermerModale },
        { texte: 'Tirer quand même', classe: 'danger', onClic: () => { fermerModale(); executerTir(cote, index); } }
      ]
    });
    return;
  }
  executerTir(cote, index);
}

function executerTir(cote, index) {
  const joueur = S.joueurs[S.courant];
  const cible = adversaireDe(S.courant);
  S.agit = true;
  verrouillerPlateau();

  const res = M.tirer(cible.grille, S.cfg.taille, cote, index);
  const n = ++joueur.nbTirs;

  const entree = plateauTour.bords[cote][index];
  entree.classList.add('surligne');

  // On n'affiche jamais le trajet : seule la sortie est révélée, après un court délai.
  setTimeout(() => {
    let html, resume;
    if (res.statut === 'sorti') {
      joueur.marques[`${cote}:${index}`] = { n, couleur: res.couleur };
      joueur.marques[`${res.coteSortie}:${res.indexSortie}`] = { n, couleur: res.couleur };
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

    afficherResultat(html, '', 'Terminer le tour — passer l\'appareil', 'fin');
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

  let choix = null;
  const corps = document.createElement('div');
  corps.innerHTML = `<p>Annonce la forme que tu penses trouver en <strong>${M.nomCase(r, c)}</strong>
    sur la grille de ${ech(adversaireDe(S.courant).nom)}.</p><div class="choix-formes"></div>
    <p class="avert">Si tu as raison, la forme est révélée et tu rejoues.
    Si tu te trompes, tu ne sauras rien de plus et le tour passe à l'adversaire.</p>`;

  const zone = $('.choix-formes', corps);
  for (const type of M.ORDRE_FORMES) {
    if (S.cfg.counts[type] === 0) continue;
    for (const o of variantesDe(type)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pal-btn';
      b.innerHTML = `<span class="pal-glyphe">${svgForme(type, o)}</span>
        <span class="pal-reste">${M.FORMES[type].nom}</span>`;
      b.setAttribute('aria-label', libelleLong(type, o));
      b.title = libelleLong(type, o);
      b.addEventListener('click', () => {
        choix = o ? { type, orientation: o } : { type };
        for (const autre of $$('.pal-btn', zone)) autre.classList.remove('actif');
        b.classList.add('actif');
        $('#modale-confirmer').disabled = false;
      });
      zone.appendChild(b);
    }
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
  const juste = M.memeForme(reelle, forme);
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
    `<h3>❌ Call raté</h3><p><strong>${nom}</strong> ne contient pas ${M.nomForme(forme)}.
     C'est la seule chose que tu apprends : ni la forme réelle, ni si la case est vide.</p>
     <p class="note">Et tu n'as pas tiré ce tour-ci : aucune information nouvelle sur la grille.</p>`,
    'ko', 'Terminer le tour — passer l\'appareil', 'fin');
}

/* ─────────────── Fin de tour ─────────────── */
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
    ? '📝 <strong>Note ton résultat</strong> avant de passer l\'appareil.'
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
  allerPassage(S.joueurs[S.courant].nom, 'Le tour est passé. Ne regarde que si c\'est bien toi.', 'tour');
}

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
  const p1 = construirePlateau($('#fin-plateau1'), S.cfg.taille, {});
  const p2 = construirePlateau($('#fin-plateau2'), S.cfg.taille, {});
  peindreFormes(p1.cases, S.cfg.taille, S.joueurs[0].grille);
  peindreFormes(p2.cases, S.cfg.taille, S.joueurs[1].grille);
  montrer('fin');
}

$('#fin-rejouer').addEventListener('click', () => {
  effacerSauvegarde();
  nouvellePartie({ taille: S.cfg.taille, counts: S.cfg.counts, noms: S.cfg.noms });
  lancerPlacement(0);
});

/* ═════════════════════════ LABORATOIRE (bac à sable solo) ═════════════════════════ */
const labo = { taille: 8, grille: new Map(), outil: { type: 'triangle', orientation: '\\' }, plateau: null, minuteurs: [], n: 0 };

function ouvrirLabo() {
  labo.plateau = construirePlateau($('#labo-plateau'), labo.taille, { surCase: clicLabo, surBord: tirLabo });
  $('#labo-melanges').innerHTML = htmlMelanges();
  rendreLabo();
  montrer('labo');
}

function clicLabo(r, c) {
  effacerRayons();
  const presente = labo.grille.get(M.cle(r, c));
  if (labo.outil === 'gomme' || (presente && !(presente.type === 'triangle' && labo.outil.type === 'triangle'))) {
    M.retirerPiece(labo.grille, r, c);
  } else if (presente) {
    const coin = (presente.orientation === labo.outil.orientation)
      ? M.pivoterTriangle(labo.grille, r, c)
      : M.orienterTriangle(labo.grille, r, c, labo.outil.orientation);
    labo.outil = { type: 'triangle', orientation: coin };
  } else {
    const [ar, ac] = M.ancreValide(labo.outil.type, labo.taille, r, c);
    M.poserPiece(labo.grille, labo.taille, labo.outil.type, ar, ac, labo.outil.orientation ?? null);
  }
  rendreLabo();
}

function rendreLabo() {
  const boutons = [];
  for (const type of M.ORDRE_FORMES) {
    for (const o of variantesDe(type)) {
      const actif = labo.outil !== 'gomme' && labo.outil.type === type && (o === null || labo.outil.orientation === o);
      boutons.push(`<button class="pal-btn ${actif ? 'actif' : ''}" type="button" data-type="${type}"
        ${o ? `data-orientation="${o}"` : ''} aria-label="${libelleLong(type, o)}" title="${libelleLong(type, o)}">
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
      else labo.outil = M.FORMES[type].orientable
        ? { type, orientation: b.dataset.orientation } : { type };
      rendreLabo();
    });
  }
  peindreFormes(labo.plateau.cases, labo.taille, labo.grille);
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
  const res = M.tirer(labo.grille, labo.taille, cote, index);
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

$('#labo-alea').addEventListener('click', () => {
  effacerRayons();
  labo.grille = M.placementAleatoire(labo.taille, { triangle: 4, carre: 2, losange: 1, etoile: 1 });
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
