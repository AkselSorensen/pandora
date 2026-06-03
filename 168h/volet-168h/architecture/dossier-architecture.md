# Dossier architecture - Pandora 168H

## Objectif du document

Ce document décrit l'architecture de **Pandora**, le projet du module 168H. Il se concentre sur le fonctionnement général, les microservices, les flux de données et les responsabilités de chaque bloc.

Le volet GPE n'est pas traité ici.

## Vue d'ensemble

Pandora est une plateforme web de veille OSINT. Elle centralise plusieurs catégories de signaux publics dans une interface unique : carte interactive, panneaux de veille, flux d'actualité, alertes cyber, données géographiques, aviation, maritime, infrastructures et risques pays.

L'architecture est pensée comme un ensemble de services spécialisés. Chaque service récupère ou prépare une catégorie d'information, puis l'interface Pandora les affiche sous une forme exploitable.

## Schéma global Mermaid

```mermaid
flowchart TB
    User[Utilisateur / Jury / Équipe projet]

    subgraph Frontend[Interface Pandora]
        UI[Tableau de bord web]
        Map[Carte interactive]
        Panels[Panneaux de veille]
        Demo[Scénario de démonstration]
    end

    subgraph Gateway[Couche API / Orchestration]
        API[API Pandora]
        Normalizer[Normalisation des données]
        Cache[Cache / Données temporaires]
    end

    subgraph Services[Microservices métier]
        Aviation[Service aviation]
        Maritime[Service maritime]
        News[Service actualités]
        Cyber[Service cyber]
        GeoRisk[Service risques pays]
        Infra[Service infrastructures]
        OSINT[Service OSINT]
        AI[Service assistant IA]
    end

    subgraph External[Sources ouvertes externes]
        OpenSources[APIs publiques / flux ouverts]
        StaticData[Données statiques]
        Feeds[Flux RSS / actualités]
        ThreatData[Données cyber publiques]
    end

    User --> UI
    UI --> Map
    UI --> Panels
    UI --> Demo

    UI --> API
    API --> Normalizer
    Normalizer --> Cache

    API --> Aviation
    API --> Maritime
    API --> News
    API --> Cyber
    API --> GeoRisk
    API --> Infra
    API --> OSINT
    API --> AI

    Aviation --> OpenSources
    Maritime --> OpenSources
    News --> Feeds
    Cyber --> ThreatData
    GeoRisk --> StaticData
    Infra --> StaticData
    OSINT --> OpenSources
    AI --> Cache

    Cache --> API
    API --> UI
```

## Découpage en microservices

```mermaid
flowchart LR
    subgraph Pandora[Pandora]
        Front[Frontend]
        Gateway[API Gateway]

        S1[Aviation Service]
        S2[Maritime Service]
        S3[News Service]
        S4[Cyber Threat Service]
        S5[Country Risk Service]
        S6[Critical Infrastructure Service]
        S7[OSINT Scraper Service]
        S8[AI Briefing Service]
    end

    Front --> Gateway
    Gateway --> S1
    Gateway --> S2
    Gateway --> S3
    Gateway --> S4
    Gateway --> S5
    Gateway --> S6
    Gateway --> S7
    Gateway --> S8
```

## Rôle des services

| Service | Rôle | Exemple de valeur pour la démo |
| :--- | :--- | :--- |
| Interface Pandora | Afficher la carte, les couches et les panneaux | Donner une vision globale rapidement |
| API Pandora | Centraliser les demandes de l'interface | Éviter que le frontend appelle directement toutes les sources |
| Service aviation | Fournir des informations liées aux vols ou bases aériennes | Observer l'activité ou le contexte aérien |
| Service maritime | Fournir des ports, routes ou points maritimes sensibles | Visualiser des zones stratégiques |
| Service actualités | Agréger des flux d'information publics | Relier la carte à l'actualité |
| Service cyber | Présenter des signaux de menace ou vulnérabilités publiques | Ajouter une dimension cybersécurité |
| Service risques pays | Donner un contexte de risque par zone | Aider à prioriser l'analyse |
| Service infrastructures | Afficher des points d'intérêt critiques | Identifier les zones sensibles |
| Service OSINT | Rassembler des signaux ouverts complémentaires | Enrichir la veille |
| Service IA | Générer une synthèse ou un briefing d'aide | Faciliter l'explication orale |

## Flux de données

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant F as Interface Pandora
    participant A as API Pandora
    participant S as Service métier
    participant X as Source ouverte
    participant C as Cache / Normalisation

    U->>F: Active une couche de veille
    F->>A: Demande les données nécessaires
    A->>S: Appelle le service correspondant
    S->>X: Récupère ou consulte une source publique
    X-->>S: Retourne les données disponibles
    S->>C: Nettoie / prépare les données
    C-->>A: Retourne un format exploitable
    A-->>F: Envoie les données à afficher
    F-->>U: Affiche carte, marqueurs ou panneaux
```

## Architecture de déploiement cible

```mermaid
flowchart TB
    subgraph Client[Poste utilisateur]
        Browser[Navigateur web]
    end

    subgraph App[Application Pandora]
        Next[Application web]
        Routes[Routes API]
        Static[Assets et données statiques]
    end

    subgraph AIService[Service IA optionnel]
        Model[Modèle local / service de briefing]
    end

    subgraph Internet[Internet / Sources publiques]
        APIs[APIs ouvertes]
        RSS[Flux RSS]
        PublicData[Données publiques]
    end

    Browser --> Next
    Next --> Routes
    Routes --> Static
    Routes --> APIs
    Routes --> RSS
    Routes --> PublicData
    Routes --> Model
```

## Parcours utilisateur

```mermaid
journey
    title Parcours de démonstration Pandora
    section Découverte
      Ouvrir le tableau de bord: 5: Utilisateur
      Comprendre les couches disponibles: 4: Utilisateur
    section Veille
      Activer une catégorie de signaux: 4: Utilisateur
      Observer la carte et les panneaux: 5: Utilisateur
      Comparer plusieurs informations: 4: Utilisateur
    section Synthèse
      Construire une lecture prudente: 4: Utilisateur
      Présenter les limites: 5: Utilisateur
```

## Contraintes d'architecture

- Les sources ouvertes peuvent être incomplètes ou indisponibles.
- La plateforme doit rester démontrable même si une source externe ne répond pas.
- Les données doivent être présentées comme des signaux, pas comme une vérité absolue.
- Le prototype doit rester compréhensible pour la soutenance.
- Le système doit séparer clairement l'affichage, la récupération des données et la préparation des données.

## Choix structurants

- **Architecture orientée services** : chaque domaine de veille est isolé dans un service logique.
- **API centrale** : l'interface passe par une couche API plutôt que d'interroger directement toutes les sources.
- **Normalisation des données** : les informations sont préparées pour être affichées de manière cohérente.
- **Carte interactive** : la carte sert de point d'entrée visuel principal.
- **Preuves de secours** : captures et scénario prévu en cas d'indisponibilité externe.

## Limites assumées

- Pandora reste un prototype 168H.
- Les informations affichées doivent être vérifiées avant toute interprétation sérieuse.
- Certaines sources peuvent être simulées, statiques ou indisponibles selon le contexte de démonstration.
- L'outil ne remplace pas une analyse humaine.

## Résultat attendu pour la soutenance

À la fin du sprint, l'équipe doit pouvoir expliquer :

1. le problème traité par Pandora ;
2. le fonctionnement général de l'architecture ;
3. le rôle des principaux microservices ;
4. le flux d'une donnée depuis une source ouverte jusqu'à l'affichage ;
5. les limites du prototype ;
6. les preuves produites pendant les 168h.
