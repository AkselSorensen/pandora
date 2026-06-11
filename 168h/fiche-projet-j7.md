# Fiche projet 168H - J-7

## Identification

- Nom du module 168H : **Pandora**
- Type de projet : plateforme de veille OSINT et de visualisation de signaux publics
- Configuration choisie : volet 168H avec lien fonctionnel vers le GPE
- Volet GPE associé : **Meditracks**, projet de traçabilité blockchain du cycle de vie d'un médicament
- Équipe : boukro_t
- Référent ou contact : boukro_t
- Version de la fiche : v1
- Date de remise : 07/06/2026

## Dossiers prévus

- Dossier racine prévu : `168h/`
- Dossier du sprint technique : `volet-168h/`
- Dossier architecture : `volet-168h/architecture/`
- Dossier preuves : `volet-168h/preuves/`
- Dossier prototype : `volet-168h/prototype/`
- Dossier soutenance : `volet-168h/soutenance/`

Le dossier `volet-gpe/` existe dans l'arborescence afin de documenter le lien entre **Pandora** et le GPE **Meditracks**. Cette fiche concerne principalement **Pandora** dans le cadre du module 168H, tout en explicitant son rôle complémentaire pour Meditracks.

## Elevator pitch

> Pandora est une plateforme de veille OSINT qui centralise des signaux publics liés à la géopolitique, la cybersécurité, les risques pays, les flux d'actualité, les transports et les zones sensibles. Le problème adressé est la dispersion de l'information : lorsqu'une équipe veut comprendre rapidement une situation mondiale, elle doit consulter de nombreuses sources séparées. Pandora propose une interface unique permettant d'observer, croiser et expliquer ces signaux plus rapidement. En 168h, l'objectif est de livrer un prototype démontrable, documenté et défendable en soutenance.

## Lien avec le GPE Meditracks

Le GPE associé au projet est **Meditracks**, une solution visant à retracer le cycle de vie d'un médicament grâce à la blockchain. Meditracks permet de suivre les étapes importantes du parcours d'un médicament : fabrication, contrôle qualité, transport, stockage, distribution et remise au patient ou à la pharmacie.

Pandora peut être utilisé en complément de Meditracks comme une couche de veille OSINT et d'analyse des risques autour de cette chaîne pharmaceutique. La blockchain apporte la preuve du parcours du médicament, tandis que Pandora apporte le contexte externe pouvant influencer ou fragiliser ce parcours.

Concrètement, Pandora peut aider Meditracks à surveiller :

- les risques pays liés aux zones de fabrication ou de transit ;
- les perturbations logistiques pouvant impacter le transport des lots ;
- les alertes sanitaires ou rappels de médicaments ;
- les cybermenaces visant les laboratoires, transporteurs ou systèmes de santé ;
- les signaux publics liés à la contrefaçon pharmaceutique ;
- les événements géopolitiques pouvant affecter la chaîne d'approvisionnement.

L'association de Meditracks et Pandora permet donc de construire une vision plus complète : Meditracks permet de savoir où est passé un médicament et de garantir l'intégrité de son historique, tandis que Pandora permet de comprendre si son parcours présente un risque externe.

Formule synthétique :

> Meditracks = preuve blockchain et traçabilité du médicament.  
> Pandora = veille OSINT et analyse des risques autour de son parcours.

## Problème adressé

Les informations utiles à la veille sont souvent éparpillées entre plusieurs sites, flux, cartes, bases publiques et tableaux de bord. Cette dispersion rend difficile la compréhension rapide d'une situation.

Le vrai problème est de permettre à un utilisateur de :

- regrouper des signaux publics dans un même espace ;
- repérer rapidement les informations importantes ;
- éviter de passer d'un outil à l'autre ;
- construire une première lecture d'une situation ;
- présenter cette lecture de façon claire et prudente.

## Public cible

- Étudiants travaillant sur la veille, la cybersécurité ou la géopolitique.
- Équipes projet ayant besoin d'un démonstrateur de situation awareness.
- Formateurs ou intervenants souhaitant illustrer un cas de veille OSINT.
- Utilisateurs techniques ou semi-techniques voulant visualiser des signaux publics.

## Valeur attendue

- Gagner du temps dans la consultation de sources ouvertes.
- Donner une vision plus lisible d'une situation complexe.
- Faciliter la démonstration d'un scénario de veille.
- Centraliser plusieurs catégories de signaux dans une interface unique.
- Montrer une capacité à cadrer, construire, documenter et défendre un prototype en 168h.

