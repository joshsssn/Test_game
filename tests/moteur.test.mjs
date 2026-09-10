import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tirer, melanger, cle, nomCase, memeForme, nomForme, placementAleatoire,
  poserPiece, retirerPiece, varianteSuivante, changerVariante, compterPieces,
  inventairePose, placeLibre, ancreValide, ancreDepuisReference, casesDeLaPiece,
  nouvelleDirection, estCaseDeCall, caseDeCall, decalageReference, decalageCall,
  totalPieces, cellulesRequises, devierTriangle, gabarit, emprise, encombrement,
  dim, bordsDuCote, variantesDe, couleurDe, appliquerTeinte, HYPOTENUSE,
  COINS, SENS_NAVETTE, MODES_ETOILE, MELANGES, CSS_COULEURS, BASES, FORMES, ORDRE_FORMES
} from '../js/moteur.js';

const D8 = dim(8);
const D10 = dim(10);

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

test('une grille rectangulaire se traverse dans les deux sens', () => {
  const d = dim(7, 18);
  assert.equal(bordsDuCote(d, 'gauche'), 7);
  assert.equal(bordsDuCote(d, 'haut'), 18);
  assert.equal(sortie(tirer(new Map(), d, 'gauche', 4)), 'droite 4');
  assert.equal(tirer(new Map(), d, 'gauche', 4).etapes.length, 18);
  assert.equal(sortie(tirer(new Map(), d, 'haut', 15)), 'bas 15');
});

/* ───────────────────────── Gabarits et emprises ───────────────────────── */

test('chaque forme occupe le nombre de cases attendu', () => {
  const attendu = { triangle: 3, carre: 4, losange: 4, navette: 4, etoile: 1 };
  for (const type of ORDRE_FORMES) {
    for (const v of variantesDe(type)) assert.equal(emprise(type, v), attendu[type], `${type}/${v}`);
  }
});

test('le triangle ne prend que trois cases : le quart opposé à l\'angle droit lui échappe', () => {
  for (const coin of COINS) {
    const g = grilleDe([['triangle', 2, 2, coin]]);
    assert.equal(g.size, 3, coin);
    assert.equal(encombrement('triangle', coin).h, 2);
    // Le quart opposé au coin est vide, et il est libre.
    const oppose = { NW: [3, 3], NE: [3, 2], SE: [2, 2], SW: [2, 3] }[coin];
    assert.equal(g.has(cle(...oppose)), false, `le creux de ${coin} doit rester libre`);
    assert.equal(poserPiece(g, D8, 'etoile', ...oppose), true, `une étoile doit tenir dans le creux de ${coin}`);
  }
});

test('une étoile logée dans le creux d\'un triangle teinte bien le laser', () => {
  const g = grilleDe([['triangle', 2, 2, 'NE']]);          // creux en (3,2)
  assert.ok(poserPiece(g, D8, 'etoile', 3, 2));
  const r = tirer(g, D8, 'bas', 3);
  assert.equal(r.couleur, 'indigo');                       // bleu du triangle + magenta de l'étoile
});

test('la navette : quatre cases en ligne, deux pleines et deux pointes', () => {
  assert.deepEqual(SENS_NAVETTE, ['v/', 'v\\', 'h/', 'h\\']);
  for (const sens of SENS_NAVETTE) {
    const g = gabarit('navette', sens);
    assert.equal(g.length, 4, sens);
    assert.equal(g.filter((x) => x.role === 'mur').length, 2, `${sens} : deux cases pleines`);
    const pointes = g.filter((x) => x.role === 'triangle');
    assert.equal(pointes.length, 2, `${sens} : deux pointes`);
    // Les deux pointes sont coupées sur la MÊME diagonale : c'est ce qui donne
    // à la pièce son allure penchée.
    assert.equal(new Set(pointes.map((p) => HYPOTENUSE[p.coin])).size, 1,
      `${sens} : les deux pointes doivent partager la même diagonale`);
    const e = encombrement('navette', sens);
    assert.deepEqual([e.h, e.l], sens.startsWith('v') ? [4, 1] : [1, 4], sens);
  }
});

