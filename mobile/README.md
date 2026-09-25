# Besewu — Mobile (Flutter)

Application mobile offline-first pour la collecte des taxes municipales (Bénin).
Squelette écrit pour être directement interopérable avec le backend NestJS
(`besewu-backend`) : mêmes formats de clé, de signature, et de payload.

## ⚠️ Étape indispensable avant tout : ce dossier n'est PAS un projet Flutter complet

Seuls `lib/`, `pubspec.yaml`, `analysis_options.yaml` et `.gitignore` sont fournis —
il manque les dossiers `android/`, `ios/` etc. générés par l'outil Flutter lui-même
(non écrits ici, générés par machine spécifique). Avant de faire quoi que ce soit :

```bash
flutter create --org bj.besewu --project-name besewu_app .
```

Cette commande, lancée DANS ce dossier, génère les dossiers de plateforme sans
toucher à `lib/` ni `pubspec.yaml` (elle demandera de fusionner, accepter). Ensuite :

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # génère app_database.g.dart (Drift)
flutter run
```

Par défaut l'app pointe vers `http://10.0.2.2:3000` (émulateur Android → machine
hôte). Pour un terminal physique ou un autre backend :

```bash
flutter run --dart-define=BESEWU_API_URL=http://<IP-de-ta-machine>:3000
```

Je n'ai pas pu exécuter `flutter pub get` ni compiler ce code (pas d'environnement
Flutter ni d'accès réseau ici) — comme pour le backend, la première vraie
validation se fait chez toi. Attends-toi à possiblement devoir ajuster des
versions de packages dans `pubspec.yaml` selon ce que `flutter pub get` résout.

## Architecture

```
lib/
├── core/
│   ├── api/          Client Dio + wrappers (auth, devices, transactions)
│   ├── crypto/        Génération de clé Ed25519 + signature (voir plus bas)
│   ├── storage/       Stockage sécurisé (clé privée, session JWT)
│   ├── network/        Détection de connectivité
│   └── constants.dart
├── data/
│   ├── local/          Base Drift (file d'attente offline des transactions)
│   └── repositories/   Logique métier : encaisser, synchroniser
└── features/
    ├── splash_screen.dart   Vérifie la session au démarrage
    ├── auth/                 Connexion (PIN)
    ├── enrollment/            Enrôlement d'un device (superviseur)
    ├── collection/            Encaissement "en 2 clics"
    ├── sync/                  Synchronisation manuelle
    └── home/                  Menu selon le rôle
```

## Point d'interopérabilité critique : format de la clé publique

Le backend (`crypto.createPublicKey` de Node.js) attend la clé publique Ed25519
au format **SPKI DER, encodée en base64**. Le package Flutter `cryptography` ne
produit que les 32 octets bruts de la clé. `Ed25519KeyService` les enveloppe donc
manuellement dans l'en-tête ASN.1 fixe (`_spkiEd25519Prefix`, 12 octets, OID
1.3.101.112) avant l'enrôlement — voir les commentaires dans
`lib/core/crypto/ed25519_key_service.dart`. Si l'enrôlement échoue avec une
erreur de parsing de clé côté backend, c'est le premier endroit à vérifier.

Le format du message signé (`buildSignedPayload`) doit rester un miroir EXACT de
la fonction homonyme côté backend
(`besewu-backend/src/transactions/utils/signature.util.ts`) :

```
[id, deviceId, amount, taxType, localTimestamp].join('|')
```

## Authentification : deviceId requis seulement pour l'AGENT

`AuthService.login` côté backend ne vérifie un device enrôlé que pour le rôle
`AGENT` (bug corrigé pendant le développement du backend — voir son README).
Les autres rôles (chef_equipe, receveur, maire, auditeur) se connectent avec
juste `username` + `pin`. `LoginScreen` reflète ça : il lit un `deviceId` local
s'il existe et le transmet, sinon se connecte sans.

## Flux d'enrôlement d'un device

Il n'y a **aucun** moyen pour un agent d'enrôler lui-même son terminal — c'est
volontaire (voir revue critique de sécurité, section 3). Le flux réel :

1. Un CHEF_EQUIPE ou la MAIRE se connecte sur le téléphone destiné à l'agent,
   avec SA PROPRE session (pas de deviceId requis pour son rôle).
2. Il ouvre "Enrôler ce terminal" (`EnrollmentScreen`), saisit l'UUID de l'agent
   destinataire.
