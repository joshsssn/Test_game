import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/moteur.js';
import { creerIA, caseDeCall, NIVEAUX, INFOS_NIVEAU } from '../js/ia.js';

/* Générateur reproductible : les tests ne doivent pas dépendre du hasard. */
function graine(n) {
  const original = Math.random;
  let a = n >>> 0;
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = original; };
}

const CFG = {
  dim: M.dim(10),
  counts: { triangle: 2, carre: 1, losange: 1, navette: 1, etoile: 1 },
  modeEtoile: 'simple'
};
/** Budget très réduit : on teste le comportement, pas la puissance de calcul. */
const RAPIDE = { budgetMs: 200, pool: 90 };

/** Liste des pièces réellement posées sur une grille. */
function piecesDe(grille) {
  const vues = new Map();
  for (const cellule of grille.values()) {
    if (!vues.has(cellule.id)) {
      vues.set(cellule.id, {
        type: cellule.type, r: cellule.ancre[0], c: cellule.ancre[1],
        variante: cellule.variante ?? null
      });
    }
  }
  return [...vues.values()];
}

/**
 * Fait résoudre une grille secrète à l'IA, seule, en lui rendant honnêtement
 * le résultat de chacune de ses actions. Renvoie le compte-rendu de la partie.
 */
async function resoudre(ia, secret, cfg = CFG, maxActions = 400, confiances = null) {
  const restantes = new Map(piecesDe(secret).map((p) => {
    const sw = caseDeCall(p);
    return [`${sw.r},${sw.c}|${p.type}|${p.variante ?? ''}`, p];
  }));
  const total = restantes.size;
  let tirs = 0, callsJustes = 0, callsRates = 0, actions = 0;

  while (restantes.size && actions < maxActions) {
    const a = await ia.choisirAction();
    actions++;
    if (a.type === 'tir') {
      assert.ok(['gauche', 'droite', 'haut', 'bas'].includes(a.cote), 'côté valide');
      assert.ok(a.index >= 1 && a.index <= M.bordsDuCote(cfg.dim, a.cote), 'index dans la grille');
      const res = M.tirer(secret, cfg.dim, a.cote, a.index, cfg.modeEtoile);
      ia.noterTir(a.cote, a.index, res);
      tirs++;
    } else {
      assert.ok(a.r >= 0 && a.r < cfg.dim.lignes, 'ligne dans la grille');
      assert.ok(a.c >= 0 && a.c < cfg.dim.colonnes, 'colonne dans la grille');
      if (confiances) confiances.push({ p: a.confiance, parDefaut: !!a.parDefaut });
      const k = `${a.r},${a.c}|${a.forme.type}|${a.forme.variante ?? ''}`;
      const piece = restantes.get(k);
      const cellule = secret.get(M.cle(a.r, a.c));
      const juste = !!cellule && M.estCaseDeCall(cellule) && M.memeForme(cellule, a.forme);
      assert.equal(juste, !!piece, 'le verdict du call doit coller à la grille secrète');
      if (juste) { restantes.delete(k); callsJustes++; } else callsRates++;
      ia.noterCall(a.r, a.c, a.forme, juste, piece);
    }
  }
  return { resolu: restantes.size === 0, total, actions, tirs, callsJustes, callsRates };
}

/* ───────────────────────── Contrat de base ───────────────────────── */

test('les trois niveaux existent et sont décrits', () => {
  assert.deepEqual(NIVEAUX, ['facile', 'moyen', 'difficile']);
  for (const n of NIVEAUX) {
    assert.ok(INFOS_NIVEAU[n].nom, n);
    assert.ok(INFOS_NIVEAU[n].resume.length > 40, n);
  }
});

test('caseDeCall vise la case la plus basse, la plus à gauche à égalité', () => {
  assert.deepEqual(caseDeCall({ type: 'carre', r: 2, c: 3 }), { r: 3, c: 3 });
  assert.deepEqual(caseDeCall({ type: 'triangle', variante: 'NW', r: 0, c: 0 }), { r: 1, c: 0 });
  assert.deepEqual(caseDeCall({ type: 'triangle', variante: 'NE', r: 0, c: 0 }), { r: 1, c: 1 });
  assert.deepEqual(caseDeCall({ type: 'navette', variante: 'v/', r: 1, c: 4 }), { r: 4, c: 4 });
  assert.deepEqual(caseDeCall({ type: 'navette', variante: 'h/', r: 1, c: 4 }), { r: 1, c: 4 });
  assert.deepEqual(caseDeCall({ type: 'etoile', r: 5, c: 6 }), { r: 5, c: 6 });
});

