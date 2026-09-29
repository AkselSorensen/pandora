# Pandora — vision produit et feuille de route

Document de cadrage initial, établi à partir du dépôt et des deux références visuelles fournies. Il distingue les capacités déjà présentes dans le code des évolutions proposées. La présence d'une page ou d'une route ne prouve pas à elle seule qu'un parcours est fiable de bout en bout ; ce document n'est pas un audit d'exécution.

## Direction produit

Faire de Pandora un poste de veille géospatiale où l'on peut **détecter un signal, le contextualiser par plusieurs sources, l'examiner, puis conserver et partager une analyse traçable**. L'interface doit garder la carte au centre tout en rendant l'activité, la fraîcheur et la provenance des données immédiatement lisibles.

Les références évoquent un cockpit sombre, une carte mondiale, un flux d'événements, quelques indicateurs utiles et un panneau de détail. On peut reprendre cette organisation et la sobriété opérationnelle sans reprendre littéralement l'imagerie de coffre lumineux.

## État déjà repéré dans le dépôt

Le produit a déjà une base large : carte MapLibre, nombreuses couches et routes de données, panneau d'alertes, outils de recherche et d'OSINT, synthèse IA, dossiers, graphe de connaissances, gouvernance, presets de carte, partage d'état et plusieurs pages spécialisées. Les fonctions sont visibles dans `src/app/page.tsx`, `src/components/`, `src/app/api/` et décrites en partie dans le README.

La direction artistique existe déjà dans `src/app/globals.css` : fonds très sombres, accents or et bleu, panneaux translucides, grille discrète, typographie technique, badges et rail d'outils. Cependant, le fichier contient plusieurs définitions successives des mêmes variables et styles, dont une refonte bleu ardoise et un correctif de lisibilité tardif. Le résultat est une DA identifiable mais empilée, avec des règles qui se remplacent. La hiérarchie dense du rail de 22 outils est aussi éloignée du tableau plus simple montré en référence.

## Fonctionnalités à intégrer, par priorité

### Ce que Pandora peut reprendre de ces références

La cible n'est pas de copier leurs produits ou leurs interfaces au pixel près. Il s'agit d'adapter à Pandora leurs principes utiles : Palantir pour relier données, entités et actions gouvernées ; ChapsVision / Argonos pour la fusion de sources hétérogènes, la recherche et la collaboration traçable ; HexaForce pour la situation multi-domaines, la coordination et la résilience. HexaForce est un système C2 de défense ; Pandora doit en reprendre les qualités d'interface et de résilience dans son cadre de veille OSINT défensive, sans fonctions de ciblage ni de conduite d'engagement.

| Inspiration | Fonctionnalités adaptées à Pandora | Socle déjà présent |
|---|---|---|
| **Palantir** | Modèle commun entités–événements–sources ; fiche d'objet avec historique et relations ; actions analyste gouvernées (annoter, confirmer, ajouter au dossier, exporter) ; permissions cohérentes sur données et actions. | Graphe de connaissances, dossiers, preuves hashées, gouvernance/ABAC et journal d'audit existent ; l'authentification reste explicitement limitée dans la documentation. |
| **ChapsVision / Argonos** | Recherche transversale dans les actualités, événements, entités et documents ; dédoublonnage et qualification des signaux ; enrichissement multilingue sourcé ; synthèses IA reliées aux sources ; dossiers partagés et rapports traçables. | Hub OSINT, copilote/briefing, flux et graphe existent ; la recherche et la collaboration unifiées restent à compléter. |
| **HexaForce** | Vue de situation multi-domaines cohérente ; espaces de mission partagés ; synchronisation et cache des dernières données si le réseau se dégrade ; indicateurs explicites de disponibilité et de fraîcheur. | Carte et couches multi-domaines existent ; santé unifiée des flux, travail hors ligne et vraie synchronisation d'équipe restent à construire. |

### Liste courte des nouvelles features à faire

1. **Centre de situation** — carte, alertes prioritaires, fil temps réel et santé des sources dans une vue configurable.
2. **Détail de signal traçable** — origine, fraîcheur, confiance, contexte, événements liés et historique sur une fiche unique.
3. **Recherche et corrélation unifiées** — retrouver et dédoublonner des signaux multi-sources, puis expliquer les liens proposés.
4. **Zones d'intérêt et alertes configurables** — enregistrer une zone, choisir les types de signaux et régler les conditions de notification.
5. **Dossiers collaboratifs** — annotations, preuves, attribution, historique et exports à partir des signaux sélectionnés.
6. **Briefings IA vérifiables** — synthèse multilingue et rapports dont chaque affirmation renvoie à ses sources.
7. **Timeline / replay** — revoir l'évolution des événements et de la carte dans une période choisie.
8. **Mode dégradé** — cache local daté, synchronisation au retour du réseau et état de fraîcheur visible.
9. **Identité et rôles réels** — authentification et permissions effectives pour un déploiement en équipe ; le profil actuel n'est pas une authentification.
10. **Interface adaptative** — ordre et densité des panneaux, espaces de travail sauvegardés et vues multi-écrans.

