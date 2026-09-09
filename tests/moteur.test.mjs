import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tirer, melanger, cle, nomCase, memeForme, nomForme, placementAleatoire,
  poserPiece, retirerPiece, pivoterTriangle, compterPieces, inventairePose,
  placeLibre, ancreValide, casesDeLaPiece, caseInerte, nouvelleDirection,
  totalPieces, cellulesRequises, devierTriangle, COINS, emprise,
  MELANGES, CSS_COULEURS, FORMES, ORDRE_FORMES
} from '../js/moteur.js';

/** Petite grille de test : liste de [type, r, c, orientation?]. */
function grilleDe(pieces, taille = 8) {
  const g = new Map();
  for (const [type, r, c, o] of pieces) {
    assert.ok(poserPiece(g, taille, type, r, c, o), `pose impossible : ${type} en ${r},${c}`);
  }
  return g;
}

const sortie = (r) => `${r.coteSortie} ${r.indexSortie}`;

/* ───────────────────────── Propagation de base ───────────────────────── */

test('grille vide : le laser traverse et ressort blanc en face', () => {
  const r = tirer(new Map(), 8, 'gauche', 3);
  assert.equal(r.statut, 'sorti');
  assert.equal(sortie(r), 'droite 3');
  assert.equal(r.couleur, 'blanc');
  assert.equal(r.etapes.length, 8);
});

test('les quatre bords partent dans le bon sens', () => {
  assert.deepEqual(
    ['gauche', 'droite', 'haut', 'bas'].map((c) => sortie(tirer(new Map(), 8, c, 5))),
    ['droite 5', 'gauche 5', 'bas 5', 'haut 5']
  );
});

test('le moteur fonctionne sur des grilles 6 et 10', () => {
  for (const n of [6, 10]) {
    const r = tirer(new Map(), n, 'haut', n);
    assert.equal(sortie(r), `bas ${n}`);
    assert.equal(r.etapes.length, n);
  }
});

/* ───────────────────────── Toutes les pièces font 2 × 2 ───────────────────────── */

test('triangle, carré et losange occupent un bloc de 2 × 2 ; l\'étoile une seule case', () => {
  for (const type of ORDRE_FORMES) {
    const g = grilleDe([[type, 2, 2, 'NW']]);
    const attendu = type === 'etoile' ? 1 : 4;
    assert.equal(emprise(type), attendu, type);
    assert.equal(g.size, attendu, type);
    assert.equal(compterPieces(g), 1, type);
    assert.deepEqual(inventairePose(g), { [type]: 1 }, type);
  }
  const g = grilleDe([['losange', 2, 2]]);
  assert.deepEqual(casesDeLaPiece(g, 3, 3).sort(), ['2,2', '2,3', '3,2', '3,3']);
});

test('une pièce ne peut ni déborder ni chevaucher', () => {
  const g = grilleDe([['carre', 2, 2]]);
  assert.equal(placeLibre(g, 8, 'carre', 7, 7), false);    // déborde
  assert.equal(placeLibre(g, 8, 'carre', 3, 3), false);    // chevauche
  assert.equal(placeLibre(g, 8, 'carre', 4, 4), true);
  assert.equal(placeLibre(g, 8, 'etoile', 7, 7), true);    // l'étoile tient au bord
  assert.equal(placeLibre(g, 8, 'etoile', 3, 3), false);
  assert.deepEqual(ancreValide('carre', 8, 7, 7), [6, 6]);
  assert.deepEqual(ancreValide('etoile', 8, 7, 7), [7, 7]);
});

test('retirerPiece enlève les quatre cases d\'un bloc d\'un coup', () => {
  const g = grilleDe([['losange', 2, 2], ['etoile', 6, 6]]);
  assert.equal(retirerPiece(g, 3, 3), true);
  assert.equal(g.size, 1);
  assert.equal(compterPieces(g), 1);
});