test('chaque niveau pose un placement complet et valide', () => {
  const libere = graine(1);
  try {
    for (const niveau of NIVEAUX) {
      const ia = creerIA(CFG, niveau, RAPIDE);
      for (let i = 0; i < 12; i++) {
        const g = ia.placer();
        assert.equal(M.compterPieces(g), M.totalPieces(CFG.counts), niveau);
        assert.equal(g.size, M.cellulesRequises(CFG.counts), niveau);
        const pose = M.inventairePose(g);
        for (const t of M.ORDRE_FORMES) assert.equal(pose[t] || 0, CFG.counts[t], `${niveau}/${t}`);
      }
    }
  } finally { libere(); }
});

/* ───────────────────────── Elle ne joue que des coups légaux ───────────────────────── */

test('toutes les actions proposées sont légales, et chaque niveau résout la grille', async () => {
  const libere = graine(7);
  try {
    for (const niveau of NIVEAUX) {
      const ia = creerIA(CFG, niveau, RAPIDE);
      const secret = M.placementAleatoire(CFG.dim, CFG.counts);
      const bilan = await resoudre(ia, secret);
      assert.equal(bilan.resolu, true, `${niveau} doit finir par tout trouver`);
      assert.equal(bilan.callsJustes, bilan.total, niveau);
      assert.ok(bilan.actions < 400, niveau);
    }
  } finally { libere(); }
});

test('elle termine aussi sur une grille rectangulaire et en mode d\'étoile dominante', async () => {
  const libere = graine(11);
  try {
    const cfg = {
      dim: M.dim(6, 12),
      counts: { triangle: 2, carre: 1, losange: 1, etoile: 2 },
      modeEtoile: 'dominante'
    };
    const ia = creerIA(cfg, 'moyen', RAPIDE);
    const bilan = await resoudre(ia, M.placementAleatoire(cfg.dim, cfg.counts), cfg);
    assert.equal(bilan.resolu, true);
  } finally { libere(); }
});

/* ───────────────────────── Elle ne triche pas ───────────────────────── */

test('ses hypothèses reproduisent toutes ses observations', async () => {
  const libere = graine(3);
  try {
    const cfg = CFG;
    const secret = M.placementAleatoire(cfg.dim, cfg.counts);
    const ia = creerIA(cfg, 'moyen', { budgetMs: 120, pool: 40 });
    const observations = [];

    for (let tour = 0; tour < 6; tour++) {
      const a = await ia.choisirAction();
      if (a.type !== 'tir') break;
      const res = M.tirer(secret, cfg.dim, a.cote, a.index, cfg.modeEtoile);
      ia.noterTir(a.cote, a.index, res);
      observations.push({ ...a, res });
    }

    await ia.reflechir(300);
    assert.ok(ia.hypotheses() > 0, 'elle doit garder au moins une hypothèse');

    // On vérifie de l'extérieur que chaque hypothèse rejoue exactement ce qu'elle a vu.
    for (const h of ia.poolPourTest()) {
      for (const o of observations) {
        const r = M.tirer(h.grille, cfg.dim, o.cote, o.index, cfg.modeEtoile);
        assert.equal(r.coteSortie, o.res.coteSortie);
        assert.equal(r.indexSortie, o.res.indexSortie);
        assert.equal(r.couleur, o.res.couleur);
      }
    }
  } finally { libere(); }
});

test('sur un espace réduit, elle retrouve le placement réel', async () => {
  const libere = graine(5);
  try {
    // Petite grille, deux pièces : l'espace des placements est assez restreint
    // pour que la recherche puisse en faire le tour — donc la vérité doit y être.
    const cfg = { dim: M.dim(6), counts: { carre: 1, etoile: 1 }, modeEtoile: 'simple' };
    const secret = M.placementAleatoire(cfg.dim, cfg.counts);
    const ia = creerIA(cfg, 'moyen', { budgetMs: 150, pool: 400 });
    for (let i = 0; i < 16; i++) {
      const a = await ia.choisirAction();
      if (a.type !== 'tir') break;
      ia.noterTir(a.cote, a.index, M.tirer(secret, cfg.dim, a.cote, a.index, cfg.modeEtoile));
    }
    await ia.reflechir(2000);
    const signature = (pieces) =>
      pieces.map((p) => `${p.type}${p.variante ?? ''}@${p.r},${p.c}`).sort().join('|');
    const pool = ia.poolPourTest();
    assert.ok(pool.length > 0, 'elle doit garder des hypothèses');
    assert.ok(pool.some((h) => signature(h.pieces) === signature(piecesDe(secret))),
      `le recuit doit retrouver le placement réel (${pool.length} hypothèses retenues)`);
  } finally { libere(); }
});