## Objectif du sprint 168H

L'objectif du sprint est de produire un prototype cohérent de Pandora, avec :

- une interface de consultation claire ;
- des couches de veille activables ;
- une architecture documentée ;
- un scénario de démonstration ;
- un runbook de lancement ;
- un dossier de preuves ;
- un support de soutenance.

## Périmètre

### Dans le périmètre

- Finaliser un prototype démontrable de Pandora.
- Documenter l'architecture générale du projet.
- Présenter l'organisation en services et flux de données.
- Expliquer le lien fonctionnel avec Meditracks comme cas d'usage complémentaire.
- Préparer une démonstration guidée.
- Produire les preuves attendues : captures, journal de sprint, historique Git, documentation.
- Assumer les limites des sources ouvertes et du prototype.

### Hors périmètre

- Développer techniquement Meditracks ou sa blockchain dans Pandora.
- Produire un outil de renseignement professionnel complet.
- Garantir l'exhaustivité ou l'exactitude parfaite des informations.
- Remplacer une analyse humaine.
- Utiliser des données privées ou sensibles.
- Promettre une disponibilité temps réel parfaite de toutes les sources externes.

## Approche technique pressentie

Pandora repose sur une application web qui affiche une carte interactive et plusieurs panneaux de veille. L'application agrège des données publiques provenant de différentes sources, les normalise côté serveur puis les expose à l'interface utilisateur.

L'approche retenue est orientée services : chaque domaine de veille peut être vu comme un service séparé, par exemple aviation, maritime, actualités, cyber, risques pays, infrastructures ou alertes. Cette séparation facilite la compréhension, la maintenance et la démonstration du projet.

L'architecture détaillée est décrite dans :

`168h/volet-168h/architecture/dossier-architecture.md`

## Démonstrateur attendu

Le démonstrateur doit permettre de montrer :

1. une carte ou interface principale ;
2. plusieurs catégories de signaux publics ;
3. un scénario de veille pouvant être relié à Meditracks, par exemple le suivi des risques autour du parcours d'un lot de médicaments ;
4. une lecture synthétique de la situation ;
5. les limites du prototype.

## Organisation Git

- Dépôt prévu : https://rendu-git.etna-alternance.net/module-10344/activity-55519/group-1076713
- Stratégie de branches : branche principale stable, branches de travail si nécessaire.
- Convention de messages : messages courts et explicites, par exemple `docs: ajoute architecture mermaid`, `demo: prépare scénario pandora`, `fix: stabilise affichage carte`.
- Rythme minimal : commits réguliers pendant le sprint.
- Objectif : rendre l'historique exploitable pour prouver la progression.

## Équipe et responsabilités

| Membre | Rôle pressenti | Responsabilités | Risque ou dépendance |
| :--- | :--- | :--- | :--- |
| À compléter | Coordination | Suivi du périmètre et priorisation | Disponibilité |
| À compléter | Prototype | Stabilisation du démonstrateur | Complexité ou bugs |
| À compléter | Architecture | Schémas, documentation et explication des services | Documentation incomplète |
| À compléter | Soutenance | Scénario, support oral et preuves | Démo trop longue ou peu claire |

## Risques principaux

| Risque | Impact | Probabilité | Réponse prévue |
| :--- | :--- | :--- | :--- |
| Trop de fonctionnalités | Prototype dispersé | Moyenne | Prioriser les éléments démontrables |
| Sources externes instables | Démo fragilisée | Moyenne | Prévoir captures et données de secours |
| Architecture mal expliquée | Soutenance moins convaincante | Moyenne | Utiliser des schémas Mermaid clairs |
| Manque de preuves | Validation difficile | Faible à moyenne | Tenir un journal et faire des captures |
| Démo trop technique | Message moins clair | Moyenne | Relier chaque élément technique au problème utilisateur |

## Preuves prévues

- Fiche projet J-7.
- Dossier architecture avec schémas Mermaid.
- Prototype démontrable.
- Runbook de lancement.
- Scénario de démonstration.
- Captures d'écran.
- Journal de sprint.
- Historique Git exploitable.
- Support de soutenance.
- Retour d'expérience.

## Critères de réussite

- Le projet Pandora est compréhensible en moins d'une minute.
- Le problème adressé est clair.
- L'architecture est lisible grâce aux schémas Mermaid.
- Le prototype peut être démontré.
- Les preuves sont présentes.
- Les limites sont assumées.


