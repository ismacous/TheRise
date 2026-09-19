# The Rise — document de conception

Ce document décrit ce que le jeu fait aujourd'hui et pourquoi. Il sert de
référence pour équilibrer, étendre ou corriger sans casser l'intention.

---

## 1. Intention

Deux mots gouvernent chaque décision : **chill** et **satisfaction**.

- Chill : aucun échec définitif, aucun adversaire, aucun timer punitif. Le pire
  qui puisse arriver est un incendie ou un hiver mal préparé, et le village s'en
  remet.
- Satisfaction : voir la vallée se remplir. Chaque recherche débloque un métier
  visible à l'écran, chaque amélioration change la silhouette d'un bâtiment.

Conséquences directes :

- pas de combat, pas de PvP, pas d'énergie ni de monétisation ;
- la partie tourne toute seule : on peut poser le téléphone et revenir ;
- les crises sont des **problèmes de gestion**, jamais des défaites.

---

## 2. Boucle de jeu

```
récolter ──► raffiner ──► consommer ──► bonheur ──► population ──► récolter…
    │                          │
    └──────► vendre ──► or ────┘
```

La progression est verrouillée par l'**arbre de recherche**, pas par le temps.
Le joueur ne peut pas miner du fer à la minute 5, mais tout ce dont il a besoin
est atteignable en quelques minutes de jeu.

### L'arbre de recherche : cinq ères

L'arbre est découpé en cinq **ères** de sept à treize études. Une ère ne
s'ouvre que lorsque la précédente est entièrement terminée. C'est ce qui
garantit qu'une chaîne n'est jamais débloquée à moitié : la chasse et la
boucherie sont une seule étude, le moulin et le four aussi. Un test vérifie
qu'aucun bâtiment débloqué ne consomme un bien qu'aucune ère antérieure ne
produit.

| Ère | Nom | Ce qu'elle ouvre |
|---|---|---|
| 1 | Les premiers feux | Nourriture de base, bois, pierre, marché, chaumières |
| 2 | Le pain quotidien | Champs, moulin et four, conservation, volaille |
| 3 | Métiers et échanges | Textile, cuir, charbon, comptoir de commerce |
| 4 | L'âge du fer | Fer, forge, briques, brasserie, entrepôts, secours |
| 5 | La cité | Or, mines profondes, port, halles, demeures |

Deux verrous, et deux seulement :

- **L'université.** Sans elle, aucune étude n'est possible. Chaque érudit
  affecté ajoute 0,55 à la vitesse d'étude (0,35 pour le bâtiment vide), et
  les chandelles la multiplient par 1,35. Trois érudits divisent par deux la
  durée annoncée.
- **L'argent.** Une étude coûte des pièces, de 35 pour les sentiers battus à
  3 400 pour la charte de guilde. C'est l'impôt qui paie la recherche, ce qui
  relie directement la politique fiscale à la vitesse de progression.

### Les deux ressources abstraites

| | Source | Sert à |
|---|---|---|
| **Or** | Impôts (par adulte, modulé par le taux, le bonheur et le rang), taverne, commerce | Coût des bâtiments, études, achats aux partenaires |
| **Bonheur** | Logement, nourriture variée, services, biens de confort, taux d'imposition | Natalité, immigration, impôts, rang du village |

### L'impôt

Réglable de 0 à 100 % depuis l'hôtel de ville, 50 % au départ. Le rendement
est linéaire : 2,2 pièces par adulte et par jour au taux neutre, avec un
moral correct. Le bonheur suit l'inverse, sur une amplitude de 26 points
entre un village exempté et un village pressuré. Monter l'impôt finance la
recherche ; le laisser trop haut vide le village.

---

## 3. Chaînes de production

Chaque ressource brute a un atelier qui la rend utile. C'est la règle de design
la plus importante : **rien de brut ne se consomme directement.**