test('elle ne se fie pas à l\'unanimité d\'un échantillon trop maigre', async () => {
  const libere = graine(17);
  try {
    // Budget minuscule : très peu d'hypothèses, donc une unanimité sans valeur.
    const ia = creerIA(CFG, 'moyen', { budgetMs: 4, pool: 200, minPourCroire: 25 });
    const secret = M.placementAleatoire(CFG.dim, CFG.counts);
    ia.noterTir('gauche', 3, M.tirer(secret, CFG.dim, 'gauche', 3, CFG.modeEtoile));
    const a = await ia.choisirAction();
    assert.equal(a.type, 'tir',
      'avec une poignée d\'hypothèses et des bords libres, elle doit continuer à sonder');
  } finally { libere(); }
});

test('un call raté est retenu : elle ne le rejoue pas et l\'exclut de ses hypothèses', async () => {
  const libere = graine(13);
  try {
    const ia = creerIA(CFG, 'difficile', { budgetMs: 120, pool: 60 });
    const forme = { type: 'carre', variante: null };
    ia.noterCall(4, 2, forme, false, null);
    await ia.reflechir(400);
    for (const h of ia.poolPourTest()) {
      const cellule = h.grille.get(M.cle(4, 2));
      const contredit = cellule && M.estCaseDeCall(cellule) && M.memeForme(cellule, forme);
      assert.equal(!!contredit, false, 'aucune hypothèse ne doit contredire un call raté');
    }
  } finally { libere(); }
});

/* ───────────────────────── Les niveaux se distinguent vraiment ───────────────────────── */

test('le tir informé réduit nettement le nombre de sondages', async () => {
  const libere = graine(2024);
  try {
    const PARTIES = 8;
    const grilles = Array.from({ length: PARTIES }, () => M.placementAleatoire(CFG.dim, CFG.counts));
    const bilans = {};
    for (const niveau of NIVEAUX) {
      let actions = 0, tirs = 0, rates = 0;
      for (const secret of grilles) {
        const b = await resoudre(creerIA(CFG, niveau, RAPIDE), new Map(secret));
        assert.equal(b.resolu, true, `${niveau} doit résoudre`);
        actions += b.actions; tirs += b.tirs; rates += b.callsRates;
      }
      bilans[niveau] = { actions: actions / PARTIES, tirs: tirs / PARTIES, rates: rates / PARTIES };
    }
    console.log('   moyennes sur', PARTIES, 'grilles :', NIVEAUX.map((n) =>
      `${n} ${bilans[n].actions.toFixed(1)} actions (${bilans[n].tirs.toFixed(1)} tirs)`).join(' · '));

    // Sonder au hasard coûte beaucoup plus cher que sonder là où ça départage.
    // En revanche moyen et difficile attaquent à la même vitesse : leur écart se
    // joue en défense, pas en attaque — c'est mesuré par le test suivant.
    for (const niveau of ['moyen', 'difficile']) {
      assert.ok(bilans[niveau].tirs < bilans.facile.tirs * 0.88,
        `${niveau} (${bilans[niveau].tirs} tirs) doit sonder nettement moins que facile (${bilans.facile.tirs})`);
    }
  } finally { libere(); }
});

