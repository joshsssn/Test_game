import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tirer, melanger, cle, nomCase, memeForme, nomForme, placementAleatoire,
  poserPiece, retirerPiece, varianteSuivante, changerVariante, compterPieces,
  inventairePose, placeLibre, ancreValide, casesDeLaPiece, caseInerte,
  nouvelleDirection, estCaseDeCall, totalPieces, cellulesRequises, devierTriangle,
  dim, bordsDuCote, emprise, variantesDe, couleurDe, appliquerTeinte,
  COINS, MODES_ETOILE, MELANGES, CSS_COULEURS, FORMES, ORDRE_FORMES
} from '../js/moteur.js';

const D8 = dim(8);

/** Petite grille de test : liste de [type, r, c, variante?]. */
function grilleDe(pieces, d = D8) {
  const g = new Map();
  for (const [type, r, c, v] of pieces) {
    assert.ok(poserPiece(g, d, type, r, c, v), `pose impossible : ${type} en ${r},${c}`);
  }
  return g;
}

const sortie = (r) => `${r.coteSortie} ${r.indexSortie}`;

/* ───────────────────────── Propagation de base ───────────────────────── */

test('grille vide : le laser traverse et ressort blanc en face', () => {
  const r = tirer(new Map(), D8, 'gauche', 3);
  assert.equal(r.statut, 'sorti');
  assert.equal(sortie(r), 'droite 3');
  assert.equal(r.couleur, 'blanc');
  assert.equal(r.etapes.length, 8);
});

test('les quatre bords partent dans le bon sens', () => {
  assert.deepEqual(
    ['gauche', 'droite', 'haut', 'bas'].map((c) => sortie(tirer(new Map(), D8, c, 5))),
    ['droite 5', 'gauche 5', 'bas 5', 'haut 5']
  );
});

/* ───────────────────────── Grilles de dimensions libres ───────────────────────── */

test('une grille rectangulaire se traverse dans les deux sens', () => {
  const d = dim(7, 18);                       // 7 lignes, 18 colonnes
  assert.equal(bordsDuCote(d, 'gauche'), 7);
  assert.equal(bordsDuCote(d, 'haut'), 18);
  const horizontal = tirer(new Map(), d, 'gauche', 4);
  assert.equal(sortie(horizontal), 'droite 4');
  assert.equal(horizontal.etapes.length, 18);
  const vertical = tirer(new Map(), d, 'haut', 15);
  assert.equal(sortie(vertical), 'bas 15');
  assert.equal(vertical.etapes.length, 7);
});

test('une pièce se pose et agit pareil sur une grille rectangulaire', () => {
  const d = dim(6, 20);
  const g = grilleDe([['carre', 2, 15]], d);
  assert.equal(tirer(g, d, 'gauche', 3).retour, true);
  assert.equal(placeLibre(g, d, 'carre', 5, 19), false);       // déborde en bas et à droite
  assert.deepEqual(ancreValide('carre', d, 5, 19), [4, 18]);
});

test('le moteur tient sur des grilles de 4 à 26 de côté', () => {
  for (const [l, c] of [[4, 4], [20, 20], [5, 26], [26, 5]]) {
    const d = dim(l, c);
    assert.equal(sortie(tirer(new Map(), d, 'haut', c)), `bas ${c}`);
    assert.equal(sortie(tirer(new Map(), d, 'gauche', l)), `droite ${l}`);
  }
});

/* ───────────────────────── Toutes les emprises ───────────────────────── */

test('triangle, carré et losange font 2 × 2 ; l\'étoile une seule case', () => {
  for (const type of ORDRE_FORMES) {
    const g = grilleDe([[type, 2, 2, variantesDe(type)[0]]]);
    const attendu = type === 'etoile' ? 1 : 4;
    assert.equal(emprise(type), attendu, type);
    assert.equal(g.size, attendu, type);
    assert.equal(compterPieces(g), 1, type);
    assert.deepEqual(inventairePose(g), { [type]: 1 }, type);
  }
  assert.deepEqual(casesDeLaPiece(grilleDe([['losange', 2, 2]]), 3, 3).sort(),
    ['2,2', '2,3', '3,2', '3,3']);
});