test('pivoterTriangle tourne les quatre cases ensemble', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(pivoterTriangle(g, 3, 3), 'NE');
  for (const v of g.values()) assert.equal(v.orientation, 'NE');
  assert.equal(pivoterTriangle(g, 2, 2), 'SE');
  assert.equal(pivoterTriangle(g, 2, 2), 'SW');
  assert.equal(pivoterTriangle(g, 2, 2), 'NW');
  assert.equal(pivoterTriangle(g, 0, 0), null);
});

/* ───────────────────────── Le triangle et ses trois faces ───────────────────────── */

test('triangle : l\'hypoténuse renvoie à 90°, les cathètes font faire demi-tour', () => {
  // Angle droit en bas à gauche : cathètes le long des bords Sud et Ouest.
  assert.equal(devierTriangle('SW', 'E'), 'W');   // entré par l'Ouest -> cathète
  assert.equal(devierTriangle('SW', 'N'), 'S');   // entré par le Sud  -> cathète
  assert.equal(devierTriangle('SW', 'S'), 'E');   // entré par le Nord -> hypoténuse
  assert.equal(devierTriangle('SW', 'W'), 'N');   // entré par l'Est   -> hypoténuse
});

test('triangle NW : les deux cathètes renvoient tous les tirs du haut et de gauche', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  for (const [cote, i] of [['haut', 3], ['haut', 4], ['gauche', 3], ['gauche', 4]]) {
    const r = tirer(g, 8, cote, i);
    assert.equal(r.retour, true, `${cote} ${i}`);
    assert.equal(r.couleur, 'bleu');
  }
});

test('triangle NW : l\'hypoténuse dévie les tirs venus du bas et de droite', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(sortie(tirer(g, 8, 'bas', 3)), 'droite 4');
  assert.equal(sortie(tirer(g, 8, 'bas', 4)), 'droite 3');
  assert.equal(sortie(tirer(g, 8, 'droite', 3)), 'bas 4');
  assert.equal(sortie(tirer(g, 8, 'droite', 4)), 'bas 3');
});

test('triangle : le quart opposé à l\'angle droit est traversé sans teinte', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(caseInerte(g.get(cle(3, 3))), true);    // coin SE, hors du triangle
  for (const k of ['2,2', '2,3', '3,2']) assert.equal(caseInerte(g.get(k)), false, k);
  // Un tir rasant qui ne croise que le coin inerte ressort blanc.
  const g2 = grilleDe([['triangle', 2, 2, 'SW']]);     // coin inerte en NE, case (2,3)
  assert.equal(caseInerte(g2.get(cle(2, 3))), true);
  assert.equal(nouvelleDirection(g2.get(cle(2, 3)), 'S'), 'S');
});

test('les quatre orientations du triangle sont toutes distinctes', () => {
  const signatures = COINS.map((coin) => {
    const g = grilleDe([['triangle', 3, 3, coin]]);
    return ['gauche', 'droite', 'haut', 'bas']
      .flatMap((c) => [4, 5].map((i) => sortie(tirer(g, 8, c, i)))).join('|');
  });
  assert.equal(new Set(signatures).size, 4);
});

/* ───────────────────────── Le carré ───────────────────────── */

test('carré : tout tir repart par où il est entré, sur les quatre faces', () => {
  const g = grilleDe([['carre', 2, 2]]);
  for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
    for (const i of [3, 4]) {
      const r = tirer(g, 8, cote, i);
      assert.equal(r.retour, true, `${cote} ${i}`);
      assert.equal(r.couleur, 'rouge');
    }
  }
});

/* ───────────────────────── Le losange ───────────────────────── */

test('losange : chacune de ses quatre faces renvoie le laser à 90°', () => {
  const g = grilleDe([['losange', 2, 2]]);
  assert.equal(sortie(tirer(g, 8, 'gauche', 3)), 'haut 3');   // face NW
  assert.equal(sortie(tirer(g, 8, 'gauche', 4)), 'bas 3');    // face SW
  assert.equal(sortie(tirer(g, 8, 'droite', 3)), 'haut 4');   // face NE
  assert.equal(sortie(tirer(g, 8, 'droite', 4)), 'bas 4');    // face SE
});