```
arbres ─► rondins ─► [scierie] ─► planches ─► [menuiserie] ─► mobilier
                                           └► [fléchier] + plumes ─► flèches
rondins ─► [charbonnière] ─► charbon de bois

roche ─► pierre                    argile ─► [four] + charbon ─► briques
filon de charbon ─► charbon
filon de fer ─► minerai ─► [fonderie] + charbon ─► lingot ─► [forge] ─► outils
filon d'or ─► minerai ─► [fonderie] ─► lingot ─► [orfèvre] ─► joaillerie

blé ─► [moulin] ─► farine ─► [boulangerie] + charbon ─► pain
blé ─► [brasserie] ─► bière ─► [taverne] ─► bonheur

gibier ─► [boucherie] ─► viande + peau
peau ─► [tannerie] ─► cuir ─► [cordonnerie] ─► bottes
laine ou lin ─► [tissage] ─► tissu ─► [couture] + plumes ─► vêtements
                                   └► [cirerie] + charbon ─► chandelles
poisson ─► [fumoir] + charbon ─► poisson fumé
```

Trois dépendances croisées structurent la partie :

1. **Le combustible.** Boulangerie, fonderie, four à briques et fumoir veulent
   du charbon. La charbonnière (bois) le fournit tôt, la mine plus tard et en
   quantité. C'est le premier goulot d'étranglement intéressant.
2. **Les plumes.** Le poulailler est le premier palier d'élevage et alimente à
   la fois les flèches et les vêtements d'hiver.
3. **Les flèches.** Le pavillon de chasse en consomme. Sans fléchier, la chasse
   avancée s'arrête — ce qui pousse à construire une vraie filière plutôt qu'à
   empiler des camps.

### Paliers d'amélioration

Sept familles montent en gamme sur place, en conservant l'équipe et le stock :

| Famille | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| Habitation | Cabane | Chaumière | Maison | Demeure |
| Pêche | Cabane | Ponton | Appontement | Port |
| Bois | Camp | Exploitation | — | — |
| Pierre | Carrière | Grande carrière | — | — |
| Mine | Mine | Mine profonde | — | — |
| Scierie | Scierie | Scierie hydraulique | — | — |
| Marché | Marché | Grand marché | — | — |
| Stockage | Entrepôt | Grand entrepôt | — | — |

---

## 4. Les villageois

Chaque villageois est un agent autonome avec :

- un **métier** attribué automatiquement selon la priorité des bâtiments ;
- un **foyer** (le plus proche de son travail) ;
- quatre besoins : satiété, bonheur, énergie, santé ;
- une apparence propre : teint, cheveux, corpulence, tenue liée au métier.

### Machine à états

```
inactif ──► récolte ──► marche vers le nœud ──► travail ──► retour au camp
        ├─► production ──► marche vers l'atelier ──► travail
        ├─► livraison ──► source ──► destination
        ├─► chantier
        ├─► manger (satiété < 32)
        ├─► dormir (la nuit, énergie < 55)
        └─► éteindre un incendie
```

Deux garde-fous évitent les blocages observés en test :

- **Affectation manuelle.** Le joueur décide qui travaille où. L'ancien quota
  automatique de porteurs (25 % des adultes) n'existe plus : les entrepôts
  n'ont que le nombre de postes qu'ils offrent, et les adultes non affectés
  sont précisément ceux qui bâtissent et transportent.
- **Soupape d'auto-portage.** Un récolteur dont le camp est plein à 60 % porte
  lui-même une charge à l'entrepôt.

### Démographie

- Adulte à 4 jours de jeu, vieillesse à partir de 26. Le village est fondé par
  des jeunes adultes (6 à 16 jours) : le peupler de trentenaires revenait à
  enterrer un tiers des colons dans la première demi-heure.
- Une mère potentielle (18-42 ans, logée, bonheur > 45) a environ un enfant tous
  les huit jours au meilleur moral, et quasiment aucun s'il n'y a plus de lits.
- Les enfants mangent comme tout le monde. Leur boucle de comportement sautait
  autrefois la règle « va manger » : aucun enfant né au village n'atteignait
  l'âge adulte, et seule l'immigration faisait croître la population.
