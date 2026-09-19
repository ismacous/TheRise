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

Trois verrous :

- **L'université.** Sans elle, aucune étude n'est possible — et sans érudit
  affecté non plus. Un hall vide avançait tout seul, assez lentement pour
  passer inaperçu et assez vite pour qu'on puisse gravir tout l'arbre sans
  jamais y mettre personne. Chaque érudit ajoute 0,6 à la vitesse d'étude, les
  chandelles la multiplient par 1,35.
- **L'argent.** Une étude coûte des pièces. Les prix montent d'une ère à
  l'autre : on les débloquait trop facilement, et la partie était finie avant
  son milieu. Un test refuse une ère qui coûterait moins cher que la
  précédente.
- **L'impôt lui-même**, qui est une étude. Voir plus bas : jusqu'à
  « Registre et dîme », personne ne paie rien.

Les niveaux II et III des bâtiments sont eux aussi dans l'arbre — « Maîtres
bâtisseurs » à l'ère 2, « Grands travaux » à l'ère 4. Ils étaient accessibles
dès la première minute.

### Les noms

Le village est nommé à sa fondation — le nom proposé est tiré au sort, on le
garde d'une touche ou on le remplace — et renommé depuis l'hôtel de ville.
Chaque villageois se renomme depuis sa fiche, prénom et nom.

La boîte de dialogue est du DOM (`src/ui/dialog.ts`), pas `window.prompt` :
sur Android celui-ci ouvre une fenêtre système qui ne ressemble à rien du jeu
et se comporte mal dans une WebView Capacitor. Elle ne bloque jamais le
démarrage — la partie tourne derrière — sinon le harnais de test headless
attendrait indéfiniment une réponse que personne ne donne.

### D'où vient le bonheur

Quatre sources, et le design ne fonctionne que si les quatre comptent :

| Source | Ce qui la porte |
|---|---|
| **Le foyer** | Avoir un lit (−24 sans), le confort du logement, la promiscuité |
| **Le travail** | +7 pour un poste dans un atelier qui tourne, +2 s'il est à l'arrêt, −6 sans emploi |
| **L'impôt** | ±13 selon le taux, réglé à l'hôtel de ville |
| **Les loisirs** | Marché, chapelle, taverne, **ornements et lieux de loisir** (voir §7 bis) |

S'y ajoutent la variété de l'assiette, la satiété, la maladie, la météo et la
saison. Le terme « travail » manquait : occuper un poste évitait seulement une
pénalité, il n'apportait rien.

### Les deux ressources abstraites

| | Source | Sert à |
|---|---|---|
| **Or** | Impôts (par adulte, modulé par le taux, le bonheur et le rang), taverne, commerce | Coût des bâtiments, études, achats aux partenaires |
| **Bonheur** | Logement, nourriture variée, services, biens de confort, taux d'imposition | Natalité, immigration, impôts, rang du village |

### L'impôt

**Il n'existe pas tant qu'on ne l'a pas étudié.** « Registre et dîme » (ère 1)
ouvre un registre ; avant, le taux est à zéro, le rendement est nul, et le
panneau de l'hôtel de ville ne montre pas de curseur mais la ligne qui dit
quoi étudier. Le village n'a alors ni gratitude ni rancune fiscale : il n'y a
rien à ressentir. L'étude terminée pose le taux à 50 %.

C'est la seule étude dont le prix n'a pas bougé lors du ralentissement de la
courbe : rien d'autre ne fait entrer de pièces avant elle, et la bourse de
fondation (150) doit couvrir l'université (60) *et* le registre (50). Une
porte d'entrée inabordable n'est pas un départ lent, c'est une absence de
départ.

Ensuite : réglable de 0 à 100 % depuis l'hôtel de ville. Le rendement est
linéaire — 2,2 pièces par adulte et par jour au taux neutre, avec un moral
correct. Le bonheur suit l'inverse, sur une amplitude de 26 points entre un
village exempté et un village pressuré.

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

### Bâtiments dans les bâtiments

Deux couples ne se posent pas n'importe où et ne montent pas en niveau l'un
sans l'autre :

| Dépendant | Doit être posé | Zone |
|---|---|---|
| Hutte du forestier | Dans un camp de bûcherons ou une exploitation | Le **cercle** de coupe du camp |
| Moulin à vent | Dans un champ de blé | Le **rectangle** du champ, élargi de 5 cases |

La règle de placement `{ kind: 'within', hosts, margin }` prend la forme de
son hôte : un hôte qui récolte prête son cercle de récolte, tout autre hôte
prête son emprise élargie. Pendant la pose, l'anneau affiché est celui de
l'hôte, pas celui du bâtiment posé — sans ça le joueur cherche à l'aveugle.

Améliorer l'un améliore l'autre, gratuitement et dans les deux sens. Un camp
qui dépasse son forestier vide la forêt ; un champ qui dépasse son moulin
accumule du blé que personne ne moud.

### Le champ au fil de l'année

Un champ traverse cinq états visibles, déduits de sa progression vers la
prochaine moisson : chaume et gerbes juste après la récolte, terre retournée,
jeunes pousses, tiges vertes, puis épis mûrs et lourds. C'était auparavant une
image figée de blé mûr quel que soit ce que le champ faisait, ce qui réduisait
toute la filière agricole à un nombre dans un panneau.

La géométrie reste partagée : le cache des silhouettes gagne une clé
(type, état, niveau, **stade**), et seuls les champs ont un stade non nul.

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

### Les dépôts font leur tournée

Un entrepôt n'était qu'un hangar : les biens n'y arrivaient que parce qu'un
villageois du vivier général passait par là, et seulement une fois qu'un
atelier avait une pleine charge en attente. Un dépôt **doté de porteurs** fait
maintenant sa tournée : chacun de ses employés va chercher ce qui s'accumule
dans un atelier de son rayon, même les petites quantités, et le ramène.

