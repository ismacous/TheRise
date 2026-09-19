# The Rise — notes pour Claude

Jeu de gestion médiéval pour Android. Lisez `docs/DESIGN.md` avant de toucher
à l'équilibrage : les intentions y sont écrites, pas seulement les chiffres.

## Règles d'architecture

1. **`src/sim/` ne dépend jamais de `src/render/` ni de `three`.** La
   simulation tourne en headless dans les tests. Si vous ajoutez un besoin de
   rendu, passez par une file de changements (`world.terrainChanges`,
   `world.nodeChanges`) que le rendu vide chaque image.
2. **Les chiffres d'équilibrage vivent dans `src/data/`**, jamais dans la
   logique. Un nouveau bâtiment est une entrée dans `buildings.ts`, pas du
   code.
3. **Aucun asset externe.** Toute la géométrie est assemblée dans
   `src/render/meshBuilder.ts`. N'ajoutez pas de fichier `.glb` ou de texture :
   ça casserait la cohérence de style et la taille de l'APK.
   Les silhouettes vivent dans `src/render/buildings.ts`, en cache par
   (type, état, **niveau**). Un atelier garde une cour devant lui
   (`yardDepth` / `yardZ`) : un accessoire posé au bord de l'emprise finit
   *dans* les murs et ne se voit jamais.
4. **Aucun fichier audio.** Le son est synthétisé en Web Audio dans
   `src/render/audio.ts`, pour la même raison qu'il n'y a pas de `.glb`.
5. **L'interface est du DOM simple.** Pas de framework, pas de bundler
   supplémentaire. **Aucun emoji** : les glyphes vivent dans
   `src/ui/icons.ts` (SVG tracé en `currentColor`), une ressource ou un métier
   s'identifie par sa pastille de couleur, un villageois par son initiale.

## Avant de pousser

```bash
npm run typecheck && npm test
```

Les tests font tourner de vraies parties : si vous changez l'équilibrage, ils
vous diront tout de suite que le pain n'arrive plus au bout de la chaîne.

## Vérifier le rendu sans appareil

```bash
npm run build:fast
npx vite preview --port 4173 --host 127.0.0.1 &
node scripts/screenshot.mjs http://127.0.0.1:4173/ /tmp/shots 12   # captures
node scripts/stress.mjs     http://127.0.0.1:4173/ /tmp/stress      # charge
node scripts/ranks.mjs      http://127.0.0.1:4173/ /tmp/ranks bakery,forge  # rangs
```

`scripts/ranks.mjs` pose un bâtiment aux niveaux I, II et III côte à côte et
photographie le résultat : c'est le moyen le plus rapide de vérifier qu'un
bâtiment reste reconnaissable et que son niveau se lit au premier coup d'œil.

`scripts/stress.mjs` affiche le coût d'un tick de simulation. **Surveillez-le :
il est déjà passé de 14,6 ms à 1,1 ms pour une cité de 410 habitants, et il
est facile de le faire remonter.** Les pièges connus :

- parcourir tous les bâtiments pour chaque villageois à chaque tick ;
- recalculer un score coûteux (bonheur, couverture des services) sans étaler
  le calcul dans le temps ;
- appeler le pathfinding sans plafond.

En page, `window.theRise` expose `game`, `BUILDINGS`, `RESEARCH`, `GOODS`,
`createVillager` et `workerSlots` : de quoi piloter une partie depuis la
console ou un script. L'affectation étant manuelle, un script qui pose des
bâtiments doit aussi appeler `world.assignWorker(b.id)`, sinon rien ne tourne.

## APK

Le workflow `.github/workflows/android.yml` produit l'APK à chaque push ; il
est dans les artefacts de l'exécution. Un tag `v*` publie une release.
Le SDK Android n'est pas installable dans l'environnement de développement
distant, donc la compilation Android ne se vérifie que via CI.

## Pièges rencontrés

- Three r155+ interprète l'intensité des lumières en unités physiques : les
  valeurs « d'avant » doivent être multipliées par π, sinon la scène est noire.
- L'ombre du soleil doit couvrir tout le champ de vision, sinon le sol en
  dehors du frustum d'ombre est rendu comme s'il était à l'ombre.
- Les villageois agissent avant la mise à jour des incendies : tout test
  d'extinction doit utiliser une marge, pas une égalité à zéro.
- Retirer un nœud de `world.nodes` ne suffit pas : il faut aussi le retirer de
  `nodeGrid`, sinon les recherches tombent sur des arbres déjà abattus.
- Ne mutez jamais un `Building` pour l'adapter à une structure de données. Un
  `Object.assign(b, { x: b.cx, y: b.cy })` destiné à un index spatial a écrasé
  l'origine de chaque bâtiment par son centre : coordonnées fractionnaires,
  fertilité à `NaN`, et plus aucun pâturage ne produisait. Un test vérifie
  désormais que les empreintes restent sur des cases entières.
