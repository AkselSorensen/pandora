# Journal de sprint - Pandora 168H

Ce journal décrit le sprint imaginé sur 7 jours pour faire évoluer **Pandora** vers une plateforme OSINT plus ambitieuse : plus de données, plus d'automatisation par IA, une meilleure synthèse des informations et une connexion à de vraies sources satellitaires publiques comme Sentinel, NASA, NOAA ou Copernicus.

> Important : l'objectif n'est pas de piloter un satellite ni d'accéder à des données privées. Le but est d'exploiter légalement des données ouvertes ou accessibles via API publiques afin d'enrichir la veille.

## H0 - Lancement

- Objectif du jour : définir la vision du sprint 168H pour transformer Pandora en tableau de bord OSINT augmenté par IA.
- Tâches prioritaires :
  - cadrer les nouvelles fonctionnalités à ajouter en 7 jours ;
  - identifier les sources d'information prioritaires ;
  - définir les cas d'usage de l'IA ;
  - choisir les données satellitaires publiques exploitables ;
  - préparer les preuves attendues pour la soutenance.
- Risques identifiés :
  - vouloir connecter trop de sources en même temps ;
  - dépendre d'APIs externes instables ;
  - confondre données satellitaires publiques et accès direct à un satellite ;
  - produire trop d'informations sans synthèse claire ;
  - rendre l'interface illisible.
- Décisions :
  - prioriser la qualité de l'analyse plutôt que le volume brut ;
  - intégrer l'IA comme assistant de synthèse, pas comme décideur ;
  - utiliser uniquement des sources ouvertes ou documentées ;
  - prévoir un mode démo avec captures et données de secours ;
  - organiser le sprint autour d'un ajout progressif de couches d'information.
- Preuves produites :
  - fiche projet Pandora ;
  - architecture Mermaid ;
  - journal de sprint orienté roadmap 7 jours ;
  - liste des futures sources à intégrer.

## Jour 1 - Socle IA et stratégie de données

- Avancées :
  - définition du rôle de l'IA dans Pandora ;
  - préparation d'un assistant IA capable de résumer les signaux visibles ;
  - identification des types d'informations à collecter : actualités, cyber, maritime, aérien, pays à risque, infrastructures, météo, satellites ;
  - définition d'un score de priorité pour éviter de noyer l'utilisateur sous trop de données.
- Blocages :
  - l'IA peut halluciner si elle n'est pas limitée aux données affichées ;
  - certaines sources donnent beaucoup d'informations mais peu de contexte ;
  - il faut éviter de présenter une synthèse automatique comme une vérité.
- Décisions :
  - l'IA devra citer les catégories de signaux utilisées ;
  - les résumés devront rester prudents ;
  - chaque information importante devra être reliée à une source ou à une couche visible ;
  - priorité donnée à un assistant de briefing plutôt qu'à un chatbot généraliste.
- Preuves :
  - définition du module IA ;
  - liste des données prioritaires ;
  - première structure de briefing automatique.
- Prochaines priorités :
  - connecter plus de flux d'information ;
  - enrichir le tableau de bord avec des indicateurs de volume ;
  - préparer une première synthèse IA.

## Jour 2 - Augmentation du nombre d'informations disponibles

- Avancées :
  - ajout prévu de nouvelles catégories de données publiques ;
  - amélioration de la logique de classement des signaux ;
  - préparation d'un compteur d'informations par couche ;
  - distinction entre information brute, information priorisée et information synthétisée.
- Données ciblées :
  - flux d'actualité internationaux ;
  - alertes cyber publiques ;
  - vulnérabilités critiques ;
  - zones de conflit ou tension ;
  - ports et routes maritimes stratégiques ;
  - vols et bases aériennes ;
  - infrastructures critiques ;
  - événements naturels : séismes, incendies, météo sévère ;
  - données satellites publiques.
- Blocages :
  - trop de données peut ralentir ou rendre l'interface confuse ;
  - certains flux ont des formats différents ;
  - les informations doivent être nettoyées avant affichage.
- Décisions :
  - afficher des compteurs par couche ;
  - ajouter des filtres par gravité, zone et date ;
  - créer une couche "signaux prioritaires" ;
  - garder un mode simple pour la soutenance.