test('les quatre variantes de la navette : un quart de tour, et le miroir', () => {
  const signature = (cases) =>
    cases.map((x) => `${x.dr},${x.dc},${x.role}${x.coin ?? ''}`).sort().join(' | ');
  const cellesDe = (sens) => signature(gabarit('navette', sens));

  // Un quart de tour envoie (dr, dc) sur (dc, H - 1 - dr).
  const tourner = (sens) => {
    const g = gabarit('navette', sens);
    const h = Math.max(...g.map((x) => x.dr)) + 1;
    const suivant = { NW: 'NE', NE: 'SE', SE: 'SW', SW: 'NW' };
    return signature(g.map((x) => ({ ...x, dr: x.dc, dc: h - 1 - x.dr, coin: x.coin && suivant[x.coin] })));
  };
  // Le miroir vertical envoie (dr, dc) sur (dr, L - 1 - dc).
  const refleter = (sens) => {
    const g = gabarit('navette', sens);
    const l = Math.max(...g.map((x) => x.dc)) + 1;
    const image = { NW: 'NE', NE: 'NW', SE: 'SW', SW: 'SE' };
    return signature(g.map((x) => ({ ...x, dc: l - 1 - x.dc, coin: x.coin && image[x.coin] })));
  };

  // La famille est close : tourner ou refléter une variante donne une variante.
  for (const sens of SENS_NAVETTE) {
    assert.ok(SENS_NAVETTE.some((autre) => cellesDe(autre) === tourner(sens)), `rotation de ${sens}`);
    assert.ok(SENS_NAVETTE.some((autre) => cellesDe(autre) === refleter(sens)), `miroir de ${sens}`);
  }
  assert.equal(tourner('v/'), cellesDe('h\\'));
  assert.equal(refleter('v/'), cellesDe('v\\'));
  assert.equal(new Set(SENS_NAVETTE.map(cellesDe)).size, 4, 'les quatre variantes sont distinctes');
});

/* ───────────────────────── Où poser, où annoncer ───────────────────────── */

test('on POSE une forme par sa case pleine', () => {
  assert.deepEqual(decalageReference('carre'), [1, 0]);          // coin en bas à gauche
  assert.deepEqual(decalageReference('losange'), [1, 0]);
  assert.deepEqual(decalageReference('etoile'), [0, 0]);
  for (const coin of COINS) {                                     // la case de l'angle droit
    const g = gabarit('triangle', coin).find((x) => x.ref);
    assert.equal(g.part, coin, coin);
    assert.equal(g.role, 'mur', `${coin} : la case de pose est la case pleine`);
  }
  assert.deepEqual(decalageReference('navette', 'v/'), [2, 0]);   // la pleine du bas
  assert.deepEqual(decalageReference('navette', 'v\\'), [2, 0]);
  assert.deepEqual(decalageReference('navette', 'h/'), [0, 1]);   // la pleine de gauche
  assert.deepEqual(decalageReference('navette', 'h\\'), [0, 1]);
  for (const sens of SENS_NAVETTE) {
    assert.equal(gabarit('navette', sens).find((x) => x.ref).role, 'mur', sens);
  }
});

test('on ANNONCE une forme par sa case la plus basse, la plus à gauche à égalité', () => {
  for (const type of ORDRE_FORMES) {
    for (const v of variantesDe(type)) {
      const cases = gabarit(type, v);
      const visee = cases.find((x) => x.call);
      for (const x of cases) {
        assert.ok(x.dr < visee.dr || (x.dr === visee.dr && x.dc >= visee.dc),
          `${type}/${v} : ${x.dr},${x.dc} est plus bas ou plus à gauche que la case d'annonce`);
      }
    }
  }
  assert.deepEqual(decalageCall('carre'), [1, 0]);
  assert.deepEqual(decalageCall('navette', 'v/'), [3, 0]);        // la case du bas
  assert.deepEqual(decalageCall('navette', 'h/'), [0, 0]);        // la case de gauche
  // Le triangle NE n'a pas de case en bas à gauche : sa plus basse est en bas à droite.
  assert.deepEqual(decalageCall('triangle', 'NE'), [1, 1]);
  assert.deepEqual(decalageCall('triangle', 'NW'), [1, 0]);
});

test('poser et annoncer peuvent viser deux cases différentes', () => {
  const g = grilleDe([['navette', 2, 3, 'v/']]);
  const pose = g.get(cle(4, 3));                                  // pleine du bas
  const annonce = g.get(cle(5, 3));                               // pointe du bas
  assert.equal(pose.ref, true);
  assert.equal(pose.call, undefined);
  assert.equal(estCaseDeCall(annonce), true);
  assert.deepEqual(caseDeCall('navette', 'v/', 2, 3), { r: 5, c: 3 });
  assert.deepEqual(ancreDepuisReference('navette', 'v/', 4, 3), [2, 3]);
});

