## Backend

API NestJS + PostgreSQL pour la solution de collecte mobile des taxes municipales
(Bénin). Ce squelette implémente les décisions **P0** de la revue critique du cahier
des charges : idempotence + hash-chaining des transactions, signature Ed25519,

## Démarrage

```bash
cp .env.example .env        # ajuster les secrets — voir "Validation d'environnement" ci-dessous
docker compose up -d        # lance PostgreSQL
npm install                 # génère aussi package-lock.json — à committer ensuite
npm run migration:run       # applique le schéma (voir section Migrations ci-dessous)
npm run seed                # crée des comptes de démo — sans ça, personne ne peut se connecter
npm run start:dev
```

L'API démarre sur `http://localhost:3000`.
Documentation interactive (hors production) : `http://localhost:3000/docs`.
Vérification de santé : `GET http://localhost:3000/health`.

## Validation d'environnement

`src/config/env.validation.ts` valide toutes les variables au démarrage (schéma Joi) :
l'application refuse de démarrer si une variable requise manque ou a un type invalide
(ex. `JWT_SECRET` trop court), plutôt que d'échouer plus tard de façon confuse.

## Comptes de démo (`npm run seed`)

Le système n'expose **aucun endpoint public d'inscription** (les comptes sont
provisionnés par la mairie, jamais auto-créés — cohérent avec le RBAC). `npm run seed`
crée un compte par rôle avec un PIN simple (**dev uniquement**, jamais en production),
plus un device de test enrôlé et signé pour l'agent de démo. Le script est idempotent
(relançable sans dupliquer) et affiche en sortie les identifiants, l'id du device, sa
clé privée Ed25519 (pour signer des transactions de test), et des exemples `curl`
prêts à l'emploi (login, sync de transaction).

## Sécurité HTTP et documentation

- **Helmet** (`app.use(helmet())` dans `main.ts`) — en-têtes de sécurité standard
  (CSP, HSTS, X-Frame-Options, etc.).
- **Swagger/OpenAPI** sur `/docs` (désactivé en production) — généré depuis les
  contrôleurs (`@ApiTags`, `@ApiBearerAuth`). Les DTOs n'ont pas encore de
  `@ApiProperty` détaillés : à enrichir progressivement.
- **`GET /health`** — endpoint public minimal, vérifie la connexion à PostgreSQL,
  utilisable par un load balancer ou un orchestrateur.

## Base de données : migrations, pas de synchronize

`synchronize` est désactivé sans exception, y compris en développement (voir le
commentaire dans `src/config/typeorm.config.ts`). Le schéma est géré exclusivement
par des migrations TypeORM, versionnées comme le reste du code :

```bash
npm run migration:run                                    # applique les migrations en attente
npm run migration:generate -- src/migrations/NomChangement  # après avoir modifié une entité
npm run migration:revert                                 # annule la dernière migration
```

La migration initiale (`src/migrations/1758000000000-InitSchema.ts`) crée le schéma
complet en SQL explicite (pas de génération automatique) : chaque table, contrainte et
index y est écrit et commenté à la main, pour rester lisible en revue de code — cohérent
avec la posture d'audit du projet.

**Point d'attention technique réglé pendant l'écriture de cette migration** : les
relations TypeORM (`Device.agent`, `Transaction.agent`/`device`, `CashClosure.agent`,
`Deposit.closure`/`receiver`) déclarent maintenant explicitement `@JoinColumn({ name: '...' })`
pour pointer vers la colonne FK "brute" déjà présente sur l'entité (`agentId`, `deviceId`,
etc.). Sans ça, TypeORM tente de gérer une deuxième colonne FK implicite en plus de la
colonne explicite, ce qui provoque un conflit de schéma — indétectable avec
`synchronize: true` mais immédiat en écrivant une migration manuelle.

## Tests

```bash
npm test              # tests unitaires
npm run test:cov      # avec couverture
```

Les tests couvrent en priorité le cœur anti-fraude, celui que la revue critique de
sécurité identifie comme critique (P0) :

- `src/transactions/utils/hash-chain.util.spec.ts` — déterminisme et sensibilité du
  hash-chaining à toute altération a posteriori.
- `src/transactions/utils/signature.util.spec.ts` — vérification Ed25519 avec de vraies
  paires de clés générées à la volée (signature valide, clé usurpée, payload trafiqué,
  entrée malformée).
- `src/transactions/transactions.service.spec.ts` — le comportement de `sync()` de bout
  en bout avec un repository mocké : idempotence sur id dupliqué, rejet de signature
  invalide, flag `clockTampered` sur dérive d'horloge, rejet total d'un lot venant d'un
  device bloqué/révoqué, continuité de la chaîne de hash entre deux transactions.
- `src/auth/auth.service.spec.ts` — la logique de connexion conditionnelle au rôle
  (voir "Bug corrigé" ci-dessous) : un rôle non-agent se connecte sans deviceId, un
  agent sans deviceId est rejeté, un agent avec le device d'un autre agent est rejeté,
  un agent avec son propre device actif se connecte, un device bloqué est rejeté.

### Bug corrigé pendant cette phase : device requis pour tous les rôles

`AuthService.login` exigeait initialement un device `ACTIVE` pour **tous** les rôles,
alors que la notion de "device enrôlé" (avec clé publique Ed25519 pour signer des
transactions offline) n'a de sens que pour l'`AGENT`. Un `maire` ou un `receveur`
utilisant un portail web n'a pas vocation à posséder un device au sens de ce système.

Corrigé : `deviceId` est maintenant optionnel dans `LoginDto`, et seul le rôle `AGENT`
déclenche la vérification — qui inclut désormais aussi que le device appartient bien à
l'agent qui tente de se connecter (`device.agentId === user.id`), pas seulement qu'il
est `ACTIVE` — defense in depth contre un agent qui emprunterait l'id du device d'un
collègue.

## Intégration continue

`.github/workflows/ci.yml` exécute lint + build + tests à chaque push/PR sur `main`.
Utilise `npm install` en attendant qu'un `package-lock.json` soit committé (généré par
le premier `npm install` local) — remplacer ensuite par `npm ci` pour des builds
reproductibles (voir commentaire dans le workflow).

## Qualité de code

- `.eslintrc.cjs` + `.prettierrc` : `npm run lint` / `npm run format`.
- `.gitattributes` normalise les fins de ligne en LF dans le dépôt, quelle que soit la
  plateforme locale (élimine les warnings CRLF vus sous Windows).

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