- Preuves :
  - liste des couches enrichies ;
  - schéma de flux de données ;
  - documentation du tri des informations.
- Prochaines priorités :
  - connecter les premières sources satellitaires publiques ;
  - préparer la visualisation des données spatiales.

## Jour 3 - Connexion à de vraies sources satellitaires publiques

- Avancées :
  - étude de sources satellitaires exploitables légalement ;
  - préparation d'une couche satellite dans Pandora ;
  - définition des usages : météo, feux, nuages, activité maritime, imagerie de zone, catastrophes naturelles ;
  - choix d'une approche API/open data plutôt qu'un accès direct à un satellite.
- Sources envisagées :
  - NASA FIRMS pour les incendies et points chauds ;
  - NASA EONET pour événements naturels ;
  - NOAA pour météo et phénomènes atmosphériques ;
  - Copernicus / Sentinel Hub pour imagerie satellite lorsque disponible ;
  - CelesTrak pour le suivi d'objets orbitaux et satellites ;
  - USGS ou services équivalents pour certaines données géospatiales.
- Blocages :
  - certaines APIs demandent une clé ;
  - l'imagerie satellite peut être lourde ;
  - les images ne sont pas toujours disponibles en temps réel ;
  - il faut expliquer clairement la différence entre image satellite et interprétation.
- Décisions :
  - afficher la donnée satellite comme une couche d'observation ;
  - ne pas promettre une surveillance temps réel parfaite ;
  - prévoir une zone de démonstration avec données fiables ;
  - garder une capture de secours si l'API ne répond pas.
- Preuves :
  - liste des sources satellites ;
  - justification de l'utilisation de données ouvertes ;
  - début de documentation de la couche satellite.
- Prochaines priorités :
  - relier les données satellites à l'IA ;
  - créer un briefing automatique sur une zone.

## Jour 4 - IA de synthèse et briefing automatique

- Avancées :
  - conception d'un module de briefing IA ;
  - l'IA doit produire une synthèse courte à partir des signaux visibles ;
  - préparation d'un format de sortie : résumé, signaux forts, incertitudes, sources, limites ;
  - ajout d'une logique de comparaison entre plusieurs couches.
- Fonctionnalités IA imaginées :
  - résumé automatique d'une zone ;
  - détection de signaux inhabituels ;
  - explication simple des événements visibles ;
  - génération d'un rapport court pour soutenance ;
  - suggestion des couches à activer selon le contexte ;
  - traduction ou reformulation en langage clair.
- Blocages :
  - risque d'hallucination ;
  - besoin de garder une trace des données utilisées par l'IA ;
  - difficulté à mesurer la fiabilité d'une synthèse automatique.
- Décisions :
  - l'IA ne conclut pas seule ;
  - chaque briefing doit inclure une section "limites" ;
  - le texte généré doit rester prudent ;
  - le briefing doit être reproductible pour la démo.
- Preuves :
  - modèle de briefing IA ;
  - exemple de synthèse ;
  - règles d'utilisation responsable de l'IA.
- Prochaines priorités :
  - enrichir l'interface avec un panneau de briefing ;
  - préparer un scénario complet combinant satellites, cyber, news et carte.

## Jour 5 - Fusion multi-sources et score de priorité

- Avancées :
  - définition d'une logique de fusion des signaux ;
  - regroupement des informations par zone, thème et gravité ;
  - préparation d'un score de priorité pour aider l'utilisateur à savoir quoi regarder en premier ;
  - amélioration du scénario de démonstration avec plusieurs sources croisées.
- Exemple de fusion :
  - une actualité signale une tension dans une zone ;
  - une couche maritime montre un point stratégique proche ;
  - une donnée satellite indique un événement naturel ou une observation récente ;
  - une alerte cyber ajoute un contexte numérique ;
  - l'IA produit une synthèse prudente.
- Blocages :
  - le score peut donner une impression de certitude excessive ;
  - les sources n'ont pas toutes la même fraîcheur ;
  - certaines informations peuvent être contradictoires.
- Décisions :
  - afficher un score comme aide visuelle, pas comme vérité ;
  - montrer la fraîcheur des données ;
  - distinguer les signaux confirmés, faibles ou à vérifier ;
  - conserver un mode de démonstration simple.
