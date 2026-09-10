# 🔺 Bataille Prismatique

Duel de déduction pour **2 joueurs sur un seul appareil**, jouable dans le
navigateur — aucun serveur, aucune dépendance, aucune installation.

**▶️ Jouer : https://joshsssn.github.io/Test_game/**

> Publication automatique : à chaque push, le workflow
> `.github/workflows/pages.yml` joue les tests du moteur puis met à jour la
> branche `gh-pages`, que GitHub Pages sert à la racine.
>
> Le dépôt s'appelle encore `Test_game`. Une fois renommé en
> `Bataille-Prismatique` (Settings → General → Repository name), l'adresse
> devient `https://joshsssn.github.io/Bataille-Prismatique/` — GitHub laisse une
> redirection depuis l'ancienne.

Chaque joueur cache un inventaire de formes sur sa grille, sonde la grille
adverse à coups de laser, et doit **annoncer (« call ») toutes les formes de
l'autre** pour gagner.

---

## Règles

### But
Annoncer correctement **toutes** les formes de l'adversaire. Le premier qui y
parvient gagne immédiatement.

### Un tour = une action

| Action | Effet | Suite du tour |
|---|---|---|
| **Tirer un laser** depuis un bord | tu apprends le bord de sortie et la couleur — jamais le trajet | le tour passe à l'adversaire |
| **Call juste** sur une case | la forme est révélée | **tu rejoues** |
| **Call faux** | on te dit seulement « raté » | le tour passe à l'adversaire, et tu n'as rien appris de la grille |

Le call est donc un pari : réussi il enchaîne, raté il coûte un tour entier
d'information.

### Où cliquer pour annoncer une forme

Un bloc de 2 × 2 s'annonce **toujours par sa case en bas à gauche**. Viser un de
ses trois autres coins est un call raté — et le jeu ne dira pas que tu étais à
côté. L'étoile, qui ne fait qu'une case, s'annonce sur elle-même.

Un call juste révèle le bloc entier, et celui-ci ne compte que pour **une**
forme.

### Les formes

Le triangle, le carré et le losange occupent un **bloc de 2 × 2 cases** : c'est
ce qui rend chacune de leurs faces identifiable. Sur une seule case, on ne
saurait pas quelle face le laser a touchée, ni où il repart.

| Forme | Emprise | Effet sur le laser | Teinte |
|---|---|---|---|
| **Triangle** ◤ ◥ ◢ ◣ | 2 × 2 | **hypoténuse** → rebond à 90° ; **les deux cathètes** → demi-tour à 180°, comme un carré | bleu |
| **Carré** ■ | 2 × 2 | demi-tour à 180° sur ses quatre faces | rouge |
| **Losange** ◆ | 2 × 2 | rebond à 90° sur la face touchée ; ne se traverse jamais | jaune |
| **Étoile** ★ | 1 case | **traverse tout droit**, aucune déviation — seulement une recoloration | selon le mode |

Le dessin porte l'information : une face **brillante** renvoie à 90°, une face
en **pointillés** fait faire demi-tour.

Le triangle a **quatre orientations**, désignées par le coin où se trouve
l'angle droit ; il faut annoncer la bonne. Ses **trois faces agissent**. Le
quart de bloc opposé à l'angle droit est hors du triangle — le laser le traverse
sans y être teinté.

### Les trois modes de l'étoile

Le mode est choisi **à la configuration** et vaut pour les deux joueurs : ce
n'est pas quelque chose à deviner, mais ça change complètement la lecture des
couleurs.

| Mode | Effet | `bleu → étoile → rouge` donne |
|---|---|---|
| **Simple** | la teinte magenta s'ajoute au mélange | bleu + magenta + rouge |
| **Dominante** | efface les teintes précédentes et impose le magenta ; les suivantes se mélangent normalement | magenta + rouge — le bleu est perdu |
| **Blanche** | blanchit le laser et le verrouille | blanc, quoi qu'il rencontre ensuite |

### Les couleurs
Le laser part **blanc** et se teinte de chaque forme rencontrée. Une même forme
traversée deux fois ne compte qu'une fois. Quatre teintes de base se combinent
en 16 résultats (blanc, bleu, jaune, magenta, rouge, vert, turquoise, violet,
corail, orange, bordeaux, olive, marron, prune, ocre, noir). La table complète
est affichée en jeu.

### Deux propriétés à connaître
- **Un laser ressort toujours.** La propagation est une bijection sur
  (case, direction) : aucun cycle n'est atteignable depuis un bord. Vérifié par
  fuzzing dans les tests.
- **Le trajet est réversible, la couleur pas toujours.** Tirer depuis la sortie
  d'un tir ramène à son entrée. En mode d'étoile **simple** la couleur est
  identique et le tour est gaspillé ; en mode **dominante** ou **blanche**
  l'ordre des rencontres compte, donc la couleur peut différer — et ça peut
  valoir le tour. Le jeu avertit dans les deux cas.

---

## Un seul appareil, tour par tour

1. **Placement secret**, chacun son tour, avec un écran de passage entre les deux.
2. À la fin d'un tour, le résultat reste affiché tant que le joueur ne l'a pas
   validé — le temps de **prendre ses notes**.
3. Puis un **écran neutre « Avez-vous bien passé le tour ? »**, sans aucune
   information de jeu, qui attend la confirmation du joueur suivant.
4. Au début de chaque tour, un bandeau rappelle **le résultat de ton tour
   précédent**.

La partie est **sauvegardée automatiquement** après chaque action : écran
verrouillé, appel entrant ou onglet rechargé, on reprend exactement où on en
était (bouton « Reprendre » sur l'écran d'accueil).

Le jeu n'affiche jamais le trajet d'un laser sur la grille adverse — seulement
son entrée, sa sortie et sa couleur. Les tirs passés restent marqués sur les
bords, et le journal complet est consultable à tout moment.

## Autres écrans
- **Configuration** : pseudos, **dimensions libres** (de 4 à 26 colonnes, de 4 à
  40 lignes — 20 × 20, 18 × 7, ce qu'on veut), mode de l'étoile, et inventaire
  réglable forme par forme. Le budget de cases est plafonné à 45 % de la grille
  pour que la déduction garde du sens.
- **Laboratoire** : bac à sable solo où le trajet complet du laser est animé, et
  où l'on peut comparer les trois modes d'étoile sur un même tir.
- **Règles** : fiches des formes, des modes d'étoile et table des 16 mélanges.

---

## Développement

Tout est statique : les modules ES demandent simplement un serveur HTTP.

```bash
python3 -m http.server 8000     # puis http://localhost:8000
node --test tests/moteur.test.mjs
```

| Fichier | Rôle |
|---|---|
| `index.html` | structure des écrans |
| `css/style.css` | thème sombre, responsive, pensé mobile d'abord |
| `js/moteur.js` | moteur pur : propagation, formes, couleurs, placement (aucun DOM) |
| `js/jeu.js` | interface, machine à états des tours, sauvegarde |
| `tests/moteur.test.mjs` | 39 tests du moteur (`node --test`) |

Le moteur est volontairement séparé de l'interface : il n'utilise aucune API
navigateur et se teste directement sous Node.
