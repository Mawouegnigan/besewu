import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'tables.dart';

part 'app_database.g.dart';

/// Base de données locale chiffrée au repos (chiffrement disque géré par
/// l'OS — voir README pour la limite connue concernant SQLCipher).
///
/// ⚠️ Ce fichier utilise la génération de code Drift (`part 'app_database.g.dart'`).
/// Après tout changement de `tables.dart` ou de cette classe, exécuter :
///
///   dart run build_runner build --delete-conflicting-outputs
///
/// Le fichier `app_database.g.dart` n'est volontairement PAS committé (voir
/// .gitignore) — il doit être régénéré localement, comme `node_modules` côté
/// backend.
@DriftDatabase(tables: [LocalTransactions])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;

  Future<void> enqueueTransaction(LocalTransactionsCompanion entry) =>
      into(localTransactions).insert(entry);

  Future<List<LocalTransaction>> pendingTransactions() {
    return (select(localTransactions)
          ..where((t) => t.syncStatus.equals('pending')))
        .get();
  }

  Future<void> markSynced(String id, {String? syncErrorOrNull, required String status}) {
    return (update(localTransactions)..where((t) => t.id.equals(id))).write(
      LocalTransactionsCompanion(
        syncStatus: Value(status),
        syncError: Value(syncErrorOrNull),
      ),
    );
  }

  Future<List<LocalTransaction>> allTransactions() => select(localTransactions).get();
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'besewu_local.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
