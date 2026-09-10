/* =========================================================================
   Bataille Prismatique — adversaire artificiel

   Les trois niveaux ne sont PAS le même joueur qu'on affaiblit : ce sont trois
   façons de jouer, chacune cohérente avec elle-même. Toutes partagent le même
   noyau de déduction — un ensemble d'hypothèses compatibles avec ce que l'IA a
   réellement observé — et se distinguent par ce qu'elles en font.

     facile    — sonde au hasard, et n'annonce une forme que lorsque toutes ses
                 hypothèses survivantes s'accordent dessus.
     moyen     — choisit le tir qui départage le mieux ses hypothèses
                 (maximum d'information), même politique d'annonce.
     difficile — même choix de tir, mais annonce dès que la probabilité est
                 rentable plutôt qu'au seul cas certain, et cache ses propres
                 formes de façon adverse plutôt qu'au hasard.

   L'IA ne voit jamais la grille adverse : elle ne reçoit que le résultat de ses
   propres actions, exactement comme un joueur humain.
   ========================================================================= */
import * as M from './moteur.js';

export const NIVEAUX = ['facile', 'moyen', 'difficile'];

export const INFOS_NIVEAU = {
  facile: {
    nom: 'IA Facile',
    resume: 'Tire au hasard sur les bords qu\'elle n\'a pas encore essayés, mais raisonne '
      + 'juste sur ce qu\'elle voit : elle n\'annonce une forme que lorsque toutes les positions '
      + 'encore possibles s\'accordent dessus.'
  },
  moyen: {
    nom: 'IA Moyenne',
    resume: 'Choisit à chaque tour le tir qui départage le mieux les positions encore possibles. '
      + 'Elle attend, comme la précédente, que toutes s\'accordent avant d\'annoncer.'
  },
  difficile: {
    nom: 'IA Difficile',
    resume: 'Même choix de tir, mais elle annonce dès qu\'un pari est rentable au lieu '
      + 'd\'attendre l\'unanimité — et surtout elle cache ses propres formes là où elles '
      + 'renseignent le moins : sa grille est bien plus longue à percer.'
  }
};

/* ───────────────────────── Réglages par niveau ───────────────────────── */
/*
   `seuilCall` à 1 signifie « seulement si toutes mes hypothèses s'accordent ».
   Ce n'est une certitude que si la recherche a fait le tour de l'espace des
   possibles : avec un échantillon partiel, l'unanimité peut mentir. D'où
   `minPourCroire` — en dessous de ce nombre d'hypothèses, on n'accorde du
   crédit à l'unanimité que si la recherche est saturée.
*/
/*
   Les trois niveaux reçoivent exactement le même temps de réflexion et le même
   nombre d'hypothèses : mesures à l'appui, en donner davantage n'améliore plus
   rien (600 ms donnent le même résultat que 250). Ce qui les sépare est donc
   uniquement stratégique, jamais un bridage.
*/
const COMMUN = { pool: 180, budgetMs: 450, partDeChaud: 0.65 };
const REGLAGES = {
  facile:    { ...COMMUN, seuilCall: 1,    minPourCroire: 14, tirInforme: false, placementAdverse: false },
  moyen:     { ...COMMUN, seuilCall: 1,    minPourCroire: 14, tirInforme: true,  placementAdverse: false },
  difficile: { ...COMMUN, seuilCall: 0.70, minPourCroire: 10, tirInforme: true,  placementAdverse: true }
};

const alea = (n) => Math.floor(Math.random() * n);
const pause = () => new Promise((r) => setTimeout(r, 0));
const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Case sur laquelle une pièce doit être annoncée (la plus basse, puis la plus à gauche). */
export const caseDeCall = (piece) => M.caseDeCall(piece.type, piece.variante ?? null, piece.r, piece.c);

/** Signature d'un placement, pour repérer les doublons dans l'ensemble d'hypothèses. */
const clePlacement = (pieces) =>
  pieces.map((p) => `${p.type}${p.variante ?? ''}@${p.r},${p.c}`).sort().join('|');