test('losange : les quatre faces donnent quatre sorties distinctes', () => {
  const g = grilleDe([['losange', 2, 2]]);
  const sorties = [3, 4].flatMap((i) => ['gauche', 'droite'].map((c) => sortie(tirer(g, 8, c, i))));
  assert.equal(new Set(sorties).size, 4);
});

test('le laser n\'entre jamais dans le corps du losange', () => {
  const g = grilleDe([['losange', 3, 3]]);
  const bloc = new Set(['3,3', '3,4', '4,3', '4,4']);
  for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
    for (let i = 1; i <= 8; i++) {
      const dedans = tirer(g, 8, cote, i).etapes.filter((e) => bloc.has(`${e.r},${e.c}`));
      assert.ok(dedans.length <= 1, `${cote} ${i} traverse ${dedans.length} cases du losange`);
    }
  }
});

/* ───────────────────────── L'étoile ───────────────────────── */

test('étoile : traverse sans dévier et teinte en magenta', () => {
  const g = grilleDe([['etoile', 2, 4]]);
  const r = tirer(g, 8, 'gauche', 3);
  assert.equal(sortie(r), 'droite 3');
  assert.equal(r.couleur, 'magenta');
});

test('étoile : seule forme qui ne dévie jamais le laser', () => {
  for (const type of ORDRE_FORMES) {
    const g = grilleDe([[type, 2, 4, 'NW']]);
    const droit = ['gauche', 'droite', 'haut', 'bas'].every((c) =>
      [3].every((i) => {
        const r = tirer(g, 8, c, i);
        return r.coteSortie === { gauche: 'droite', droite: 'gauche', haut: 'bas', bas: 'haut' }[c];
      }));
    assert.equal(droit, type === 'etoile', type);
  }
});

/* ───────────────────────── Couleurs ───────────────────────── */

test('deux étoiles alignées : la teinte magenta ne compte qu\'une fois', () => {
  const r = tirer(grilleDe([['etoile', 2, 0], ['etoile', 2, 4]]), 8, 'gauche', 3);
  assert.equal(r.couleur, 'magenta');
});

test('étoile puis carré : magenta + rouge = bordeaux, et demi-tour', () => {
  const r = tirer(grilleDe([['etoile', 2, 0], ['carre', 2, 4]]), 8, 'gauche', 3);
  assert.equal(r.couleur, 'bordeaux');
  assert.equal(r.retour, true);
});

test('les quatre teintes ensemble donnent noir', () => {
  const g = grilleDe([
    ['triangle', 3, 5, 'NE'],
    ['carre', 3, 0],
    ['losange', 6, 5],
    ['etoile', 6, 1]
  ]);
  const r = tirer(g, 8, 'gauche', 7);
  assert.equal(r.couleur, 'noir');
  assert.equal(r.retour, true);
});

test('table des mélanges : 16 entrées distinctes, toutes avec une couleur CSS', () => {
  assert.equal(Object.keys(MELANGES).length, 16);
  for (const nom of Object.values(MELANGES)) assert.ok(CSS_COULEURS[nom], nom);
  assert.equal(new Set(Object.values(MELANGES)).size, 16);
  assert.equal(new Set(Object.values(CSS_COULEURS)).size, 16);
});

test('melanger est insensible à l\'ordre', () => {
  assert.equal(melanger(new Set(['rouge', 'bleu'])), 'violet');
  assert.equal(melanger(new Set(['bleu', 'rouge'])), 'violet');
});

/* ───────────────────────── Invariants du moteur ───────────────────────── */

const INVENTAIRE = { triangle: 2, carre: 1, losange: 1, etoile: 1 };

