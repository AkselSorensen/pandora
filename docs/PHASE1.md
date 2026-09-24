# Pandora — Phase 1 : fondations souveraines (gouvernance, cas, graphe)

Ce document décrit ce que la Phase 1 ajoute, comment le démontrer, et — surtout — **ce qu'elle ne
protège pas**. Un contrôle d'accès présenté au-delà de son périmètre réel est un mensonge de sécurité.

---

## 1. Ce que la Phase 1 ajoute

| Brique | Service / fichier | Rôle |
|---|---|---|
| Politique ABAC | `ai/pandora-governance-service/policy.py` | Décision d'accès pure : `(sujet, action, ressource) → allow/deny + obligations`. Refus par défaut (Zero Trust). |
| Journal inviolable | `ai/pandora-governance-service/audit.py` | Journal append-only chaîné par hash : `sha256(prev_hash \| entrée canonique)`. Toute modification ou suppression casse la chaîne à partir du seq touché. |
| Table de classification | `ai/pandora-governance-service/sources.py` + miroir `src/lib/classification.ts` | 50 routes API classées en NP / DR / C / S, avec compartiments et durée de rétention. |
| Application | `src/proxy.ts` + `src/lib/abac.ts` | Chaque requête classifiée obtient une décision journalisée avant d'atteindre la route. **Fail closed.** |
| Dossiers analystes | `ai/pandora-cases-service/` | Persistance SQLite des dossiers, preuves hashées (SHA-256 recalculable), chaîne de traçabilité, export JSON/Markdown, audit obligatoire de chaque écriture. |
| Graphe de connaissances | `ai/pandora-ontology-service/graph.py` | Fusion multi-domaines réelle (aviation, zones de risque, sites critiques, indicateurs cyber, acteurs stratégiques, signaux, alertes) avec relations typées et pivots d'entités. Le filtrage par clearance s'applique **aux données**, pas seulement à la route. |
| Souveraineté | `scripts/dependency-audit.mjs` + `/sovereignty` | Audit des dépendances externes **calculé en scannant le code**, host par host, avec juridiction. |

---

## 2. Modèle d'accès

### Niveaux

| Niveau | Libellé | Portée typique |
|---|---|---|
| `public` | NP — non protégé | flux ouverts : ADS-B, séismes, GDELT, météo, CCTV |
| `diffusion_restreinte` | DR | agrégats et analyses : zones de risque, infra, OSINT, cyber, graphe |
| `confidentiel` | C | renseignement consolidé, dossiers, gouvernance |
| `secret` | S | posture stratégique (module dissuasion). **Compartiment obligatoire.** |

### Règles effectives (`policy.py`)

1. `attestation_required` — pas d'attestation de session, pas de décision.
2. `deny_by_default` — une action n'est autorisée que par une règle explicite.
3. `clearance_gte_classification` — le niveau du sujet doit couvrir celui de la ressource.
4. `compartments_must_be_held` — l'intersection des compartiments doit être vide côté manquant.
5. `secret_requires_compartment` — un nœud/une ressource `secret` sans compartiment est refusé.
6. `no_write_on_secret` — jamais d'écriture sur du secret.
7. `auditor_read_only` — séparation des tâches : l'auditeur ne modifie rien.
8. `no_export_attribute` — un attribut `no_export` bloque export/partage/suppression.

### Profil opérateur — **NON AUTHENTIFIANT**

Le sélecteur de profil (clearance, rôle, compartiments) écrit des **cookies** et une attestation de
session dans `sessionStorage`. Il sert à **rendre la politique démontrable**, pas à identifier qui que
ce soit.

- Aucun mot de passe, aucun annuaire, aucune signature de jeton.
- Un utilisateur qui falsifie ses cookies obtient exactement les droits qu'il s'est donnés.
- La valeur réelle de la brique est **la traçabilité** : toutes les décisions sont journalisées, avec
  l'acteur déclaré, y compris les refus.

Pour un usage réel, la Phase 2 doit brancher une authentification (OIDC/mTLS) et faire dériver le
`sujet` du jeton vérifié, pas des cookies.

---

## 3. Journal d'audit — comment le vérifier

```bash
# État de la chaîne
curl -s localhost:7715/audit/verify
# {"valid":true,"entries":42,"brokenAtSeq":null,...}

# Dernières décisions (allow ET deny)
curl -s 'localhost:7715/audit?limit=10&decision=deny'

# Posture : taux de refus par raison, activité par acteur
curl -s localhost:7715/posture
```

**Test d'inviolabilité** (il est censé échouer après modification) :

```bash
docker compose exec pandora-governance python - <<'PY'
import sqlite3, os
c = sqlite3.connect(os.getenv("PANDORA_GOVERNANCE_DB", "/data/governance.db"))
c.execute("UPDATE audit SET decision='allow' WHERE seq=2"); c.commit()
PY
curl -s localhost:7715/audit/verify     # {"valid":false,"brokenAtSeq":2,...}
```