test('une seule case porte l\'annonce, et elle appartient bien à la pièce', () => {
  for (const type of ORDRE_FORMES) {
    for (const v of variantesDe(type)) {
      const g = grilleDe([[type, 3, 3, v]], D10);
      const visees = [...g.values()].filter(estCaseDeCall);
      assert.equal(visees.length, 1, `${type}/${v}`);
      const { r, c } = caseDeCall(type, v, 3, 3);
      assert.ok(g.has(cle(r, c)), `${type}/${v} : la case d'annonce doit être occupée`);
    }
  }
});

/* ───────────────────────── Comportement des formes ───────────────────────── */

test('triangle : l\'hypoténuse renvoie à 90°, les cathètes font faire demi-tour', () => {
  assert.equal(devierTriangle('SW', 'E'), 'W');
  assert.equal(devierTriangle('SW', 'N'), 'S');
  assert.equal(devierTriangle('SW', 'S'), 'E');
  assert.equal(devierTriangle('SW', 'W'), 'N');
});

test('triangle NW : cathètes au nord et à l\'ouest', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  for (const [cote, i] of [['haut', 3], ['haut', 4], ['gauche', 3], ['gauche', 4]]) {
    assert.equal(tirer(g, D8, cote, i).retour, true, `${cote} ${i}`);
  }
});

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

test('navette debout : elle bloque trois lignes d\'un côté et dévie à une pointe', () => {
  const g = grilleDe([['navette', 2, 2, 'v/']]);      // cases (2,2) à (5,2), colonne C
  // Par l'ouest : la pointe haute dévie, les deux cases pleines et la pointe
  // basse (dont une cathète longe l'ouest) renvoient tout.
  assert.equal(sortie(tirer(g, D8, 'gauche', 3)), 'haut 3');
  for (const i of [4, 5, 6]) assert.equal(tirer(g, D8, 'gauche', i).retour, true, `gauche ${i}`);
  // Par l'est, c'est l'inverse : la pointe basse dévie, la haute renvoie.
  assert.equal(tirer(g, D8, 'droite', 3).retour, true);
  assert.equal(sortie(tirer(g, D8, 'droite', 6)), 'bas 3');
  // Le miroir se comporte en miroir.
  const m = grilleDe([['navette', 2, 2, 'v\\']]);
  assert.equal(tirer(m, D8, 'gauche', 3).retour, true);
  assert.equal(sortie(tirer(m, D8, 'gauche', 6)), 'bas 3');
  assert.equal(sortie(tirer(m, D8, 'droite', 3)), 'haut 3');
});

test('navette couchée : même comportement, d\'un quart de tour', () => {
  const g = grilleDe([['navette', 2, 2, 'h/']]);      // cases (2,2) à (2,5), ligne 3
  assert.equal(sortie(tirer(g, D8, 'gauche', 3)), 'haut 3');
  for (const i of [4, 5, 6]) assert.equal(tirer(g, D8, 'haut', i).retour, true, `haut ${i}`);
  assert.equal(sortie(tirer(g, D8, 'bas', 6)), 'droite 3');
});

test('la navette teinte le laser en cyan', () => {
  assert.equal(tirer(grilleDe([['navette', 2, 3, 'v/']]), D8, 'droite', 4).couleur, 'cyan');
});

/* ───────────────────────── L'étoile et ses modes ───────────────────────── */

test('aucun mode d\'étoile ne dévie le laser', () => {
  const g = grilleDe([['etoile', 2, 4]]);
  for (const mode of MODES_ETOILE) assert.equal(sortie(tirer(g, D8, 'gauche', 3, mode)), 'droite 3', mode);
});

test('mode simple : la teinte magenta s\'ajoute au mélange', () => {
  assert.equal(tirer(grilleDe([['etoile', 2, 1], ['carre', 2, 4]]), D8, 'gauche', 3, 'simple').couleur, 'bordeaux');
});

test('mode dominante : bleu + magenta + rouge donne magenta + rouge', () => {
  const etat = { teintes: new Set(['bleu']), verrouille: false };
  appliquerTeinte(etat, { type: 'etoile' }, 'dominante');
  assert.deepEqual([...etat.teintes], ['magenta']);
  appliquerTeinte(etat, { type: 'carre' }, 'dominante');
  assert.equal(melanger(etat.teintes), 'bordeaux');
});

test('mode blanche : le laser devient blanc et le reste quoi qu\'il arrive', () => {
  const g = grilleDe([['etoile', 2, 1], ['carre', 2, 4]]);
  const r = tirer(g, D8, 'gauche', 3, 'blanche');
  assert.equal(r.couleur, 'blanc');
  assert.equal(r.retour, true);
});