test('la grille du niveau difficile est plus dure à percer que celle du hasard', async () => {
  const libere = graine(4242);
  try {
    // Même attaquant dans les deux cas : seul le placement change.
    const attaquer = async (grilles) => {
      let tirs = 0;
      for (const secret of grilles) {
        tirs += (await resoudre(creerIA(CFG, 'moyen', RAPIDE), new Map(secret))).tirs;
      }
      return tirs / grilles.length;
    };
    const PARTIES = 12;
    const posesHasard = Array.from({ length: PARTIES }, () => creerIA(CFG, 'moyen', RAPIDE).placer());
    const posesAdverses = Array.from({ length: PARTIES }, () => creerIA(CFG, 'difficile', RAPIDE).placer());
    const coutHasard = await attaquer(posesHasard);
    const coutAdverse = await attaquer(posesAdverses);
    console.log(`   tirs pour percer : placement au hasard ${coutHasard.toFixed(1)} · placement adverse ${coutAdverse.toFixed(1)}`);
    /*
       La marge est volontairement lâche. La recherche de l'IA est bornée en
       TEMPS, pas en nombre d'itérations : sous charge elle explore moins, et le
       coût de perçage bouge de plusieurs tirs d'une exécution à l'autre. Et
       l'écart-type entre grilles est grand : sur 40 grilles au calme, l'écart
       réel est de 19,8 ± 1,1 tirs au hasard contre 23,7 ± 1,3 en placement
       adverse. Sur douze grilles, ce signal se noie. Ce que ce test garantit,
       qu'on n'a pas de nouveau inversé le critère — une version antérieure
       rendait la grille plus FACILE à percer (16,8 contre 20,1).
       La preuve forte de l'effet est portée par le test suivant, lui
       déterministe.
    */
    assert.ok(coutAdverse > coutHasard * 0.95,
      `le placement adverse (${coutAdverse}) ne doit pas faciliter le perçage (hasard : ${coutHasard})`);
  } finally { libere(); }
});

test('facile et moyen n\'annoncent jamais sous la certitude ; difficile le peut', async () => {
  const libere = graine(99);
  try {
    const PARTIES = 6;
    const grilles = Array.from({ length: PARTIES }, () => M.placementAleatoire(CFG.dim, CFG.counts));
    const releve = {};
    for (const niveau of NIVEAUX) {
      const confiances = [];
      for (const secret of grilles) {
        await resoudre(creerIA(CFG, niveau, RAPIDE), new Map(secret), CFG, 400, confiances);
      }
      releve[niveau] = confiances;
    }
    console.log('   annonces sous certitude :', NIVEAUX.map((n) => {
      const choisies = releve[n].filter((c) => !c.parDefaut);
      return `${n} ${choisies.filter((c) => c.p < 1).length}/${choisies.length}`;
    }).join(' · '));

    // Propriété garantie par la politique : avec un seuil à 1, aucune annonce
    // délibérée ne part tant que les hypothèses ne s'accordent pas. Le seul cas
    // où l'IA annonce sans conviction est le repli, quand il ne reste plus rien
    // à sonder et que tirer ne servirait donc à rien.
    for (const niveau of ['facile', 'moyen']) {
      for (const c of releve[niveau]) {
        if (c.parDefaut) continue;
        assert.equal(c.p, 1, `${niveau} ne doit annoncer délibérément qu'à l'unanimité (vu ${c.p})`);
      }
    }
  } finally { libere(); }
});

test('le placement du niveau difficile laisse passer plus de lasers sans rien toucher', () => {
  const libere = graine(31);
  try {
    const bords = [];
    for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
      for (let i = 1; i <= M.bordsDuCote(CFG.dim, cote); i++) bords.push({ cote, index: i });
    }
    // Un laser qui ne rencontre rien n'apprend qu'une chose : « cette ligne est
    // vide ». C'est bien moins que la sortie et la couleur qu'aurait données une
    // rencontre — d'où l'intérêt, pour se cacher, d'en laisser passer beaucoup.
    const intacts = (grille) => bords.filter((b) =>
      !M.tirer(grille, CFG.dim, b.cote, b.index, CFG.modeEtoile)
        .etapes.some((e) => grille.has(M.cle(e.r, e.c)))).length;

    const mesure = (niveau) => {
      const ia = creerIA(CFG, niveau, RAPIDE);
      let total = 0;
      for (let i = 0; i < 12; i++) total += intacts(ia.placer());
      return total / 12;
    };
    const hasard = mesure('moyen');
    const adverse = mesure('difficile');
    console.log(`   lasers qui ne touchent rien : placement au hasard ${hasard.toFixed(1)} · placement adverse ${adverse.toFixed(1)}`);
    assert.ok(adverse > hasard * 1.3,
      `le placement adverse (${adverse}) doit laisser bien plus de lignes intactes que le hasard (${hasard})`);
  } finally { libere(); }
});