Restaure la valeur d'origine → la chaîne redevient valide : la détection est déterministe, elle
n'utilise aucune signature externe et reste vérifiable par un tiers à partir du fichier seul.

---

## 4. Cas et preuves

- Un dossier a un statut, un propriétaire, une hypothèse, une classification et des compartiments.
- Chaque **preuve** stocke une **référence publique** (URL de source, identifiant d'entité) et le
  **SHA-256 de sa charge utile canonique**. `GET /cases/{id}/verify` recalcule tous les hashs :
  la preuve est vérifiable sans faire confiance à la base.
- La **chaîne de traçabilité** est l'union horodatée des événements (création, modification,
  collecte, export) avec l'acteur déclaré.
- Aucune donnée personnelle n'est stockée : uniquement des identifiants et des URL publiques.

**Fail closed côté cas** : si la gouvernance est injoignable, une écriture est refusée avec `503`
`governance_unavailable`. On ne modifie pas un dossier classifié sans entrée de journal.

```bash
docker compose stop pandora-governance
curl -s -X POST localhost:3001/api/cases -H 'content-type: application/json' -d '{"title":"t"}'
# 503 {"detail":{"error":"governance_unavailable","reason":"no journal, no write"}}
docker compose start pandora-governance
```

---

## 5. Graphe de connaissances

- **Sources réelles** : `pandora-aerospace` (ADS-B), `pandora-territorial` (zones de risque),
  `pandora-dgsi` (sites critiques), `pandora-cyberdef` (indicateurs), `pandora-nuclear` (posture),
  `pandora-digest` + `pandora-alerts` (couche de corrélation).
- **Résilience** : `asyncio.gather(return_exceptions=True)`, timeout par source, réponse partielle et
  champ `degraded` explicite. Une source muette disparaît du graphe — elle n'est jamais remplacée.
- **Relations calculées** : `OBSERVED_NEAR` et `OPERATES_IN` reposent sur une distance haversine
  réelle ; `ESCALATES_WITH` sur des acteurs partageant une région réelle avec un arsenal élevé.
- **Filtrage par clearance** : les nœuds au-dessus du niveau du demandeur sont retirés **avec leurs
  arêtes** ; la réponse expose `acl.droppedNodes` pour rendre le filtrage visible.

```bash
curl -s 'localhost:7704/graph?limit=20' | jq '.acl, .degraded'
curl -s 'localhost:7704/graph' -H 'X-Pandora-Subject: {"clearance":"secret","compartments":["nuclear"],"operator":"x","role":"lead","attestation":"t"}' | jq '.stats.types'
```

---

## 6. Limites assumées

| Limite | Conséquence |
|---|---|
| Profil opérateur non authentifiant | Un utilisateur définit ses propres droits. La brique prouve la politique et la traçabilité, pas l'identité. |
| Chiffrement au repos absent | SQLite n'est pas chiffré : la protection repose sur l'accès disque/volume. Une Phase 2 doit ajouter SQLCipher ou un volume chiffré. |
| Classification côté client dupliquée | `src/lib/classification.ts` miroite `sources.py`. Un écart est détectable (comparaison avec `/labels`) mais pas impossible : à terme, générer le miroir depuis le service. |
| Journal non répliqué | Un seul volume Docker. La destruction du volume détruit le journal : il faut une copie hors ligne (dump signé) pour une vraie chaîne de preuve. |
| Attestation serveur éphémère | Quand le navigateur n'a pas encore d'attestation, le proxy en émet une pour la requête. C'est un jeton de session, pas une preuve matérielle. |
| `PANDORA_GOVERNANCE_URL` vide | L'application fonctionne sans application des règles ; la réponse porte `X-Pandora-Governance: unconfigured` et `/sovereignty` l'affiche. Ce n'est pas un mode sûr. |
| Frontière défensive | Pandora reste un outil OSINT défensif : pas de ciblage de personnes, pas de stockage de données personnelles, pas d'allocation d'effecteurs. |

---

## 7. Fichiers de référence

| Chemin | Contenu |
|---|---|
| `ai/pandora-governance-service/policy.py` | Règles ABAC |
| `ai/pandora-governance-service/audit.py` | Journal chaîné + profils + statistiques |
| `ai/pandora-governance-service/tests/` | 20 tests (politique + API + inviolabilité) |
| `ai/pandora-cases-service/db.py` | Schéma SQLite, hash de preuve, chaîne de traçabilité, export |
| `ai/pandora-cases-service/tests/` | 10 tests d'intégration (dont fail-closed) |
| `ai/pandora-ontology-service/graph.py` | Fusion multi-domaines + filtrage par clearance |
| `src/lib/classification.ts` / `src/lib/abac.ts` / `src/proxy.ts` | Application côté web |
| `scripts/dependency-audit.mjs` | Audit des dépendances externes |