/* ───────────────────────── Couleurs ───────────────────────── */

test('cinq teintes de base, trente-deux mélanges, tous distincts', () => {
  assert.equal(BASES.length, 5);
  assert.equal(Object.keys(MELANGES).length, 2 ** 5);
  assert.equal(new Set(Object.values(MELANGES)).size, 32);
  assert.equal(Object.keys(CSS_COULEURS).length, 32);
  assert.equal(new Set(Object.values(CSS_COULEURS)).size, 32, 'aucune nuance en double');
  for (const nom of Object.values(MELANGES)) assert.ok(CSS_COULEURS[nom], nom);
});

test('la table couvre exactement toutes les combinaisons de teintes de base', () => {
  const attendues = new Set();
  for (let masque = 0; masque < 32; masque++) {
    attendues.add(BASES.filter((_, i) => masque & (1 << i)).join(','));
  }
  assert.deepEqual(new Set(Object.keys(MELANGES)), attendues);
});

test('chaque forme apporte bien une teinte de base différente', () => {
  const teintes = ORDRE_FORMES.map((t) => FORMES[t].couleur);
  assert.equal(new Set(teintes).size, ORDRE_FORMES.length);
  for (const t of teintes) assert.ok(BASES.includes(t), t);
});

test('melanger est insensible à l\'ordre', () => {
  assert.equal(melanger(new Set(['rouge', 'bleu'])), 'violet');
  assert.equal(melanger(new Set(['bleu', 'rouge'])), 'violet');
  assert.equal(melanger(new Set(['cyan', 'bleu'])), 'azur');
});

/* ───────────────────────── Invariants du moteur ───────────────────────── */

const INVENTAIRE = { triangle: 2, carre: 1, losange: 1, navette: 1, etoile: 1 };

test('aucun tir ne peut boucler : le laser ressort toujours', () => {
  for (let essai = 0; essai < 200; essai++) {
    const grille = placementAleatoire(D10, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 10; i++) assert.equal(tirer(grille, D10, cote, i).statut, 'sorti');
    }
  }
});

test('le TRAJET reste réversible : tirer depuis la sortie ramène à l\'entrée', () => {
  for (let essai = 0; essai < 60; essai++) {
    const grille = placementAleatoire(D10, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 10; i++) {
        const aller = tirer(grille, D10, cote, i);
        assert.equal(sortie(tirer(grille, D10, aller.coteSortie, aller.indexSortie)), `${cote} ${i}`);
      }
    }
  }
});

test('en mode simple, la couleur est symétrique comme le trajet', () => {
  for (let essai = 0; essai < 60; essai++) {
    const grille = placementAleatoire(D10, INVENTAIRE);
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= 10; i++) {
        const aller = tirer(grille, D10, cote, i, 'simple');
        const retour = tirer(grille, D10, aller.coteSortie, aller.indexSortie, 'simple');
        assert.equal(retour.couleur, aller.couleur);
      }
    }
  }
});

test('chaque case occupée applique une permutation des directions', () => {
  const grille = placementAleatoire(D10, { triangle: 3, carre: 2, losange: 2, navette: 2, etoile: 1 });
  for (const cellule of grille.values()) {
    const images = ['N', 'S', 'E', 'W'].map((d) => nouvelleDirection(cellule, d));
    assert.equal(new Set(images).size, 4, JSON.stringify(cellule));
  }
});

/* ───────────────────────── Placement ───────────────────────── */

test('une pièce ne peut ni déborder ni chevaucher', () => {
  const g = grilleDe([['carre', 2, 2]]);
  assert.equal(placeLibre(g, D8, 'carre', null, 7, 7), false);
  assert.equal(placeLibre(g, D8, 'carre', null, 3, 3), false);
  assert.equal(placeLibre(g, D8, 'carre', null, 4, 4), true);
  assert.equal(placeLibre(g, D8, 'etoile', null, 7, 7), true);
  assert.equal(placeLibre(g, D8, 'navette', 'v/', 6, 6), false);   // 4 de haut, ça dépasse
  assert.equal(placeLibre(g, D8, 'navette', 'h/', 6, 6), false);   // 4 de large, ça dépasse
  assert.equal(placeLibre(g, D8, 'navette', 'v/', 4, 6), true);
  assert.deepEqual(ancreValide('navette', 'v/', D8, 7, 7), [4, 7]);
  assert.deepEqual(ancreValide('navette', 'h/', D8, 7, 7), [7, 4]);
});

