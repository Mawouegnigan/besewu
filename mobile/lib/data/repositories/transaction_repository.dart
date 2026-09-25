import 'package:drift/drift.dart' show Value;
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';
import '../../core/api/transactions_api.dart';
import '../../core/crypto/ed25519_key_service.dart';
import '../../core/storage/secure_storage_service.dart';
import '../local/app_database.dart';

/// Résultat d'un encaissement, pour affichage immédiat à l'agent (le ticket doit
/// pouvoir être imprimé même hors-ligne — l'impression Bluetooth ESC/POS n'est
/// PAS implémentée dans ce squelette, voir README).
class CollectionResult {
  CollectionResult({required this.transactionId, required this.amount, required this.taxType});
  final String transactionId;
  final int amount;
  final String taxType;
}

class TransactionRepository {
  TransactionRepository(this._db);

  final AppDatabase _db;
  final _uuid = const Uuid();
  final _transactionsApi = const TransactionsApi();

  /// Encaisse une transaction — fonctionne INTÉGRALEMENT hors-ligne :
  /// génère l'UUID, capture la géolocalisation (section 4 de la revue
  /// critique — obligatoire, jamais optionnelle), signe avec la clé Ed25519
  /// du device, et stocke en local. La synchro réseau est un événement séparé
  /// (voir `syncPending`), déclenché explicitement ou en tâche de fond.
  Future<CollectionResult> collect({required int amount, required String taxType}) async {
    final deviceId = await SecureStorageService.instance.getDeviceId();
    if (deviceId == null) {
      throw StateError('Ce device n’est pas enrôlé — impossible d’encaisser.');
    }

    final position = await _capturePosition();
    final id = _uuid.v4();
    final localTimestamp = DateTime.now().toUtc().toIso8601String();

    final signature = await Ed25519KeyService.instance.signTransactionPayload(
      id: id,
      deviceId: deviceId,
      amount: amount,
      taxType: taxType,
      localTimestampIso8601: localTimestamp,
    );

    await _db.enqueueTransaction(
      LocalTransactionsCompanion.insert(
        id: id,
        taxType: taxType,
        amount: amount,
        latitude: position.latitude,
        longitude: position.longitude,
        localTimestamp: localTimestamp,
        signature: signature,
      ),
    );

    return CollectionResult(transactionId: id, amount: amount, taxType: taxType);
  }

  /// Capture la position GPS. Échoue explicitement si la permission est
  /// refusée ou le GPS désactivé — on ne construit JAMAIS une transaction sans
  /// coordonnées (contrairement à un fallback silencieux 0.0/0.0, qui viderait
  /// de son sens le contrôle anti-fraude par géolocalisation).
  Future<Position> _capturePosition() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw StateError('Le GPS est désactivé — activez la localisation pour encaisser.');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      throw StateError('Permission de localisation refusée — requise pour encaisser (anti-fraude).');
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
  }

  /// Synchronise toutes les transactions en attente. Idempotent côté serveur
  /// (voir TransactionsService.sync côté backend) : rejouer cette méthode
  /// plusieurs fois ne duplique rien.
  Future<SyncSummary> syncPending() async {
    final pending = await _db.pendingTransactions();
    if (pending.isEmpty) {
      return SyncSummary(accepted: 0, duplicate: 0, flagged: 0, rejected: 0);
    }

    final payload = pending
        .map((t) => {
              'id': t.id,
              'taxType': t.taxType,
              if (t.marketOrSector != null) 'marketOrSector': t.marketOrSector,
              'amount': t.amount,
              'latitude': t.latitude,
              'longitude': t.longitude,
              'localTimestamp': t.localTimestamp,
              'signature': t.signature,
            })
        .toList();

    final results = await _transactionsApi.sync(payload);

    var accepted = 0, duplicate = 0, flagged = 0, rejected = 0;
    for (final r in results) {
      switch (r.outcome) {
        case 'accepted':
          accepted++;
          await _db.markSynced(r.id, status: 'synced');
          break;
        case 'duplicate':
          duplicate++;
          await _db.markSynced(r.id, status: 'synced');
          break;
        case 'flagged':
          flagged++;
          await _db.markSynced(r.id, status: 'flagged');
          break;
        default:
          rejected++;
          // Volontairement PAS de statut "pending" à nouveau : un rejet de
          // signature/device est une anomalie grave, pas une erreur transitoire
          // (voir commentaire sur LocalTransactions.syncStatus == 'error').
          await _db.markSynced(r.id, status: 'error', syncErrorOrNull: r.outcome);
      }
    }

    if (accepted + duplicate + flagged > 0) {
      await SecureStorageService.instance.setLastSyncAt(DateTime.now());
    }

    return SyncSummary(accepted: accepted, duplicate: duplicate, flagged: flagged, rejected: rejected);
  }
}

class SyncSummary {
  SyncSummary({
    required this.accepted,
    required this.duplicate,
    required this.flagged,
    required this.rejected,
  });
  final int accepted;
  final int duplicate;
  final int flagged;
  final int rejected;

  int get total => accepted + duplicate + flagged + rejected;
}