test('aucun tir ne peut boucler : le laser ressort toujours', () => {
  for (let essai = 0; essai < 300; essai++) {
    const grille = placementAleatoire(8, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 8; i++) assert.equal(tirer(grille, 8, cote, i).statut, 'sorti');
    }
  }
});

test('symétrie : un tir renvoyé par sa sortie revient à son entrée, même couleur', () => {
  for (let essai = 0; essai < 80; essai++) {
    const grille = placementAleatoire(8, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 8; i++) {
        const aller = tirer(grille, 8, cote, i);
        const retour = tirer(grille, 8, aller.coteSortie, aller.indexSortie);
        assert.equal(sortie(retour), `${cote} ${i}`);
        assert.equal(retour.couleur, aller.couleur);
      }
    }
  }
});

test('chaque case occupée applique une permutation des directions', () => {
  const grille = placementAleatoire(8, { triangle: 4, carre: 2, losange: 2, etoile: 1 });
  for (const cellule of grille.values()) {
    if (caseInerte(cellule)) continue;
    const images = ['N', 'S', 'E', 'W'].map((d) => nouvelleDirection(cellule, d));
    assert.equal(new Set(images).size, 4, JSON.stringify(cellule));
  }
});

/* ───────────────────────── Inventaire et placement ───────────────────────── */

test('inventaire : 4 cases par bloc, 1 pour l\'étoile', () => {
  assert.equal(totalPieces(INVENTAIRE), 5);
  assert.equal(cellulesRequises(INVENTAIRE), 2 * 4 + 4 + 4 + 1);
});

test('nomCase suit la convention colonne-lettre / ligne-chiffre', () => {
  assert.equal(nomCase(0, 0), 'A1');
  assert.equal(nomCase(7, 7), 'H8');
  assert.equal(nomCase(3, 2), 'C4');
});

test('memeForme exige la bonne orientation pour un triangle', () => {
  const a = { type: 'triangle', orientation: 'SW' };
  assert.equal(memeForme(a, { type: 'triangle', orientation: 'SW' }), true);
  assert.equal(memeForme(a, { type: 'triangle', orientation: 'NE' }), false);
  assert.equal(memeForme({ type: 'carre' }, { type: 'carre' }), true);
  assert.equal(memeForme({ type: 'losange' }, { type: 'etoile' }), false);
  assert.equal(memeForme(null, { type: 'carre' }), false);
});

test('nomForme décrit l\'orientation du triangle', () => {
  assert.equal(nomForme({ type: 'triangle', orientation: 'NW' }), 'Triangle ◤');
  assert.equal(nomForme({ type: 'etoile' }), 'Étoile');
  assert.equal(nomForme(null), 'case vide');
});

test('placementAleatoire respecte l\'inventaire et ne superpose rien', () => {
  for (let i = 0; i < 300; i++) {
    const grille = placementAleatoire(8, INVENTAIRE);
    assert.equal(grille.size, cellulesRequises(INVENTAIRE));
    assert.equal(compterPieces(grille), totalPieces(INVENTAIRE));
    const pose = inventairePose(grille);
    for (const t of ORDRE_FORMES) assert.equal(pose[t] || 0, INVENTAIRE[t], t);
    for (const v of grille.values()) {
      assert.equal(COINS.includes(v.part), FORMES[v.type].bloc, v.type);
      if (FORMES[v.type].orientable) assert.ok(COINS.includes(v.orientation));
    }
  }
});

test('placementAleatoire tient sur une grille 6 × 6 comme sur une 10 × 10', () => {
  for (const [taille, counts] of [[6, { triangle: 2, carre: 1, losange: 1, etoile: 0 }],
                                  [10, { triangle: 4, carre: 2, losange: 2, etoile: 1 }]]) {
    for (let i = 0; i < 120; i++) {
      assert.equal(compterPieces(placementAleatoire(taille, counts)), totalPieces(counts));
    }
  }
});
