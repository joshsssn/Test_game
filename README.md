# 🔺 Bataille Prismatique

Duel de déduction pour **2 joueurs sur un seul appareil**, ou **contre l'IA**,
jouable dans le navigateur — aucun serveur, aucune dépendance, aucune
installation.

**▶️ Jouer : https://joshsssn.github.io/Test_game/**

> Publication automatique : à chaque push, le workflow
> `.github/workflows/pages.yml` joue les tests du moteur puis met à jour la
> branche `gh-pages`, que GitHub Pages sert à la racine.

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

### Poser une forme, annoncer une forme

Ce sont deux conventions différentes, toutes deux ancrées sur des cases
« pleines » :

- **On pose** une forme par sa case pleine : le coin en bas à gauche d'un carré
  ou d'un losange, la case de l'angle droit d'un triangle, la case pleine du bas
  (ou de gauche, une fois couchée) d'une navette.
- **On annonce** une forme par sa case **la plus basse**, la plus à gauche s'il y
  en a plusieurs. Viser une autre de ses cases est un call raté — et le jeu ne
  dira pas que tu étais à côté.

Un call juste révèle la forme entière, et celle-ci ne compte que pour **une**
pièce.

### Les formes

Les formes s'étalent sur plusieurs cases : c'est ce qui rend chacune de leurs
faces identifiable, et donc le rebond déductible. Seule l'étoile, qui ne dévie
rien, tient sur une case.

| Forme | Emprise | Effet sur le laser | Teinte |
|---|---|---|---|
| **Triangle** ◤ ◥ ◢ ◣ | 3 cases | **hypoténuse** → rebond à 90° ; **les deux cathètes** → demi-tour à 180° | bleu |
| **Carré** ■ | 2 × 2 | demi-tour à 180° sur ses quatre faces | rouge |
| **Losange** ◆ | 2 × 2 | rebond à 90° sur la face touchée ; ne se traverse jamais | jaune |
| **Navette** ▮╱ ▮╲ ▬╱ ▬╲ | 4 en ligne | deux cases pleines au milieu, une pointe triangulaire à chaque bout | cyan |
| **Étoile** ★ | 1 case | **traverse tout droit**, aucune déviation — seulement une recoloration | selon le mode |

Le dessin porte l'information : une face **brillante** renvoie à 90°, une face
en **pointillés** fait faire demi-tour.

Le **triangle** a quatre orientations, désignées par le coin où se trouve l'angle
droit ; il faut annoncer la bonne. Il n'occupe que **trois** cases : le quart de
bloc opposé à l'angle droit ne lui appartient pas — il reste libre, et une étoile
peut très bien s'y loger.

La **navette** fait quatre cases en ligne. Ses deux pointes sont coupées dans le
même sens, ce qui donne une pièce en biais : un laser arrivant d'un côté est
renvoyé par trois lignes sur quatre et dévié par une seule pointe ; de l'autre
côté, c'est l'autre pointe qui dévie. Debout ou couchée, penchée dans un sens ou
dans l'autre : quatre variantes, une seule famille.

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
touchée deux fois ne compte qu'une fois. Cinq teintes de base, donc **32
résultats** possibles. À ce nombre, l'œil ne suffit plus : c'est le **nom** écrit
dans le journal qui fait foi, la nuance n'est qu'un repère. La table complète est
affichée en jeu.

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

## Jouer contre l'IA

Trois niveaux, qui ne sont **pas** le même joueur qu'on affaiblit : ils reçoivent
exactement le même temps de réflexion et le même nombre d'hypothèses (mesures à
l'appui, en donner davantage n'améliore plus rien). Ce qui les sépare est
uniquement stratégique.

Toutes partagent le même noyau : un ensemble d'hypothèses compatibles avec ce que
l'IA a réellement observé, entretenu par recuit simulé. Elle ne voit jamais la
grille adverse — elle ne reçoit que le résultat de ses propres actions, comme un
joueur humain.

| Niveau | Comment elle attaque | Comment elle se cache |
|---|---|---|
| **Facile** | sonde au hasard les bords non essayés | au hasard |
| **Moyen** | choisit le tir qui départage le mieux les positions encore possibles | au hasard |
| **Difficile** | idem, et annonce dès qu'un pari est rentable au lieu d'attendre l'unanimité | groupe ses formes pour laisser passer un maximum de lasers |

