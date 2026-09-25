import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Enveloppe autour de flutter_secure_storage (Android Keystore / iOS Keychain).
///
/// ⚠️ LIMITE CONNUE (documentée dans le README) : ceci chiffre la clé privée au
/// repos, mais ne produit PAS une clé non-exportable au sens strict d'un
/// keystore matériel (section 3, Option B de la revue critique demande une clé
/// "stockée dans le Keystore matériel, non exportable"). Une implémentation
/// stricte nécessiterait du code natif Android (KeyGenParameterSpec avec
/// setIsStrongBoxBacked / clé générée et utilisée exclusivement à l'intérieur
/// du Keystore, jamais lue en clair par Dart). Ce compromis reste largement
/// supérieur à un stockage en clair (SharedPreferences/SQLite brut, explicitement
/// proscrit section 2), mais n'est pas la cible finale — à traiter avant mise en
/// production réelle avec des fonds publics.
class SecureStorageService {
  SecureStorageService._();
  static final SecureStorageService instance = SecureStorageService._();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kDevicePrivateKey = 'device_ed25519_private_key';
  static const _kDeviceId = 'device_id';
  static const _kAccessToken = 'access_token';
  static const _kUsername = 'session_username';
  static const _kRole = 'session_role';
  static const _kLastSyncAt = 'last_sync_at';

  Future<void> saveDeviceKeyPair({
    required String privateKeyBase64,
    required String deviceId,
  }) async {
    await _storage.write(key: _kDevicePrivateKey, value: privateKeyBase64);
    await _storage.write(key: _kDeviceId, value: deviceId);
  }

  Future<String?> getDevicePrivateKeyBase64() => _storage.read(key: _kDevicePrivateKey);
  Future<String?> getDeviceId() => _storage.read(key: _kDeviceId);

  Future<void> saveSession({
    required String accessToken,
    required String username,
    required String role,
  }) async {
    await _storage.write(key: _kAccessToken, value: accessToken);
    await _storage.write(key: _kUsername, value: username);
    await _storage.write(key: _kRole, value: role);
  }

  Future<String?> getAccessToken() => _storage.read(key: _kAccessToken);
  Future<String?> getUsername() => _storage.read(key: _kUsername);
  Future<String?> getRole() => _storage.read(key: _kRole);

  Future<void> clearSession() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kUsername);
    await _storage.delete(key: _kRole);
  }

  Future<void> setLastSyncAt(DateTime dt) =>
      _storage.write(key: _kLastSyncAt, value: dt.toIso8601String());

  Future<DateTime?> getLastSyncAt() async {
    final raw = await _storage.read(key: _kLastSyncAt);
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }

  /// Verrouillage local après MAX_OFFLINE_HOURS sans synchronisation réussie
  /// (section 2 de la revue critique). Ne remplace pas le blocage serveur —
  /// c'est une défense supplémentaire côté device si le réseau manque longtemps.
  Future<bool> isLockedOutForOfflineDuration(int maxOfflineHours) async {
    final last = await getLastSyncAt();
    if (last == null) return false; // Jamais synchronisé = pas encore de délai à mesurer
    final hoursSince = DateTime.now().difference(last).inHours;
    return hoursSince > maxOfflineHours;
  }

  Future<bool> hasEnrolledDevice() async => (await getDeviceId()) != null;
}