test('retirerPiece enlève toutes les cases d\'un coup', () => {
  const g = grilleDe([['navette', 2, 2, 'v/'], ['etoile', 7, 7]]);
  assert.equal(retirerPiece(g, 4, 2), true);
  assert.equal(g.size, 1);
  assert.equal(compterPieces(g), 1);
});

test('varianteSuivante fait tourner la pièce et refuse ce qui ne tient pas', () => {
  const g = grilleDe([['triangle', 2, 2, 'NW']]);
  assert.equal(varianteSuivante(g, D8, 3, 2), 'NE');
  for (const v of g.values()) assert.equal(v.variante, 'NE');
  assert.equal(changerVariante(g, D8, 2, 2, 'SE'), 'SE');

  // Une navette debout collée au bord droit ne peut pas se coucher.
  const bord = grilleDe([['navette', 0, 7, 'v/']]);
  assert.equal(changerVariante(bord, D8, 0, 7, 'h/'), null);
  assert.equal(bord.get(cle(0, 7)).variante, 'v/', 'la pièce doit être remise en l\'état');
  assert.equal(compterPieces(bord), 1);
});

test('placementAleatoire respecte l\'inventaire et ne superpose rien', () => {
  for (let i = 0; i < 200; i++) {
    const grille = placementAleatoire(D10, INVENTAIRE);
    assert.equal(compterPieces(grille), totalPieces(INVENTAIRE));
    assert.equal(grille.size, cellulesRequises(INVENTAIRE));
    const pose = inventairePose(grille);
    for (const t of ORDRE_FORMES) assert.equal(pose[t] || 0, INVENTAIRE[t], t);
    for (const v of grille.values()) {
      if (FORMES[v.type].variantes) assert.ok(FORMES[v.type].variantes.includes(v.variante), v.type);
    }
  }
});

test('placementAleatoire tient sur des grilles très différentes', () => {
  for (const [l, c, counts] of [
    [6, 6, { triangle: 1, carre: 1, etoile: 1 }],
    [20, 20, { triangle: 4, carre: 2, losange: 2, navette: 3, etoile: 2 }],
    [7, 18, { triangle: 2, carre: 1, losange: 1, navette: 2, etoile: 2 }]
  ]) {
    const d = dim(l, c);
    for (let i = 0; i < 60; i++) {
      assert.equal(compterPieces(placementAleatoire(d, counts)), totalPieces(counts));
    }
  }
});

/* ───────────────────────── Divers ───────────────────────── */

test('nomCase suit la convention colonne-lettre / ligne-chiffre', () => {
  assert.equal(nomCase(0, 0), 'A1');
  assert.equal(nomCase(7, 7), 'H8');
  assert.equal(nomCase(19, 25), 'Z20');
});

test('memeForme exige la bonne variante', () => {
  assert.equal(memeForme({ type: 'triangle', variante: 'SW' }, { type: 'triangle', variante: 'SW' }), true);
  assert.equal(memeForme({ type: 'triangle', variante: 'SW' }, { type: 'triangle', variante: 'NE' }), false);
  assert.equal(memeForme({ type: 'navette', variante: 'v/' }, { type: 'navette', variante: 'v\\' }), false);
  assert.equal(memeForme({ type: 'carre' }, { type: 'carre' }), true);
  assert.equal(memeForme({ type: 'losange' }, { type: 'etoile' }), false);
  assert.equal(memeForme(null, { type: 'carre' }), false);
});

test('nomForme et couleurDe décrivent chaque déclinaison', () => {
  assert.equal(nomForme({ type: 'triangle', variante: 'NW' }), 'Triangle ◤');
  assert.equal(nomForme({ type: 'navette', variante: 'h/' }), 'Navette ▬╱');
  assert.equal(nomForme({ type: 'etoile' }), 'Étoile');
  assert.equal(nomForme(null), 'case vide');
  assert.equal(couleurDe('navette'), 'cyan');
  assert.equal(couleurDe('etoile', 'blanche'), 'blanc');
  assert.equal(couleurDe('etoile', 'dominante'), 'magenta');
});

test('casesDeLaPiece retrouve toutes les cases depuis n\'importe laquelle', () => {
  const g = grilleDe([['navette', 1, 1, 'h/']]);
  for (const c of [1, 2, 3, 4]) {
    assert.deepEqual(casesDeLaPiece(g, 1, c).sort(), ['1,1', '1,2', '1,3', '1,4']);
  }
});