test('une pièce ne peut ni déborder ni chevaucher', () => {
  const g = grilleDe([['carre', 2, 2]]);
  assert.equal(placeLibre(g, D8, 'carre', 7, 7), false);
  assert.equal(placeLibre(g, D8, 'carre', 3, 3), false);
  assert.equal(placeLibre(g, D8, 'carre', 4, 4), true);
  assert.equal(placeLibre(g, D8, 'etoile', 7, 7), true);
  assert.equal(placeLibre(g, D8, 'etoile', 3, 3), false);
  assert.deepEqual(ancreValide('carre', D8, 7, 7), [6, 6]);
  assert.deepEqual(ancreValide('etoile', D8, 7, 7), [7, 7]);
});

test('retirerPiece enlève les quatre cases d\'un bloc d\'un coup', () => {
  const g = grilleDe([['losange', 2, 2], ['etoile', 6, 6]]);
  assert.equal(retirerPiece(g, 3, 3), true);
  assert.equal(g.size, 1);
  assert.equal(compterPieces(g), 1);
});

/* ───────────────────────── On annonce toujours la case en bas à gauche ───────────────────────── */

test('un bloc ne s\'annonce que sur son quart en bas à gauche', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);          // cases (2,2) (2,3) (3,2) (3,3)
  assert.equal(estCaseDeCall(g.get(cle(3, 2))), true);     // bas à gauche
  for (const k of [cle(2, 2), cle(2, 3), cle(3, 3)]) {
    assert.equal(estCaseDeCall(g.get(k)), false, k);
  }
});

test('la case de call reste la même quelle que soit l\'orientation, même si le triangle n\'y est pas', () => {
  for (const coin of COINS) {
    const g = grilleDe([['triangle', 2, 2, coin]]);
    assert.equal(estCaseDeCall(g.get(cle(3, 2))), true, coin);
  }
  // Angle droit en NE : le quart en bas à gauche est justement le quart inerte,
  // et c'est pourtant bien là qu'il faut cliquer.
  const g = grilleDe([['triangle', 2, 2, 'NE']]);
  assert.equal(caseInerte(g.get(cle(3, 2))), true);
  assert.equal(estCaseDeCall(g.get(cle(3, 2))), true);
});

test('l\'étoile ne fait qu\'une case, qui est donc sa case de call', () => {
  const g = grilleDe([['etoile', 4, 4]]);
  assert.equal(estCaseDeCall(g.get(cle(4, 4))), true);
});

/* ───────────────────────── Le triangle et ses trois faces ───────────────────────── */

test('triangle : l\'hypoténuse renvoie à 90°, les cathètes font faire demi-tour', () => {
  assert.equal(devierTriangle('SW', 'E'), 'W');   // entré par l'Ouest -> cathète
  assert.equal(devierTriangle('SW', 'N'), 'S');   // entré par le Sud  -> cathète
  assert.equal(devierTriangle('SW', 'S'), 'E');   // entré par le Nord -> hypoténuse
  assert.equal(devierTriangle('SW', 'W'), 'N');   // entré par l'Est   -> hypoténuse
});

test('triangle NW : cathètes au nord et à l\'ouest, hypoténuse pour le reste', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  for (const [cote, i] of [['haut', 3], ['haut', 4], ['gauche', 3], ['gauche', 4]]) {
    assert.equal(tirer(g, D8, cote, i).retour, true, `${cote} ${i}`);
  }
  assert.equal(sortie(tirer(g, D8, 'bas', 3)), 'droite 4');
  assert.equal(sortie(tirer(g, D8, 'droite', 3)), 'bas 4');
});

