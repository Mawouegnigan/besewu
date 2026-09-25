import 'package:drift/drift.dart';

/// File d'attente locale des transactions collectées, avec ou sans réseau
/// (cahier des charges original, section 3.1 : "Mode Autonome strict —
/// enregistrement local des transactions si aucun réseau n'est détecté").
///
/// `id` est le même UUID que celui envoyé au backend (clé d'idempotence) —
/// généré ici, au moment de l'encaissement, jamais côté serveur.
///
/// `syncStatus` distingue :
///  - pending    : pas encore envoyée
///  - syncing    : envoi en cours (évite les doubles envois concurrents)
///  - synced     : acceptée par le serveur (outcome 'accepted' ou 'duplicate')
///  - flagged    : acceptée mais signalée par le serveur (dérive d'horloge)
///  - error      : rejetée par le serveur (signature/device) — nécessite une
///                 investigation, ne doit jamais être ré-envoyée automatiquement
///                 telle quelle (voir SyncService).
class LocalTransactions extends Table {
  TextColumn get id => text()(); // UUID — clé primaire, généré côté mobile
  TextColumn get taxType => text()();
  TextColumn get marketOrSector => text().nullable()();
  IntColumn get amount => integer()();
  RealColumn get latitude => real()();
  RealColumn get longitude => real()();
  TextColumn get localTimestamp => text()(); // ISO 8601, figé à la création
  TextColumn get signature => text()(); // base64, calculée à la création
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();
  TextColumn get syncError => text().nullable()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {id};
}