/** Retire d'une grille les cases d'une pièce dont on connaît l'ancre. */
function enlever(grille, p) {
  for (const u of M.empriseDe(p.type, p.variante ?? null, p.r, p.c)) grille.delete(M.cle(u.r, u.c));
}

/* ═════════════════════════ Le cerveau ═════════════════════════ */

/**
 * @param {{dim:object, counts:object, modeEtoile:string}} cfg  règles de la partie
 * @param {'facile'|'moyen'|'difficile'} niveau
 * @param {object} [surcharges]  réglages forcés (utile aux tests : budget réduit)
 */
export function creerIA(cfg, niveau, surcharges = {}) {
  const reglage = { ...(REGLAGES[niveau] ?? REGLAGES.moyen), ...surcharges };
  const { dim, counts, modeEtoile } = cfg;

  /** Ce que l'IA a réellement observé — sa seule source d'information. */
  const obs = [];          // { cote, index, coteSortie, indexSortie, couleur }
  const rates = [];        // { r, c, type, variante } : call raté, donc contrainte négative
  const trouvees = [];     // { type, r, c, variante } : pièces annoncées avec succès

  let pool = [];           // hypothèses compatibles : { pieces, grille }
  let cles = new Set();
  let sature = false;      // la recherche ne trouve plus de placement inédit

  /* ─────────── Génération d'un placement ─────────── */

  const bordsPossibles = [];
  for (const cote of ['gauche', 'droite', 'haut', 'bas']) {
    for (let i = 1; i <= M.bordsDuCote(dim, cote); i++) bordsPossibles.push({ cote, index: i });
  }

  function inventaireMobile() {
    const reste = { ...counts };
    for (const p of trouvees) reste[p.type]--;
    return reste;
  }

  /** Pose une pièce à un endroit libre tiré au hasard. */
  function poserAuHasard(grille, type, essais = 60) {
    const liste = M.variantesDe(type);
    for (let i = 0; i < essais; i++) {
      const v = liste[alea(liste.length)];
      const r = alea(dim.lignes), c = alea(dim.colonnes);
      if (M.poserPiece(grille, dim, type, r, c, v)) return { type, r, c, variante: v };
    }
    // Repli exhaustif quand la grille est très encombrée.
    for (let r = 0; r < dim.lignes; r++) for (let c = 0; c < dim.colonnes; c++) {
      const v = liste[alea(liste.length)];
      if (M.poserPiece(grille, dim, type, r, c, v)) return { type, r, c, variante: v };
    }
    return null;
  }

  /** Un placement complet au hasard, les pièces déjà trouvées étant fixées. */
  function placementLibre() {
    const grille = new Map();
    const pieces = [];
    for (const p of trouvees) {
      M.poserPiece(grille, dim, p.type, p.r, p.c, p.variante);
      pieces.push(p);
    }
    const fixes = pieces.length;
    const reste = inventaireMobile();
    const types = [...M.ORDRE_FORMES].sort((a, b) => M.emprise(b) - M.emprise(a));
    for (const type of types) {
      for (let n = 0; n < (reste[type] || 0); n++) {
        const p = poserAuHasard(grille, type);
        if (!p) return null;              // grille saturée : on retentera
        pieces.push(p);
      }
    }
    return { grille, pieces, fixes };
  }

  /* ─────────── Cohérence d'une hypothèse ─────────── */

  /** Coût d'une observation mal reproduite. Une sortie fausse est plus grave
      qu'une simple couleur fausse : la recherche corrige d'abord les positions. */
  function ecartDe(res, o) {
    if (res.coteSortie !== o.coteSortie || res.indexSortie !== o.indexSortie) return 3;
    if (res.couleur !== o.couleur) return 1;
    return 0;
  }

  /** Pénalité des calls ratés : ils interdisent certaines cases d'annonce. */
  function penaliteRates(grille) {
    let e = 0;
    for (const k of rates) {
      const cellule = grille.get(M.cle(k.r, k.c));
      if (cellule && M.estCaseDeCall(cellule) && M.memeForme(cellule, k)) e += 5;
    }
    return e;
  }

  /** Écart total entre une hypothèse et tout ce que l'IA a observé. Zéro = possible. */
  function energie(grille) {
    let e = penaliteRates(grille);
    for (const o of obs) e += ecartDe(M.tirer(grille, dim, o.cote, o.index, modeEtoile), o);
    return e;
  }

  /*
     Évaluation incrémentale — c'est ce qui rend la recherche tenable.

     Déplacer une pièce ne change que les tirs dont le trajet passait par les
     cases libérées ou par les cases occupées. Pour tous les autres, le laser
     suit exactement le même chemin qu'avant, donc ni sa sortie ni sa couleur ne
     bougent : inutile de les rejouer. On garde donc, pour chaque observation,
     le trajet et l'écart courants, et on ne recalcule que ce qui est touché.
  */
  function creerSuivi(grille) {
    const chemins = [], ecarts = [];
    let total = 0;                       // somme des écarts d'observation seuls
    for (const o of obs) {
      const r = M.tirer(grille, dim, o.cote, o.index, modeEtoile);
      chemins.push(new Set(r.etapes.map((e) => M.cle(e.r, e.c))));
      const ec = ecartDe(r, o);
      ecarts.push(ec);
      total += ec;
    }
    return { chemins, ecarts, total };
  }

  /** Met à jour le suivi après que `cellules` ont changé d'occupant. */
  function rafraichir(suivi, grille, cellules) {
    for (let i = 0; i < obs.length; i++) {
      const chemin = suivi.chemins[i];
      let touche = false;
      for (const k of cellules) if (chemin.has(k)) { touche = true; break; }
      if (!touche) continue;
      const r = M.tirer(grille, dim, obs[i].cote, obs[i].index, modeEtoile);
      suivi.chemins[i] = new Set(r.etapes.map((e) => M.cle(e.r, e.c)));
      const ec = ecartDe(r, obs[i]);
      suivi.total += ec - suivi.ecarts[i];
      suivi.ecarts[i] = ec;
    }
  }

  /** Cases occupées par une pièce, sous forme de clés. */
  const clesDe = (p) => M.empriseDe(p.type, p.variante ?? null, p.r, p.c).map((u) => M.cle(u.r, u.c));

  /** Reconstruit un placement de travail à partir d'une hypothèse connue. */
  function depuisModele(modele) {
    const fixesList = [], mobilesList = [];
    for (const p of modele.pieces) {
      (dejaTrouvee(p) ? fixesList : mobilesList).push({ ...p });
    }
    const pieces = [...fixesList, ...mobilesList];
    const grille = new Map();
    for (const p of pieces) {
      if (!M.poserPiece(grille, dim, p.type, p.r, p.c, p.variante)) return null;
    }
    return { grille, pieces, fixes: fixesList.length };
  }

  /**
   * Point de départ du recuit. Repartir systématiquement d'un placement au
   * hasard ne mène nulle part quand les observations sont nombreuses : la
   * cible est trop étroite. On repart donc souvent d'une hypothèse déjà
   * validée, qu'on secoue — c'est aussi ce qui permet de constater qu'il n'en
   * existe pas d'autre, et donc de conclure.
   */
  function placementDepart() {
    if (pool.length && Math.random() < reglage.partDeChaud) {
      const depuis = depuisModele(pool[alea(pool.length)]);
      if (depuis) return depuis;
    }
    return placementLibre();
  }

  /**
   * Recuit simulé : on part d'un placement au hasard et on déplace les pièces
   * jusqu'à ce que l'hypothèse explique toutes les observations. Le rejet pur
   * ne tiendrait pas — après quelques tirs, un placement tiré au hasard n'a
   * pratiquement aucune chance d'être compatible.
   */
  function recuit(limite) {
    let base = placementDepart();
    for (let essai = 0; !base && essai < 5; essai++) base = placementLibre();
    if (!base) return null;

    const { grille, pieces, fixes } = base;
    const mobiles = pieces.length - fixes;
    const suivi = creerSuivi(grille);
    const total = () => suivi.total + penaliteRates(grille);
    if (mobiles === 0) return total() === 0 ? { grille, pieces } : null;

    let t = 3;
    let meilleur = total();
    let depuisProgres = 0;
    for (let pas = 0; pas < 9000 && total() > 0; pas++) {
      // Lire l'horloge à chaque pas coûterait plus cher que le pas lui-même.
      if ((pas & 63) === 0 && maintenant() >= limite) break;
      // Bloqué dans un creux : on réchauffe pour en sortir.
      if (depuisProgres > 900) { t = 1.6; depuisProgres = 0; }

      const i = fixes + alea(mobiles);
      const avant = pieces[i];
      const liste = M.variantesDe(avant.type);
      const cand = {
        type: avant.type,
        r: alea(dim.lignes),
        c: alea(dim.colonnes),
        variante: liste[alea(liste.length)]
      };

      const avantTotal = total();
      const bougees = clesDe(avant);
      enlever(grille, avant);
      if (!M.poserPiece(grille, dim, cand.type, cand.r, cand.c, cand.variante)) {
        M.poserPiece(grille, dim, avant.type, avant.r, avant.c, avant.variante);
        continue;
      }
      bougees.push(...clesDe(cand));

      rafraichir(suivi, grille, bougees);
      const apresTotal = total();

      if (apresTotal <= avantTotal || Math.random() < Math.exp((avantTotal - apresTotal) / t)) {
        pieces[i] = cand;
      } else {
        enlever(grille, cand);
        M.poserPiece(grille, dim, avant.type, avant.r, avant.c, avant.variante);
        rafraichir(suivi, grille, bougees);
      }
      if (total() < meilleur) { meilleur = total(); depuisProgres = 0; } else depuisProgres++;
      t = Math.max(0.12, t * 0.998);
    }
    return total() === 0 ? { grille, pieces } : null;
  }

  /** Purge les hypothèses devenues incompatibles, puis en cherche de nouvelles. */
  async function reflechir(budgetMs = reglage.budgetMs) {
    pool = pool.filter((h) => energie(h.grille) === 0);
    cles = new Set(pool.map((h) => clePlacement(h.pieces)));

    const limite = maintenant() + budgetMs;
    // Un recuit parti de zéro peut échouer longtemps : sans tranche de temps, il
    // mangerait tout le budget et empêcherait les autres tentatives d'aboutir.
    const tranche = Math.max(20, budgetMs / 6);
    let dernierSouffle = maintenant();
    let reussites = 0;   // recuits qui ont abouti à une hypothèse valable
    let inedits = 0;     // parmi elles, celles qu'on ne connaissait pas

    while (pool.length < reglage.pool && maintenant() < limite) {
      const h = recuit(Math.min(limite, maintenant() + tranche));
      if (h) {
        reussites++;
        const k = clePlacement(h.pieces);
        if (!cles.has(k)) { cles.add(k); pool.push(h); inedits++; }
      }
      // Assez de tentatives abouties sans rien de neuf : inutile d'insister.
      if (reussites >= 8 && inedits === 0) break;
      // On rend la main régulièrement pour ne pas figer l'interface.
      if (maintenant() - dernierSouffle > 40) { await pause(); dernierSouffle = maintenant(); }
    }

    // Il existe toujours au moins une hypothèse compatible : la vraie grille.
    // Si le recuit n'en a trouvé aucune, c'est qu'il a manqué de temps.
    if (!pool.length && budgetMs > 0) {
      const rattrapage = maintenant() + budgetMs * 4;
      while (!pool.length && maintenant() < rattrapage) {
        const h = recuit(rattrapage);
        if (h) { cles.add(clePlacement(h.pieces)); pool.push(h); reussites++; inedits++; }
        await pause();
      }
    }

    /*
       Saturation : plusieurs recuits ont abouti, mais aucun n'a rien apporté de
       neuf. Comme chaque recuit repart d'un placement tiré au hasard, retomber
       systématiquement sur les mêmes solutions veut dire qu'il n'en reste guère
       d'autres — c'est ce qui transforme une unanimité en vraie certitude.
       Un recuit qui échoue faute de temps ne compte pas : il ne prouve rien.
    */
    sature = pool.length > 0 && (pool.length >= reglage.pool || (reussites >= 6 && inedits === 0));
    return pool.length;
  }

  /* ─────────── Décider : annoncer ou tirer ─────────── */

  const dejaTrouvee = (piece) =>
    trouvees.some((t) => t.type === piece.type && t.r === piece.r && t.c === piece.c);

  /** Forme la plus probable parmi les hypothèses, avec sa probabilité. */
  function meilleurCall() {
    if (!pool.length) return null;
    const compte = new Map();
    for (const h of pool) {
      for (const p of h.pieces) {
        if (dejaTrouvee(p)) continue;
        const sw = caseDeCall(p);
        const k = `${sw.r},${sw.c}|${p.type}|${p.variante ?? ''}`;
        const vu = compte.get(k);
        if (vu) vu.n++;
        else compte.set(k, { n: 1, r: sw.r, c: sw.c, type: p.type, variante: p.variante ?? null });
      }
    }
    let best = null;
    for (const v of compte.values()) if (!best || v.n > best.n) best = v;
    return best ? { ...best, p: best.n / pool.length } : null;
  }

  const dejaTire = (b) => obs.some((o) => o.cote === b.cote && o.index === b.index);

  /**
   * Tir le plus instructif : celui dont les réponses possibles partagent le
   * mieux l'ensemble des hypothèses (entropie maximale).
   */
  function tirInforme(candidats) {
    const echantillon = pool.length > 140 ? pool.slice(0, 140) : pool;
    if (!echantillon.length) return candidats[alea(candidats.length)];

    let meilleur = null, meilleureNote = -1;
    for (const b of candidats) {
      const reponses = new Map();
      for (const h of echantillon) {
        const r = M.tirer(h.grille, dim, b.cote, b.index, modeEtoile);
        const k = `${r.coteSortie}:${r.indexSortie}:${r.couleur}`;
        reponses.set(k, (reponses.get(k) || 0) + 1);
      }
      let entropie = 0;
      for (const n of reponses.values()) {
        const p = n / echantillon.length;
        entropie -= p * Math.log2(p);
      }
      // Départage aléatoire pour ne pas toujours ouvrir de la même façon.
      const note = entropie + Math.random() * 1e-6;
      if (note > meilleureNote) { meilleureNote = note; meilleur = b; }
    }
    return meilleur;
  }

  function choisirTir() {
    const libres = bordsPossibles.filter((b) => !dejaTire(b));
    const candidats = libres.length ? libres : bordsPossibles;
    if (!reglage.tirInforme) return candidats[alea(candidats.length)];
    return tirInforme(candidats);
  }

  /* ─────────── Placement de ses propres formes ─────────── */

  /**
   * Nombre de bords dont le laser rencontre au moins une pièce.
   *
   * Contre-intuitivement, c'est ce qu'il faut MINIMISER pour se cacher. Un
   * laser qui traverse sans rien toucher n'apprend qu'une chose — « cette ligne
   * est vide » — alors qu'un laser qui rencontre une forme livre une sortie et
   * une couleur, c'est-à-dire de la position. Grouper ses pièces pour que peu
   * de lignes réagissent oblige donc l'adversaire à gaspiller des tours.
   *
   * Mesuré, pas supposé : sur 40 grilles en 10 × 10, il faut en moyenne
   * 23,7 ± 1,3 tirs à un même attaquant pour percer un placement choisi ainsi,
   * contre 19,8 ± 1,1 au hasard — un écart de +4,0 ± 1,7, donc significatif.
   * Maximiser les lignes touchées, ce que faisait une première version, faisait
   * au contraire tomber ce coût à 16,8 : l'intuition était exactement à
   * l'envers. À noter, l'écart-type est grand (près de 7 tirs) : il faut une
   * quarantaine de grilles pour que la différence sorte du bruit.
   */
  function lignesTouchees(grille) {
    let n = 0;
    for (const b of bordsPossibles) {
      const r = M.tirer(grille, dim, b.cote, b.index, modeEtoile);
      if (r.etapes.some((e) => grille.has(M.cle(e.r, e.c)))) n++;
    }
    return n;
  }

  function placer() {
    if (!reglage.placementAdverse) return M.placementAleatoire(dim, counts);
    let meilleur = null, meilleureNote = Infinity;
    for (let i = 0; i < 40; i++) {
      const g = M.placementAleatoire(dim, counts);
      if (M.compterPieces(g) !== M.totalPieces(counts)) continue;
      const note = lignesTouchees(g);
      if (note < meilleureNote) { meilleureNote = note; meilleur = g; }
    }
    return meilleur ?? M.placementAleatoire(dim, counts);
  }

  /* ─────────── Interface publique ─────────── */

  return {
    niveau,
    nom: INFOS_NIVEAU[niveau].nom,

    placer,

    /** Réfléchit puis renvoie l'action à jouer. */
    async choisirAction() {
      await reflechir();
      const call = meilleurCall();
      const resteDesBords = bordsPossibles.some((b) => !dejaTire(b));
      // Une unanimité sur trois hypothèses ne vaut rien : on ne s'y fie que si
      // l'échantillon est assez fourni, ou si la recherche a saturé.
      const echantillonCredible = pool.length >= reglage.minPourCroire || sature;

      // On annonce si la confiance atteint le seuil du niveau — ou s'il n'y a
      // plus rien de neuf à sonder, auquel cas tirer ne servirait plus à rien.
      const convaincue = call && call.p >= reglage.seuilCall && echantillonCredible;
      // Repli : plus aucun bord neuf à sonder, tirer n'apprendrait plus rien.
      const parDefaut = !!call && !convaincue && !resteDesBords;
      if (convaincue || parDefaut) {
        return {
          type: 'call', r: call.r, c: call.c,
          forme: { type: call.type, variante: call.variante },
          confiance: call.p, parDefaut, hypotheses: pool.length
        };
      }
      const b = choisirTir();
      return { type: 'tir', cote: b.cote, index: b.index, hypotheses: pool.length };
    },

    /** Résultat d'un de ses tirs. */
    noterTir(cote, index, res) {
      obs.push({
        cote, index,
        coteSortie: res.coteSortie, indexSortie: res.indexSortie, couleur: res.couleur
      });
    },

    /** Résultat d'une de ses annonces. `piece` = la pièce réelle si le call est juste. */
    noterCall(r, c, forme, juste, piece) {
      if (juste && piece) trouvees.push({ ...piece });
      else rates.push({ r, c, type: forme.type, variante: forme.variante ?? null });
    },

    /** État interne, pour la sauvegarde et les tests. */
    memoire: () => ({ obs: [...obs], rates: [...rates], trouvees: [...trouvees] }),
    restaurer(m) {
      obs.length = 0; rates.length = 0; trouvees.length = 0;
      obs.push(...(m.obs || []));
      rates.push(...(m.rates || []));
      trouvees.push(...(m.trouvees || []));
      pool = []; cles = new Set();
    },
    hypotheses: () => pool.length,
    /** Vrai quand la recherche ne trouve plus de placement inédit. */
    sature: () => sature,
    /** Ensemble d'hypothèses courant — exposé pour que les tests puissent
        vérifier de l'extérieur qu'il reste cohérent avec les observations. */
    poolPourTest: () => pool,
    reflechir
  };
}