- L'immigration dépend du bonheur et du rang du village, et s'arrête net si les
  logements sont pleins ou si les vivres passent sous le seuil ci-dessous.

### Les seuils de vivres

Ils vivent tous dans `src/sim/villagers.ts` et nulle part ailleurs :

| Seuil | Jours de vivres | Effet |
|---|---|---|
| `FOOD_EXODUS_DAYS` | 0,75 | En dessous, les villageois commencent à partir |
| `FOOD_BIRTH_DAYS` | 1,5 | Au-dessus, les naissances redeviennent possibles |
| `FOOD_IMMIGRATION_DAYS` | 2 | Au-dessus, de nouveaux venus s'installent |

La faim se compte par seconde réelle, pas par journée de jeu — comme la
production. Allonger la journée de 2 à 12 minutes a donc multiplié par six la
quantité que représente « un jour de vivres », sans toucher à ces seuils :
un village neuf naissait sous la ligne d'exode et ne pouvait que se vider. Un
test (`tests/population.test.ts`) vérifie désormais qu'une partie où le joueur
ne fait rien pendant vingt minutes ne perd personne.

---

## 5. Logistique

Un **tableau de tâches** est reconstruit chaque seconde et couvre cinq besoins :

1. livrer les matériaux aux chantiers (priorité la plus haute) ;
2. sortir les produits finis des ateliers vers les entrepôts ;
3. approvisionner les ateliers en intrants ;
4. garnir les marchés en vivres et biens de confort ;
5. fournir les chandelles aux chapelles et aux érudits.

Les tâches déjà prises par un porteur sont conservées d'un cycle à l'autre :
personne n'est jamais détourné d'une livraison en cours.

Un marché ne stocke qu'environ un jour de consommation par denrée, afin qu'il
ne vide pas les entrepôts — et les réserves de nourriture comptent aussi bien le
contenu des marchés que celui des entrepôts.

---

## 6. Monde

Carte de 208 × 208 tuiles générée depuis une graine :

- relief par bruit fractal, avec un rebord montagneux qui ferme la vallée ;
- une à trois rivières creusées en suivant la pente, plus un lac dans le bassin
  le plus bas ;
- biomes issus de l'altitude et de l'humidité : herbe, forêt, roche, sable ;
- gisements groupés par bruit : pierre, argile au bord de l'eau, charbon, fer et
  or dans les hauteurs ;
- troupeaux de gibier qui errent en forêt et se repeuplent lentement ;
- le point de départ est choisi pour offrir une clairière, de la forêt à portée
  et de l'eau à moins de vingt cases.

Le temps : un jour = 120 s à vitesse normale, une saison = 6 jours, une année =
24 jours. Les saisons changent le rendement des champs, la consommation de
nourriture et toute la palette de couleurs.

---

## 7. Événements

| Événement | Effet | Parade |
|---|---|---|
| Incendie | Le bâtiment brûle et peut se propager aux voisins | Puits, tour de guet, espacer les ateliers à risque |
| Épidémie | Une part des villageois est alitée | Maison de l'herboriste |

Une fièvre use son malade jusqu'à 30 points de santé et pas plus bas : elle ne
tue jamais à elle seule, et personne ne quitte le village en étant alité. Seule
la faim peut vider la jauge — une épidémie sur un ventre vide reste mortelle.
Avant correction, la maladie retirait un demi-point de santé par seconde pour
une guérison en quatre minutes : chaque malade mourait sans exception.
| Pluie bienfaisante | Croissance accélérée, moral en baisse | — |
| Récolte exceptionnelle | Une moisson offerte | — |
| Famille sur les routes | Nouveaux habitants | Avoir des lits libres |
| Colporteur | Or offert | — |
| Saison difficile | Consommation de vivres en hausse | Grenier, fumoir, réserves |

Le risque d'incendie dépend du bâtiment (charbonnière et fonderie en tête), de
la saison, de la météo et de la couverture en puits.

---

## 8. Commerce

Sept partenaires répartis sur quatre paliers, débloqués par la recherche :