- Preuves :
  - description du score de priorité ;
  - scénario multi-sources ;
  - captures prévues des couches enrichies.
- Prochaines priorités :
  - stabiliser la démonstration ;
  - préparer les documents de soutenance.

## Jour 6 - Stabilisation, preuves et mode démonstration

- Avancées :
  - consolidation du parcours de démonstration ;
  - préparation d'un mode démo avec données stables ;
  - vérification des couches principales : carte, cyber, actualités, satellites, maritime, aviation, risques pays ;
  - préparation des captures de secours ;
  - finalisation des explications sur l'IA.
- Blocages :
  - les APIs externes peuvent ralentir ;
  - certaines couches peuvent afficher trop d'éléments ;
  - la soutenance doit rester courte.
- Décisions :
  - montrer un scénario guidé plutôt qu'une exploration libre ;
  - limiter le nombre de couches affichées simultanément ;
  - présenter les données satellites comme preuve d'enrichissement ;
  - expliquer l'IA comme assistant de lecture.
- Preuves :
  - captures de la carte ;
  - captures du briefing IA ;
  - captures de la couche satellite ;
  - runbook de démonstration ;
  - dossier architecture mis à jour.
- Prochaines priorités :
  - préparer la soutenance finale ;
  - vérifier le discours ;
  - finaliser le bilan du sprint.

## Jour 7 - Finalisation et soutenance

- Avancées :
  - finalisation de la roadmap 168H ;
  - finalisation du journal de sprint ;
  - préparation du pitch final ;
  - préparation de la démonstration complète ;
  - vérification des preuves.
- Blocages restants :
  - certaines sources externes restent dépendantes du réseau ;
  - les données satellites ne sont pas toujours temps réel ;
  - l'IA doit être présentée comme une aide et non comme un outil de décision.
- Décisions finales :
  - présenter Pandora comme une plateforme OSINT augmentée par IA ;
  - mettre en avant l'augmentation du nombre d'informations disponibles ;
  - montrer la couche satellite avec des données ouvertes ;
  - démontrer la synthèse IA sur une zone ou un scénario ;
  - assumer les limites techniques et éthiques.
- Preuves finales :
  - fiche projet ;
  - architecture Mermaid ;
  - journal de sprint ;
  - scénario de démonstration ;
  - runbook ;
  - captures des couches ;
  - exemple de briefing IA ;
  - liste des sources envisagées.
- Préparation soutenance :
  - commencer par le problème : trop d'informations dispersées ;
  - montrer comment Pandora centralise les signaux ;
  - expliquer l'ajout IA ;
  - expliquer la connexion aux données satellites publiques ;
  - montrer un scénario multi-sources ;
  - conclure sur la valeur et les limites.

## Bilan rapide

- Ce qui fonctionne :
  - Pandora a une vision claire : centraliser, visualiser et synthétiser des signaux OSINT ;
  - l'IA apporte une valeur de synthèse et de briefing ;
  - les futures couches augmentent fortement le nombre d'informations disponibles ;
  - les données satellites publiques enrichissent la lecture géographique ;
  - l'architecture microservices permet d'ajouter progressivement des sources.
- Ce qui ne fonctionne pas encore :
  - toutes les sources ne peuvent pas être garanties en temps réel ;
  - l'imagerie satellite dépend des APIs, des clés et de la disponibilité ;
  - l'IA peut produire des erreurs si elle n'est pas encadrée ;
  - l'interface doit éviter la surcharge d'informations.
- Ce qui a été retiré du périmètre :
  - accès direct ou contrôle d'un vrai satellite ;
  - données privées ou non autorisées ;
  - décision automatique par IA ;
  - surveillance exhaustive du monde entier ;
  - promesse d'un outil opérationnel professionnel finalisé.
- Ce qui sera montré en soutenance :
  - le problème de dispersion de l'information ;
  - Pandora comme tableau de bord OSINT ;
  - une roadmap 7 jours d'enrichissement ;
  - l'architecture microservices ;
  - l'intégration prévue de données satellites publiques ;
  - un briefing IA ;
  - un scénario multi-sources ;
  - les limites et les prochaines étapes.