Mesures sur 8 à 24 grilles, à conditions égales :

- **Attaque** : le tir informé fait tomber le nombre de sondages d'environ 22 à
  environ 17. En revanche moyen et difficile attaquent à la même vitesse — la
  stratégie de tir sature là.
- **Défense** : c'est là que se joue l'écart. Sur 40 grilles, il faut en moyenne
  **23,7 ± 1,3 tirs** pour percer un placement du niveau difficile contre
  **19,8 ± 1,1** pour un placement au hasard — un écart de **+4,0 ± 1,7**, donc
  significatif. L'écart-type d'une grille à l'autre est grand (près de 7 tirs) :
  sur une poignée de parties, la différence se noie dans le bruit.

Ce dernier point est contre-intuitif et a été trouvé en mesurant, pas en
raisonnant : pour se cacher, il faut **minimiser** le nombre de lasers qui
rencontrent une forme. Un laser qui traverse sans rien toucher n'apprend qu'une
chose — « cette ligne est vide » — alors qu'un laser qui rencontre une forme
livre une sortie et une couleur, c'est-à-dire de la position. Une première
version faisait exactement l'inverse et rendait la grille *plus facile* à percer
(16,8 tirs).

---

## Un seul appareil, tour par tour

1. **Placement secret**, chacun son tour, avec un écran de passage entre les deux.
2. À la fin d'un tour, le résultat reste affiché tant que le joueur ne l'a pas
   validé — le temps de **prendre ses notes**.
3. Puis un **écran neutre « Avez-vous bien passé le tour ? »**, sans aucune
   information de jeu, qui attend la confirmation du joueur suivant.
4. Au début de chaque tour, un bandeau rappelle **le résultat de ton tour
   précédent**.

En solo, ces écrans de passage disparaissent : l'IA joue son tour sous les yeux
du joueur, action par action.

La partie est **sauvegardée automatiquement** après chaque action : écran
verrouillé, appel entrant ou onglet rechargé, on reprend exactement où on en
était (bouton « Reprendre » sur l'écran d'accueil).

Le jeu n'affiche jamais le trajet d'un laser sur la grille adverse — seulement
son entrée, sa sortie et sa couleur. Les tirs passés restent marqués sur les
bords, et le journal complet est consultable à tout moment.

## Autres écrans
- **Configuration** : 1 ou 2 joueurs, niveau de l'IA, pseudos, **dimensions
  libres** (de 4 à 26 colonnes, de 4 à 40 lignes — 20 × 20, 18 × 7, ce qu'on
  veut), mode de l'étoile, et inventaire réglable forme par forme. Le budget de
  cases est plafonné à 45 % de la grille, et le jeu vérifie réellement que
  l'inventaire peut être posé avant de lancer la partie.
- **Laboratoire** : bac à sable solo où le trajet complet du laser est animé, et
  où l'on peut comparer les trois modes d'étoile sur un même tir.
- **Règles** : fiches des formes, des modes d'étoile et table des 32 mélanges.

---

## Développement

Tout est statique : les modules ES demandent simplement un serveur HTTP.

```bash
python3 -m http.server 8000     # puis http://localhost:8000
node --test tests/*.mjs          # 40 tests du moteur + 13 tests de l'IA
```

| Fichier | Rôle |
|---|---|
| `index.html` | structure des écrans |
| `css/style.css` | thème sombre, responsive, pensé mobile d'abord |
| `js/moteur.js` | moteur pur : gabarits des formes, propagation, couleurs, placement (aucun DOM) |
| `js/ia.js` | adversaire artificiel : hypothèses, recuit simulé, choix du tir et de l'annonce |
| `js/jeu.js` | interface, machine à états des tours, sauvegarde |
| `tests/` | tests du moteur et de l'IA (`node --test`) |

Chaque forme est décrite par un **gabarit** — la liste de ses cases avec le rôle
de chacune vis-à-vis du laser (mur, miroir, triangle, filtre) — d'où découlent à
la fois la physique, le dessin SVG, le placement et les règles d'annonce. Ajouter
une forme, c'est ajouter un gabarit.

Le moteur et l'IA sont volontairement séparés de l'interface : ils n'utilisent
aucune API navigateur et se testent directement sous Node.