### P0 — Fiabilité et lisibilité des capacités existantes

1. **État de santé par source** — afficher disponible, dégradée ou indisponible, dernière mise à jour, âge des données et erreur compréhensible ; distinguer zéro résultat d'une source en panne.
2. **Provenance partout** — associer aux événements leur source, heure observée, heure d'ingestion, lien d'origine et niveau de confiance ; rendre visibles les heuristiques et les limites de couverture.
3. **Parcours analyste complet** — depuis un événement, ouvrir son détail, le croiser sur la carte, l'ajouter à un dossier, annoter et exporter sans perdre le contexte.
4. **Écrans cohérents et robustes** — uniformiser chargement, erreurs, états vides, filtres, actualisation et navigation clavier sur les pages et panneaux existants.
5. **État de configuration honnête** — identifier les intégrations optionnelles non configurées et afficher leurs limites dans l'interface et la documentation, sans présenter les données simulées ou heuristiques comme des faits vérifiés.

### P1 — Poste de veille inspiré des références

1. **Accueil opérationnel configurable** — carte principale, activité récente, alertes prioritaires, état des flux et quelques indicateurs avec lien direct vers les détails.
2. **Chronologie et relecture** — filtrer les événements dans le temps, comparer des fenêtres et rejouer une séquence sur la carte.
3. **Zones surveillées** — enregistrer des zones d'intérêt, combiner des couches et recevoir des alertes lorsqu'un signal pertinent apparaît.
4. **Corrélation explicable** — regrouper les signaux liés par lieu, période ou entité et exposer les raisons de chaque rapprochement, avec accès aux sources d'origine.
5. **Espaces de travail sauvegardés** — mémoriser couches, filtres, zone, disposition et panneau actif, avec partage contrôlé d'une vue.
6. **Briefings traçables** — composer un rapport à partir d'événements et de preuves sélectionnés, avec liens sources, horodatage, hypothèses et export lisible.

### P2 — Collaboration et exploitation durable

1. **Identité et rôles réels** — remplacer le profil local de démonstration par une authentification et des autorisations liées à une identité, si Pandora est déployé en équipe.
2. **Collaboration sur les dossiers** — attribution, commentaires, historique des changements et transmission entre analystes.
3. **Connecteurs de renseignement** — connecteurs configurables (par exemple STIX/TAXII ou MISP) seulement après définition du périmètre et des besoins d'exploitation.
4. **Mode dégradé / hors ligne** — cache explicite des dernières données disponibles et indication de leur ancienneté.
5. **Dispositions multi-écrans et accessibilité** — vues compactes ou étendues, contraste, tailles et commandes clavier adaptées aux longues sessions.

## Direction artistique à consolider

- Garder le fond charbon/bleu nuit, les accents or réservés aux éléments actifs et une couleur distincte pour les états d'alerte.
- Réduire l'effet « verre » là où il nuit au contraste ; les panneaux de données doivent rester opaques et lisibles sur la carte.
- Mettre en avant la carte, une liste d'activité concise et un panneau de détail contextuel ; déplacer les outils secondaires dans une navigation hiérarchisée et recherchable.
- Réserver les animations aux changements d'état ou aux nouveaux signaux, avec une option de réduction du mouvement.
- Normaliser dans un seul endroit les couleurs, espacements, rayons, typographies, tailles minimales et niveaux de densité. Supprimer ensuite les anciennes couches CSS devenues redondantes.
- Traiter le coffre incandescent de l'image comme une métaphore de marque ou une illustration ponctuelle, pas comme le fond permanent du poste d'analyse.

## Critères de réussite du produit

- Un opérateur distingue rapidement un signal actuel d'une donnée périmée ou d'une panne de source.
- Tout événement affiché peut être retracé jusqu'à sa source et à son heure d'observation.
- Une analyse peut être créée, enrichie, sauvegardée puis exportée sans ressaisie manuelle du contexte.
- Les parcours principaux restent compréhensibles sur écran étroit et accessibles au clavier.
- Les limites de configuration, de couverture et de confiance sont visibles au point d'usage.

## Ordre de réalisation proposé

Commencer par vérifier les parcours existants et les états de santé/provenance (P0), puis composer l'accueil de veille et les zones surveillées (P1). Ajouter collaboration, identité et connecteurs selon le mode de déploiement visé (P2). « 100 % fonctionnel » devra être défini par des parcours d'acceptation concrets et les intégrations effectivement activées ; le périmètre actuel dépend de sources externes et de services optionnels.