test('le quart opposé à l\'angle droit ne dévie ni ne teinte', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(caseInerte(g.get(cle(3, 3))), true);
  assert.equal(nouvelleDirection(g.get(cle(3, 3)), 'S'), 'S');
  for (const k of ['2,2', '2,3', '3,2']) assert.equal(caseInerte(g.get(k)), false, k);
});

test('les quatre orientations du triangle sont toutes distinctes', () => {
  const signatures = COINS.map((coin) => {
    const g = grilleDe([['triangle', 3, 3, coin]]);
    return ['gauche', 'droite', 'haut', 'bas']
      .flatMap((c) => [4, 5].map((i) => sortie(tirer(g, D8, c, i)))).join('|');
  });
  assert.equal(new Set(signatures).size, 4);
});

/* ───────────────────────── Carré et losange ───────────────────────── */

test('carré : tout tir repart par où il est entré, sur les quatre faces', () => {
  const g = grilleDe([['carre', 2, 2]]);
  for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
    for (const i of [3, 4]) {
      const r = tirer(g, D8, cote, i);
      assert.equal(r.retour, true, `${cote} ${i}`);
      assert.equal(r.couleur, 'rouge');
    }
  }
});

test('losange : ses quatre faces renvoient à 90°, vers quatre sorties distinctes', () => {
  const g = grilleDe([['losange', 2, 2]]);
  assert.equal(sortie(tirer(g, D8, 'gauche', 3)), 'haut 3');
  assert.equal(sortie(tirer(g, D8, 'gauche', 4)), 'bas 3');
  assert.equal(sortie(tirer(g, D8, 'droite', 3)), 'haut 4');
  assert.equal(sortie(tirer(g, D8, 'droite', 4)), 'bas 4');
});

test('le laser n\'entre jamais dans le corps du losange', () => {
  const g = grilleDe([['losange', 3, 3]]);
  const bloc = new Set(['3,3', '3,4', '4,3', '4,4']);
  for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
    for (let i = 1; i <= 8; i++) {
      const dedans = tirer(g, D8, cote, i).etapes.filter((e) => bloc.has(`${e.r},${e.c}`));
      assert.ok(dedans.length <= 1, `${cote} ${i} traverse ${dedans.length} cases`);
    }
  }
});

/* ───────────────────────── Les trois modes de l'étoile ─────────────────────────
   Le mode est une règle de la partie, la même pour les deux joueurs. */

test('aucun mode d\'étoile ne dévie le laser', () => {
  const g = grilleDe([['etoile', 2, 4]]);
  for (const mode of MODES_ETOILE) {
    assert.equal(sortie(tirer(g, D8, 'gauche', 3, mode)), 'droite 3', mode);
  }
});

test('mode simple : la teinte magenta s\'ajoute au mélange', () => {
  const g = grilleDe([['etoile', 2, 4]]);
  assert.equal(tirer(g, D8, 'gauche', 3, 'simple').couleur, 'magenta');
  // étoile puis carré : magenta + rouge
  const g2 = grilleDe([['etoile', 2, 1], ['carre', 2, 4]]);
  assert.equal(tirer(g2, D8, 'gauche', 3, 'simple').couleur, 'bordeaux');
});

test('mode dominante : bleu + magenta + rouge donne magenta + rouge', () => {
  const etat = { teintes: new Set(['bleu']), verrouille: false };
  appliquerTeinte(etat, { type: 'etoile' }, 'dominante');
  assert.deepEqual([...etat.teintes], ['magenta']);          // le bleu a disparu
  appliquerTeinte(etat, { type: 'carre' }, 'dominante');
  assert.equal(melanger(etat.teintes), 'bordeaux');          // le rouge, lui, prend
});

test('mode dominante : une étoile retraversée efface aussi ce qui vient après elle', () => {
  // Le carré renvoie le laser sur l'étoile : au retour, elle efface le rouge.
  const g = grilleDe([['etoile', 2, 1], ['carre', 2, 4]]);
  assert.equal(tirer(g, D8, 'gauche', 3, 'dominante').couleur, 'magenta');
  assert.equal(tirer(g, D8, 'gauche', 3, 'simple').couleur, 'bordeaux');
});