| | Places au niveau I | Rayon de tournée au niveau I |
|---|---|---|
| Hôtel de ville | 200, **fixes** | — |
| Entrepôt | 300 | 22 cases |
| Grenier | 600 | — |
| Grand entrepôt | 900 | 40 cases |

Les capacités ont été réduites : un dépôt qui contenait l'essentiel de la
production d'un village dispensait le joueur de réfléchir à où vont les
choses. Celle de l'hôtel de ville ne bouge pas avec son niveau — c'est l'aide
du premier jour, pas un entrepôt dont on pourrait se contenter.

Le rayon grandit avec le niveau, comme tous les rayons du jeu. Un porteur
affecté à un dépôt privilégie les tâches qui y mènent : c'est pour ça qu'on
l'a affecté là. Et il tire une **charrette** — la même qui lui vaut déjà 60 %
de charge en plus dans la simulation. Elle coûte un sixième appel de rendu
pour toute la population, quelle qu'en soit la taille.

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

## 7 bis. Ce qui rend le village vivant

### Les chemins d'usure

Personne ne trace la piste entre le camp de bûcherons et l'entrepôt : elle
apparaît parce que les mêmes pieds traversent la même herbe quelques centaines
de fois. Chaque villageois qui **marche** (pas qui flâne) dépose de l'usure sur
sa case ; au-delà d'un seuil la case devient un **sentier d'usure**, un
quatrième niveau de route (`sim/paths.ts`). Quand le passage cesse, l'herbe
reprend.

- Le sentier d'usure donne un bonus de vitesse **plus faible** qu'un sentier
  posé à la main : « Sentiers battus » reste une étude utile.
- Une case qui devient sentier en ensemence légèrement ses voisines, sinon le
  chemin reste une ligne d'une case que personne ne voit à la distance de jeu.
- Le coût est d'une entrée de `Map` par case réellement foulée — quelques
  dizaines, pas les quarante mille cases de la carte. Mesuré : sous le bruit
  de mesure.

### Les ornements et les loisirs

Deux nouvelles familles de service alimentent le champ de bonheur :

| | Exemples | Portée | Étude |
|---|---|---|---|
| `decor` | Parterre, banc, lampadaire, fontaine, statue | 6 à 14 | Embellissement (ère 2), Fierté civique (ère 4) |
| `leisure` | Place du village, théâtre de tréteaux | 16 à 22 | idem |

Le bonheur décroît avec la distance, donc **plus on habite près, plus on est
heureux** — c'est ce qui donne un intérêt à remplir les creux d'un quartier
plutôt qu'à poser un seul gros bâtiment.

### Le son

Tout est synthétisé à la volée en Web Audio (`render/audio.ts`) : **aucun
fichier audio**, pour la même raison qu'aucun `.glb`. Le vent est du bruit
filtré, la pluie le même bruit plus brillant, un oiseau deux balayages de
sinus, la hache une salve de bruit dans un passe-bande. Le moteur reste
dormant tant que le joueur n'a pas touché l'écran (les navigateurs l'exigent)
et se coupe depuis les options. Les sons de travail sont tirés au sort parmi
les bâtiments visibles, un toutes les demi-secondes environ : un village
entier ne coûte pas plus cher qu'un seul atelier.

---

## 8. Commerce

Dix partenaires répartis sur quatre paliers, débloqués par la recherche :

| Palier | Type | Caractère |
|---|---|---|
| 1 | Hameaux | Bûcherons, carriers, laboureurs — matières premières, routes courtes |
| 2 | Bourgs | Tanneurs, place marchande, mineurs de montagne |
| 3 | Cités | Capitale et port : elles paient le luxe au prix fort |
| 4 | Lointain | Oasis du sud et comptoirs du nord : trajets énormes, marges énormes |

### La règle qui tient toute la table

**Aucun bien n'est à la fois vendu et acheté dans le réseau.** Les partenaires
vendent des matières premières et achètent des produits travaillés, point.

Sans cette règle, le réseau imprimait de l'argent. Kharel vendait la
joaillerie à 0,85 fois sa valeur et Cité-Haute la payait 1,65 ; avec la remise
de relation d'un côté et le bonus de prestige de l'autre, une caravane de
douze pièces transformait 629 pièces en 1 943 — **+209 %, reproductible à
l'infini, sans produire quoi que ce soit**. Cinq autres biens avaient la même
boucle. L'impôt, les ateliers et tout l'arbre de recherche devenaient sans
objet dès l'ouverture de l'ère 3. Un test parcourt les quatre saisons, au
meilleur prix que le jeu puisse offrir, et refuse le moindre aller-retour
rentable.

Le profit vient donc de la **transformation**, ce à quoi servent les chaînes
de production : on achète le minerai, on vend les outils.

### Ce qui fait bouger un prix

1. le multiplicateur propre à l'offre ;
2. la marge du caravanier — +15 % à l'achat, −8 % à la vente — qui fait qu'un
   achat d'urgence se sent passer ;
3. la relation avec le partenaire, qui monte à chaque échange ;
4. le rang du village ;
5. la saison, globalement sur la nourriture **et par partenaire** : Hauteroche
   est enneigée et paie 35 % de plus l'hiver, Chaume-les-Prés brade son grain
   après la moisson et le rachète cher au printemps, Kharel paie mieux en
   plein été. C'est ce qui rend deux acheteurs du même bien différents.

Les caravanes mettent du temps à faire l'aller-retour, ce qui rend l'achat
d'urgence coûteux en temps autant qu'en or.

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