| Palier | Type | Caractère |
|---|---|---|
| 1 | Hameaux | Petits volumes, matières premières |
| 2 | Bourgs | Bon débouché pour l'artisanat |
| 3 | Cités | Paient le luxe au prix fort |
| 4 | Lointain | Trajets très longs, marges énormes |

Les prix bougent avec trois facteurs : le multiplicateur propre à l'offre, la
relation avec le partenaire (qui monte à chaque échange), et le rang du village.
Les caravanes mettent du temps à faire l'aller-retour, ce qui rend l'achat
d'urgence coûteux en temps plutôt qu'interdit.

---

## 8 bis. L'interface

Du DOM simple, sans framework, et **sans un seul emoji**. Ils rendaient
différemment d'une version d'Android à l'autre, imposaient leurs propres
couleurs et devenaient illisibles à la taille d'une pastille de HUD.

- **Glyphes.** `src/ui/icons.ts` dessine une cinquantaine d'icônes en SVG sur
  une grille de 24, tracées en `currentColor` : la palette de la page les teinte
  et un chip de 12 pixels reste lisible.
- **Pastilles.** Une ressource ou un métier s'identifie par sa couleur, pas par
  un pictogramme. Un test vérifie que deux ressources n'ont jamais la même.
- **Avatars.** L'initiale du villageois sur la couleur de sa tunique — celle
  qu'il porte sur la carte.
- **Barre de ressources.** Trois ressources épinglées et une jauge d'entrepôt,
  sur une ligne qui ne défile pas. L'ancienne barre listait les vingt-huit
  ressources et le chiffre qu'on cherchait était toujours hors de l'écran. La
  page **Ressources** montre le reste, groupé par catégorie ; on y épingle ce
  qu'on veut voir en haut.
- **Pages plein écran.** `.sheet.full` et l'ensemble `FULL_SHEETS` : Savoir,
  Économie et Ressources s'y affichent.

---

## 9. Rendu

- **Terrain** : deux triangles par tuile, découpé en chunks de 26 tuiles,
  couleur par tuile issue d'un bruit basse fréquence, ombrage des pentes.
- **Végétation** : géométries fusionnées par chunk, reconstruites par budget de
  deux chunks par image.
- **Bâtiments** : une géométrie partagée par (type, état, **niveau**), donc cent
  chaumières du même rang ne coûtent qu'un seul buffer. Pièces animées séparées.
  Chaque bâtiment a ses accessoires — la tente et le feu du camp de chasse, la
  scie et les planches de la scierie, le four du boulanger, le métier à tisser
  — posés dans la cour que l'atelier garde devant lui. Le rang se lit sans
  connaître le bâtiment : une bordure de pierre au niveau II, un fanion, puis
  deux fanions et un épi doré au niveau III.
- **Villageois** : quatre `InstancedMesh` (tenue, peau, cheveux, charge) avec
  couleur par instance. La population entière coûte quatre draw calls.
- **Éclairage** : un soleil directionnel dont l'ombre est dimensionnée sur le
  champ de vision, plus hémisphérique et ambiante. Les intensités suivent les
  unités physiques de Three r155+.

---

## 10. Équilibrage — chiffres de référence

| Grandeur | Valeur |
|---|---|
| Journée | 720 s (12 minutes) |
| Consommation | 0,26 point de satiété par villageois et par **seconde** |
| Conversion | 1 nutrition = 22 points de satiété |
| Besoin réel | ≈ 8,5 nutrition par villageois et par jour |
| Larder de départ | 165 unités, soit ≈ 3 jours pour les dix fondateurs |
| Pain | 3 nutrition (soit ~1,7 jour pour une personne) |
| Camp de bûcherons | 7 rondins toutes les ~15 unités de travail, 2 ouvriers |
| Scierie | 2 rondins → 3 planches |
| Vitesse de marche | 2,6 tuiles/s, ×1,35 sur sentier, ×1,8 sur pavé |
| Porteurs | 25 % des adultes au maximum |

Ces valeurs sont toutes regroupées dans `src/data/` et `src/sim/villagers.ts` ;
aucune n'est dispersée dans le code de rendu.