3. Le téléphone génère lui-même sa paire de clés Ed25519 — la clé privée ne
   quitte jamais l'appareil, seule la clé publique est envoyée au backend.
4. Le superviseur se déconnecte ; l'agent peut désormais se connecter sur ce
   même terminal, reconnu comme son device.

**Limite connue** : l'écran demande l'UUID de l'agent en saisie libre — le
backend n'expose pas encore de `GET /users` pour proposer un vrai sélecteur.
À ajouter avant un usage réel sur le terrain.

## Sécurité — limites connues de ce squelette

Documentées explicitement pour ne pas être découvertes en revue de sécurité
plus tard :

| Limite | Détail |
|---|---|
| Clé privée non "hardware-backed" strict | `flutter_secure_storage` chiffre au repos via Android Keystore/iOS Keychain, mais Dart peut techniquement lire la clé en clair en mémoire. Une clé réellement non-exportable nécessiterait du code natif Android (`KeyGenParameterSpec`, StrongBox) — hors périmètre de ce squelette (voir aussi "Play Integrity API" listé côté backend). |
| Pas d'impression Bluetooth ESC/POS | Le ticket est enregistré localement mais rien n'imprime physiquement. À ajouter (ex. package `esc_pos_bluetooth` ou équivalent maintenu). |
| Pas de vérification d'intégrité du device (Play Integrity) | Un device rooté n'est pas détecté. |
| Pas de certificate pinning | Les appels Dio n'épinglent pas le certificat du backend — MITM possible sur un device compromis. |
| Pas de biométrie / ré-auth périodique | Une fois connecté, la session reste valide jusqu'à expiration du JWT (8h par défaut côté backend), sans reverrouillage automatique après inactivité (section 2 de la revue critique le recommandait). |
| Pas de synchro automatique en arrière-plan | Uniquement déclenchée manuellement (`SyncScreen`). Un vrai déploiement voudrait une synchro périodique même app fermée (ex. `workmanager`). |
| Verrouillage MAX_OFFLINE_HOURS approximatif | `SplashScreen` vérifie la durée depuis la dernière synchro RÉUSSIE, mais rien n'empêche de changer l'heure système du device pour contourner ce contrôle local (cohérent avec la revue critique : l'horodatage qui fait foi est toujours celui du serveur, ce verrou local n'est qu'une gêne supplémentaire, pas une garantie). |
| Sélection d'agent en saisie libre à l'enrôlement | Voir section précédente. |
| Pas de tests | Contrairement au backend (20 tests unitaires), ce squelette mobile n'a pas encore de tests — à prioriser sur `Ed25519KeyService` (le point le plus critique) avant tout usage réel. |

## Tester de bout en bout avec les données de démo du backend

Après `npm run seed` côté backend (voir son README), tu obtiens un device de
test déjà enrôlé pour `agent.kofi` avec sa clé privée. Ce squelette mobile
génère sa PROPRE paire de clés à l'enrôlement — donc pour tester agent.kofi
directement, il faudrait soit :
- Réenrôler un nouveau device pour `agent.kofi` via `EnrollmentScreen` (plus
  simple, mais nécessite d'abord une session superviseur, ex. `maire.cotonou`,
  et l'UUID exact de `agent.kofi`, visible dans la sortie de `npm run seed`) ;
- Ou adapter temporairement `SecureStorageService` pour injecter manuellement
  la clé privée générée par le seed (utile uniquement pour un débogage rapide,
  pas un flux normal).

La première option est la plus représentative du vrai fonctionnement du
système — c'est celle à utiliser pour valider l'intégration.

## Prochaines étapes suggérées

1. `flutter create .` puis premier build réel — corriger les éventuels écarts
   de version de packages.
2. Écrire des tests sur `Ed25519KeyService` (génération de clé, format SPKI,
   signature) — c'est le point le plus sensible du système.
3. Impression Bluetooth ESC/POS.
4. `GET /users` côté backend pour un vrai sélecteur d'agent à l'enrôlement.
5. Synchronisation automatique en arrière-plan.
6. Écrans dédiés RECEVEUR (saisie de dépôt) et AUDITEUR (consultation du
   journal d'audit) — actuellement non implémentés côté mobile (ces rôles sont
   plutôt destinés à un portail web, à trancher avec l'équipe).