test('mode blanche : le laser devient blanc et le reste quoi qu\'il arrive', () => {
  const g = grilleDe([['etoile', 2, 1], ['carre', 2, 4]]);
  const r = tirer(g, D8, 'gauche', 3, 'blanche');
  assert.equal(r.couleur, 'blanc');
  assert.equal(r.retour, true);                              // le trajet ne change pas
});

test('mode blanche : le verrou tient dans les deux sens du tir', () => {
  // Ligne 3 : étoile, carré, étoile — le laser croise une étoile avant le carré
  // quel que soit le bord d'entrée, donc il ressort blanc des deux côtés.
  const g = grilleDe([['etoile', 2, 1], ['carre', 2, 3], ['etoile', 2, 6]]);
  assert.equal(tirer(g, D8, 'gauche', 3, 'blanche').couleur, 'blanc');
  assert.equal(tirer(g, D8, 'droite', 3, 'blanche').couleur, 'blanc');
  assert.equal(tirer(g, D8, 'gauche', 3, 'simple').couleur, 'bordeaux');
});

test('le mode ne change ni le trajet ni la forme à annoncer', () => {
  const g = grilleDe([['etoile', 2, 4], ['losange', 5, 5]]);
  const trajets = MODES_ETOILE.map((m) =>
    ['gauche', 'droite', 'haut', 'bas'].flatMap((c) => [3, 6].map((i) => sortie(tirer(g, D8, c, i, m)))).join('|'));
  assert.equal(new Set(trajets).size, 1);
  assert.equal(FORMES.etoile.variantes, null);
  assert.equal(nomForme({ type: 'etoile' }), 'Étoile');
  assert.equal(couleurDe('etoile', 'blanche'), 'blanc');
  assert.equal(couleurDe('etoile', 'dominante'), 'magenta');
  assert.equal(couleurDe('carre', 'blanche'), 'rouge');
});

/* ───────────────────────── Couleurs ───────────────────────── */

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

test('les quatre teintes ensemble donnent noir', () => {
  const g = grilleDe([
    ['triangle', 3, 5, 'NE'], ['carre', 3, 0], ['losange', 6, 5], ['etoile', 6, 1]
  ]);
  const r = tirer(g, D8, 'gauche', 7);
  assert.equal(r.couleur, 'noir');
  assert.equal(r.retour, true);
});

/* ───────────────────────── Invariants du moteur ───────────────────────── */

const INVENTAIRE = { triangle: 2, carre: 1, losange: 1, etoile: 2 };

test('aucun tir ne peut boucler : le laser ressort toujours', () => {
  for (let essai = 0; essai < 250; essai++) {
    const grille = placementAleatoire(D8, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 8; i++) assert.equal(tirer(grille, D8, cote, i).statut, 'sorti');
    }
  }
});

test('le TRAJET reste réversible : tirer depuis la sortie ramène à l\'entrée', () => {
  for (let essai = 0; essai < 80; essai++) {
    const grille = placementAleatoire(D8, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 8; i++) {
        const aller = tirer(grille, D8, cote, i);
        assert.equal(sortie(tirer(grille, D8, aller.coteSortie, aller.indexSortie)), `${cote} ${i}`);
      }
    }
  }
});

test('en mode dominante, la COULEUR peut dépendre du sens du tir', () => {
  const g = grilleDe([
    ['triangle', 1, 6, 'NE'], ['triangle', 2, 0, 'NE'], ['carre', 3, 4],
    ['losange', 2, 2], ['etoile', 7, 7], ['etoile', 0, 6]
  ]);
  const aller = tirer(g, D8, 'haut', 4, 'dominante');
  const retour = tirer(g, D8, aller.coteSortie, aller.indexSortie, 'dominante');
  assert.equal(sortie(aller), 'bas 8');
  assert.equal(sortie(retour), 'haut 4');                    // même trajet
  assert.equal(aller.couleur, 'magenta');
  assert.equal(retour.couleur, 'olive');                     // mais pas la même couleur
});

