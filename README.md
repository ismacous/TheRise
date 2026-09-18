# The Rise

Un jeu de gestion médiéval pour Android. Vous arrivez dans une vallée où il ne
reste qu'un hôtel de ville et quelques ruines. Vous en faites une cité.

Inspiré de **Foundation** (Polymorph Games), repensé pour l'écran tactile :
pas de placement libre au pixel près, mais la même boucle — des chaînes de
production qui s'imbriquent, des villageois autonomes qu'on regarde travailler,
et la satisfaction de voir un hameau devenir une ville.

**Pas de guerre, pas de PvP, pas de timer de rage.** Le jeu est fait pour être
joué tranquillement.

---

## L'essentiel

| | |
|---|---|
| Plateforme | Android (APK), jouable aussi dans un navigateur |
| Moteur | TypeScript + Three.js, aucun asset externe |
| Enveloppe native | Capacitor |
| Carte | 208 × 208 tuiles, relief, rivières, lac, forêts, gisements |
| Contenu | 60 bâtiments · 38 ressources · 54 recherches · 7 partenaires commerciaux |
| Rendu | Low poly facetté, cycle jour/nuit, 4 saisons, météo |

Toute la direction artistique est **générée par le code** : chaque maison,
chaque arbre et chaque villageois est assemblé à partir de primitives. L'APK
reste donc minuscule et le style parfaitement homogène.

---

## Jouer

```bash
npm install
npm run dev          # http://localhost:5173
```

### Fabriquer l'APK

En local (nécessite le SDK Android et un JDK 17) :

```bash
npm run android:apk
# android/app/build/outputs/apk/debug/app-debug.apk
```

Sur GitHub : le workflow **Android APK** se déclenche à chaque push. L'APK est
disponible dans les artefacts de l'exécution. Un tag `v*` publie en plus une
release avec l'APK attaché.

### Tests

```bash
npm test         # simulation, chaînes de production, intégrité des données
npm run typecheck
```

Les tests ne se contentent pas de vérifier des fonctions : ils font tourner de
vraies parties en accéléré et vérifient que le pain arrive bien au bout de la
chaîne blé → farine → pain.

---

## La boucle de jeu

1. **Le bois d'abord.** Un camp de bûcherons, une scierie. Tout part de là.
2. **Nourrir.** Baies, puis chasse, pêche, et enfin la vraie solution : les
   champs, le moulin et la boulangerie.
3. **Loger.** Cabanes, puis chaumières, maisons, demeures. Plus de lits veut
   dire plus d'habitants, donc plus de bras.
4. **Chercher.** Les points de recherche tombent tout seuls, lentement. La
   Maison des érudits accélère tout. Chaque palier ouvre un métier.
5. **Raffiner.** Pierre, argile, charbon, fer, or. Chaque minerai demande son
   atelier, chaque atelier demande son combustible.
6. **Vendre.** Le comptoir de commerce ouvre des routes vers des hameaux, puis
   des bourgs, puis des cités. Plus votre village est grand, plus on vous
   achète cher.

### Ce qui peut mal tourner

Pas d'ennemis, mais des vraies crises de gestion :

- **Le feu.** Les fours, les forges et les charbonnières brûlent. Les puits et
  la tour de guet font la différence entre un incendie et une catastrophe.
- **La maladie.** L'herboriste raccourcit les épidémies.
- **L'hiver.** La consommation grimpe, les champs s'arrêtent. Le grenier et le
  fumoir se remplissent en automne ou pas du tout.
- **La pluie.** Les récoltes accélèrent, le moral baisse.
- **La saturation.** Un entrepôt plein bloque toute la production en amont.

---

## Contrôles

| Geste | Effet |
|---|---|
| Glisser à un doigt | Déplacer la caméra |
| Pincer | Zoomer |
| Tourner à deux doigts | Pivoter |
| Glisser à deux doigts verticalement | Incliner la vue |
| Toucher un bâtiment | Ouvrir sa fiche |
| Toucher un villageois | Le suivre |

En mode construction, un doigt pose le bâtiment ; pour les routes, on trace en
glissant.

---

## Architecture

```
src/
  core/        RNG déterministe, bruit, utilitaires, bus d'événements
  data/        Catalogues : ressources, bâtiments, recherches, métiers, commerce
  sim/         Simulation pure, sans aucune dépendance au rendu
  render/      Three.js : terrain, props, bâtiments, villageois, effets, caméra
  ui/          Interface DOM, sans framework
```

La règle structurante : **`sim/` ne connaît pas `render/`**. La simulation
tourne en headless dans les tests, ce qui permet de valider l'équilibrage sans
ouvrir un navigateur. Le rendu lit l'état et dessine ; les modifications de
terrain ou de ressources passent par des files de changements que le rendu vide
à chaque image.

Voir [`docs/DESIGN.md`](docs/DESIGN.md) pour le détail des systèmes et
[`docs/ROADMAP.md`](docs/ROADMAP.md) pour la suite.

---

## Performances

Mesuré à 412 × 915 en device pixel ratio 2, avec un rendu logiciel (donc
largement pessimiste par rapport à un vrai téléphone) :

- ~30 draw calls, ~85 000 triangles pour un village de départ
- 4 draw calls pour toute la population, quelle qu'en soit la taille
- terrain et végétation découpés en chunks, reconstruits par budget

Trois niveaux de qualité sont détectés automatiquement et modifiables dans les
options.
