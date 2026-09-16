# Besewu — Backend

API NestJS + PostgreSQL pour la solution de collecte mobile des taxes municipales
(Bénin). Ce squelette implémente les décisions **P0** de la revue critique du cahier
des charges : idempotence + hash-chaining des transactions, signature Ed25519,
horodatage serveur qui fait foi, RBAC, journal d'audit inaltérable, workflow de
rapprochement de caisse avec séparation des tâches.

## Démarrage

```bash
cp .env.example .env        # ajuster les secrets
docker compose up -d        # lance PostgreSQL
npm install
npm run start:dev
```

L'API démarre sur `http://localhost:3000`. En développement, `synchronize: true`
crée le schéma automatiquement depuis les entités — **à remplacer par des migrations
TypeORM avant tout déploiement réel** (voir `src/config/typeorm.config.ts`).

## Structure

```
src/
├── auth/            Connexion (username + PIN), JWT, verrouillage progressif
├── users/            Comptes (agent, chef_equipe, receveur, maire, auditeur)
├── devices/           Enrôlement des terminaux, blocage, révocation de clé
├── transactions/    Cœur anti-fraude : sync idempotente, signature, hash-chain
├── reconciliation/   Clôture de caisse, dépôts, litiges
├── audit/            Journal d'audit append-only
└── common/            Guards RBAC, décorateurs, filtres, enums partagés
```

## Rôles (RBAC)

| Rôle | Peut |
|---|---|
| `agent` | Synchroniser ses transactions, clôturer sa caisse |
| `chef_equipe` | Enrôler/bloquer des devices, annuler une transaction, créer une clôture |
| `receveur` | Saisir les dépôts physiques (jamais l'agent lui-même — séparation des tâches) |
| `maire` | Tout ce qui précède + révocation de devices, résolution des litiges |
| `auditeur` | Lecture seule : journal d'audit, transactions, intégrité de la chaîne |

## Points volontairement laissés ouverts pour la suite

Ces points sont mentionnés dans le code (commentaires) mais pas implémentés dans ce
squelette — à trancher avec l'équipe avant la mise en prod :

- **OTP superviseur** pour débloquer un compte après 10 échecs de PIN (`UsersService.unlockWithOtp`
  existe mais aucun canal SMS n'est branché).
- **Play Integrity API** côté mobile (hors périmètre backend).
- **Certificate pinning** côté mobile (hors périmètre backend).
- **Migrations TypeORM** — `synchronize: true` n'est acceptable qu'en développement.
- **Conformité APDP Bénin** — déclaration/autorisation sur les données personnelles
  (agents, contribuables), et choix d'hébergement local/régional à valider avant tout
  déploiement.
- **Verrouillage local du device après 72h offline** (`MAX_OFFLINE_HOURS` dans `.env`)
  — la valeur est prévue côté config, l'application (côté mobile) doit l'appliquer ;
  côté serveur, un job planifié peut aussi surveiller `Device.lastSyncAt` pour alerter
  la mairie sur les devices "silencieux".

## Prochaines étapes suggérées

1. Écrire les migrations TypeORM (remplacer `synchronize: true`).
2. Ajouter un seed de données de démo (communes, marchés, comptes de test).
3. Endpoint public USSD-friendly pour la vérification de ticket (déjà exposé en HTTP
   via `GET /transactions/verify/:id`, à adapter au gateway USSD/SMS choisi).
4. Détection d'anomalies statistiques (section 4 de la revue critique) — non
   implémentée ici, nécessite un choix de moteur (job SQL périodique vs service dédié).