test('en mode simple, la couleur est symétrique comme le trajet', () => {
  for (let essai = 0; essai < 80; essai++) {
    const grille = placementAleatoire(D8, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 8; i++) {
        const aller = tirer(grille, D8, cote, i, 'simple');
        const retour = tirer(grille, D8, aller.coteSortie, aller.indexSortie, 'simple');
        assert.equal(retour.couleur, aller.couleur);
      }
    }
  }
});

test('chaque case occupée applique une permutation des directions', () => {
  const grille = placementAleatoire(D8, { triangle: 4, carre: 2, losange: 2, etoile: 1 });
  for (const cellule of grille.values()) {
    const images = ['N', 'S', 'E', 'W'].map((d) => nouvelleDirection(cellule, d));
    assert.equal(new Set(images).size, 4, JSON.stringify(cellule));
  }
});

/* ───────────────────────── Inventaire et placement ───────────────────────── */

test('inventaire : 4 cases par bloc, 1 pour l\'étoile', () => {
  assert.equal(totalPieces(INVENTAIRE), 6);
  assert.equal(cellulesRequises(INVENTAIRE), 2 * 4 + 4 + 4 + 2);
});

test('nomCase suit la convention colonne-lettre / ligne-chiffre', () => {
  assert.equal(nomCase(0, 0), 'A1');
  assert.equal(nomCase(7, 7), 'H8');
  assert.equal(nomCase(19, 25), 'Z20');
});

test('memeForme exige la bonne variante', () => {
  assert.equal(memeForme({ type: 'triangle', variante: 'SW' }, { type: 'triangle', variante: 'SW' }), true);
  assert.equal(memeForme({ type: 'triangle', variante: 'SW' }, { type: 'triangle', variante: 'NE' }), false);
  assert.equal(memeForme({ type: 'carre' }, { type: 'carre' }), true);
  assert.equal(memeForme({ type: 'losange' }, { type: 'etoile' }), false);
  assert.equal(memeForme(null, { type: 'carre' }), false);
});

test('changerVariante et varianteSuivante agissent sur toute la pièce', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(varianteSuivante(g, 3, 3), 'NE');
  for (const v of g.values()) assert.equal(v.variante, 'NE');
  assert.equal(changerVariante(g, 2, 2, 'SE'), 'SE');
  for (const v of g.values()) assert.equal(v.variante, 'SE');

  assert.equal(varianteSuivante(grilleDe([['carre', 0, 0]]), 0, 0), null);
  assert.equal(varianteSuivante(grilleDe([['etoile', 5, 5]]), 5, 5), null);
});

test('placementAleatoire respecte l\'inventaire et ne superpose rien', () => {
  for (let i = 0; i < 250; i++) {
    const grille = placementAleatoire(D8, INVENTAIRE);
    assert.equal(grille.size, cellulesRequises(INVENTAIRE));
    assert.equal(compterPieces(grille), totalPieces(INVENTAIRE));
    const pose = inventairePose(grille);
    for (const t of ORDRE_FORMES) assert.equal(pose[t] || 0, INVENTAIRE[t], t);
    for (const v of grille.values()) {
      assert.equal(COINS.includes(v.part), !!FORMES[v.type].bloc, v.type);
      if (FORMES[v.type].variantes) assert.ok(FORMES[v.type].variantes.includes(v.variante));
    }
  }
});

test('placementAleatoire tient sur des grilles très différentes', () => {
  for (const [l, c, counts] of [
    [6, 6, { triangle: 2, carre: 1, losange: 1, etoile: 1 }],
    [20, 20, { triangle: 5, carre: 3, losange: 3, etoile: 2 }],
    [7, 18, { triangle: 3, carre: 2, losange: 2, etoile: 2 }]
  ]) {
    const d = dim(l, c);
    for (let i = 0; i < 80; i++) {
      assert.equal(compterPieces(placementAleatoire(d, counts)), totalPieces(counts));
    }
  }
});
