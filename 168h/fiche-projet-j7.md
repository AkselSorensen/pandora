# Fiche projet 168H - J-7

## Identification

- Nom du module 168H : **Pandora**
- Type de projet : plateforme de veille OSINT et de visualisation de signaux publics
- Configuration choisie : volet 168H uniquement pour le moment
- Volet GPE : non traité dans cette fiche
- Équipe : À compléter
- Référent ou contact : À compléter
- Version de la fiche : v1
- Date de remise : À compléter

## Dossiers prévus

- Dossier racine prévu : `168h/`
- Dossier du sprint technique : `volet-168h/`
- Dossier architecture : `volet-168h/architecture/`
- Dossier preuves : `volet-168h/preuves/`
- Dossier prototype : `volet-168h/prototype/`
- Dossier soutenance : `volet-168h/soutenance/`

Le dossier `volet-gpe/` existe dans l'arborescence, mais il n'est pas traité pour le moment. Cette fiche concerne uniquement **Pandora** dans le cadre du module 168H.

## Elevator pitch

> Pandora est une plateforme de veille OSINT qui centralise des signaux publics liés à la géopolitique, la cybersécurité, les risques pays, les flux d'actualité, les transports et les zones sensibles. Le problème adressé est la dispersion de l'information : lorsqu'une équipe veut comprendre rapidement une situation mondiale, elle doit consulter de nombreuses sources séparées. Pandora propose une interface unique permettant d'observer, croiser et expliquer ces signaux plus rapidement. En 168h, l'objectif est de livrer un prototype démontrable, documenté et défendable en soutenance.

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
- Préparer une démonstration guidée.
- Produire les preuves attendues : captures, journal de sprint, historique Git, documentation.
- Assumer les limites des sources ouvertes et du prototype.

### Hors périmètre

- Traiter le volet GPE.
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
3. un scénario de veille ;
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

## Retours de prévalidation

À remplir après retour coach/intervenant :

- Décision : prévalidé / à corriger / refusé
- Points à corriger : À compléter
- Points à réduire : À compléter
- Points à clarifier : À compléter
- Date cible de nouvelle version : À compléter
