# 🔦 Lasers & Formes

Duel de déduction pour **2 joueurs sur un seul appareil**, jouable dans le
navigateur — aucun serveur, aucune dépendance, aucune installation.

**▶️ Jouer : https://joshsssn.github.io/Test_game/**

> Le déploiement est automatique (workflow `.github/workflows/pages.yml`), mais
> GitHub Pages doit être activé une première fois à la main :
> *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
> Tant que ce n'est pas fait, le job `deploy` échoue sur
> « Create Pages site failed » — l'action n'a pas le droit de créer le site
> elle-même.

Chaque joueur cache un inventaire de formes sur sa grille, sonde la grille
adverse à coups de laser, et doit **annoncer (« call ») toutes les formes de
l'autre** pour gagner.

---

## Règles

### But
Annoncer correctement **toutes** les formes de l'adversaire : case exacte, forme
exacte, et orientation exacte pour les triangles. Le premier qui y parvient
gagne immédiatement.

### Un tour = une action

| Action | Effet | Suite du tour |
|---|---|---|
| **Tirer un laser** depuis un bord | tu apprends le bord de sortie et la couleur — jamais le trajet | le tour passe à l'adversaire |
| **Call juste** sur une case | la forme est révélée | **tu rejoues** |
| **Call faux** | on te dit seulement « raté » : ni la forme réelle, ni si la case est vide | le tour passe à l'adversaire, et tu n'as rien appris de la grille |

Le call est donc un pari : réussi il enchaîne, raté il coûte un tour entier
d'information.

### Les formes

Le triangle, le carré et le losange occupent un **bloc de 2 × 2 cases** : c'est
ce qui rend chacune de leurs faces identifiable. Sur une seule case, on ne
saurait pas quelle face le laser a touchée, ni où il repart. L'étoile, elle, ne
dévie rien — elle n'a donc aucune face à distinguer et tient sur **une case**.

| Forme | Emprise | Effet sur le laser | Teinte |
|---|---|---|---|
| **Triangle** ◤ ◥ ◢ ◣ | 2 × 2 | **hypoténuse** → rebond à 90° ; **les deux cathètes** → demi-tour à 180°, comme un carré | bleu |
| **Carré** ■ | 2 × 2 | demi-tour à 180° sur ses quatre faces | rouge |
| **Losange** ◆ | 2 × 2 | rebond à 90° sur la face touchée ; ne se traverse jamais | jaune |
| **Étoile** ★ | 1 case | **traverse tout droit**, aucune déviation — seulement une teinte | magenta |

Le dessin porte l'information : une face **brillante** renvoie à 90°, une face
en **pointillés** fait faire demi-tour.

Le triangle a **quatre orientations**, désignées par le coin où se trouve
l'angle droit (NO, NE, SE, SO) ; il faut annoncer la bonne pour réussir un call.
Ses **trois faces agissent** : l'hypoténuse en miroir, les deux cathètes en mur.
Le quart de bloc opposé à l'angle droit est hors du triangle — le laser le
traverse sans y être teinté.

Un call juste sur **n'importe laquelle** des quatre cases d'un bloc révèle la
pièce entière, et celle-ci ne compte que pour **une** forme.

L'étoile est le piège du jeu : un magenta en sortie prouve qu'une étoile est sur
la trajectoire, sans rien dire de l'endroit.

### Les couleurs
Le laser part **blanc** et se teinte de chaque forme rencontrée. Une même forme
traversée deux fois ne compte qu'une fois. Quatre teintes de base se combinent
en 16 résultats (blanc, bleu, jaune, magenta, rouge, vert, turquoise, violet,
corail, orange, bordeaux, olive, marron, prune, ocre, noir). La table complète
est affichée en jeu.

### Deux propriétés utiles
- **Un laser ressort toujours.** La propagation est une bijection sur
  (case, direction) : aucun cycle n'est atteignable depuis un bord, donc aucun
  tir ne se perd. C'est vérifié par fuzzing dans les tests.
- **Un tir est réversible.** Tirer depuis la sortie d'un tir précédent ramène à
  son entrée, avec la même couleur : aucune information nouvelle. Le jeu
  prévient avant de gaspiller le tour.

---

## Un seul appareil, tour par tour

Le jeu est pensé pour un téléphone qu'on se passe de main en main :

1. **Placement secret**, chacun son tour, avec un écran de passage entre les deux.
2. À la fin d'un tour, le résultat reste affiché tant que le joueur ne l'a pas
   validé — le temps de **prendre ses notes**.
3. Puis un **écran neutre « Avez-vous bien passé le tour ? »**, sans aucune
   information de jeu, qui attend la confirmation du joueur suivant.
4. Au début de chaque tour, un bandeau rappelle **le résultat de ton tour
   précédent**, pour le noter tranquillement.

La partie est **sauvegardée automatiquement** dans le navigateur après chaque
action : écran verrouillé, appel entrant ou onglet rechargé, on reprend
exactement où on en était (bouton « Reprendre » sur l'écran d'accueil).

Le jeu n'affiche jamais le trajet d'un laser sur la grille adverse — seulement
son entrée, sa sortie et sa couleur. Les tirs passés restent marqués sur les
bords, et le journal complet est consultable à tout moment.

## Autres écrans
- **Configuration** : pseudos, taille de grille (6×6, 8×8, 10×10) et inventaire
  réglable forme par forme (défaut : 2 triangles, 1 carré, 1 losange, 1 étoile).
  Le plateau reste majoritairement vide : le budget de cases est plafonné à 45 %
  de la grille, blocs compris.
- **Laboratoire** : bac à sable solo où le trajet complet du laser est animé,
  pour apprendre les déviations et les mélanges.
- **Règles** : fiches des formes et table des 16 mélanges.

---

## Développement

Tout est statique : ouvrir `index.html` suffit, mais les modules ES demandent un
serveur HTTP.

```bash
python3 -m http.server 8000     # puis http://localhost:8000
node --test tests/moteur.test.mjs
```

| Fichier | Rôle |
|---|---|
| `index.html` | structure des écrans |
| `css/style.css` | thème sombre, responsive, pensé mobile d'abord |
| `js/moteur.js` | moteur pur : propagation du laser, formes, couleurs, placement (aucun DOM) |
| `js/jeu.js` | interface, machine à états des tours, sauvegarde |
| `tests/moteur.test.mjs` | 32 tests du moteur (`node --test`) |

Le moteur est volontairement séparé de l'interface : il n'utilise aucune API
navigateur et se teste directement sous Node.
