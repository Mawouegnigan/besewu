import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import '../storage/secure_storage_service.dart';

/// Génère, stocke et utilise la paire de clés Ed25519 du device (section 3,
/// Option B de la revue critique).
///
/// POINT D'INTEROPÉRABILITÉ CRITIQUE : le backend (Node.js `crypto.createPublicKey`)
/// attend la clé publique au format **SPKI DER, encodée en base64**. Le package
/// `cryptography` ne produit que les 32 octets bruts de la clé Ed25519 — il faut
/// donc l'envelopper manuellement dans l'en-tête ASN.1 SPKI fixe pour Ed25519
/// avant de l'envoyer à `POST /devices/enroll`. Cet en-tête est un préfixe
/// **constant** de 12 octets (OID Ed25519 = 1.3.101.112), documenté ici pour que
/// personne ne le supprime en pensant que c'est du bruit :
///
///   30 2a 30 05 06 03 2b 65 70 03 21 00 <32 octets de clé publique>
///
/// Si ce préfixe est retiré ou modifié, `verifyTransactionSignature` côté
/// backend échouera à parser la clé (`createPublicKey` lèvera une exception,
/// traitée comme signature invalide — voir `signature.util.ts`).
class Ed25519KeyService {
  Ed25519KeyService._();
  static final Ed25519KeyService instance = Ed25519KeyService._();

  static final Ed25519 _algorithm = Ed25519();

  // En-tête SPKI DER fixe pour Ed25519 (RFC 8410) — NE PAS MODIFIER.
  static const List<int> _spkiEd25519Prefix = [
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ];

  SimpleKeyPair? _cachedKeyPair;

  /// Étape 1/2 de l'enrôlement : génère une nouvelle paire de clés EN MÉMOIRE
  /// (rien n'est encore persisté). Retourne la clé publique au format SPKI DER
  /// base64, prête pour `POST /devices/enroll`, et la clé privée en base64 —
  /// que l'appelant doit passer à `persistKeyPair` UNE FOIS le deviceId réel
  /// connu (renvoyé par le backend à l'enrôlement).
  Future<GeneratedKeyPair> generateKeyPair() async {
    final keyPair = await _algorithm.newKeyPair();
    final privateKeyData = await keyPair.extractPrivateKeyBytes();
    final publicKey = await keyPair.extractPublicKey();
    _cachedKeyPair = keyPair;

    return GeneratedKeyPair(
      privateKeyBase64: base64Encode(privateKeyData),
      publicKeySpkiBase64: _publicKeyToSpkiBase64(publicKey.bytes),
    );
  }

  /// Étape 2/2 : persiste la clé privée générée à l'étape 1, associée au
  /// deviceId retourné par le backend après enrôlement réussi.
  Future<void> persistKeyPair({
    required String deviceId,
    required String privateKeyBase64,
  }) async {
    await SecureStorageService.instance.saveDeviceKeyPair(
      privateKeyBase64: privateKeyBase64,
      deviceId: deviceId,
    );
  }

  String _publicKeyToSpkiBase64(List<int> rawPublicKeyBytes) {
    final der = Uint8List.fromList([..._spkiEd25519Prefix, ...rawPublicKeyBytes]);
    return base64Encode(der);
  }

  Future<SimpleKeyPair?> _loadKeyPair() async {
    if (_cachedKeyPair != null) return _cachedKeyPair;
    final stored = await SecureStorageService.instance.getDevicePrivateKeyBase64();
    if (stored == null) return null;
    final privateKeyBytes = base64Decode(stored);
    final keyPair = await _algorithm.newKeyPairFromSeed(privateKeyBytes);
    _cachedKeyPair = keyPair;
    return keyPair;
  }

  /// Signe le payload d'une transaction. Le format du payload DOIT rester
  /// identique à `buildSignedPayload` côté backend
  /// (src/transactions/utils/signature.util.ts) :
  ///
  ///   [id, deviceId, amount, taxType, localTimestamp].join('|')
  ///
  /// Toute divergence (ordre des champs, séparateur, formatage de la date)
  /// rend la signature invalide côté serveur.
  Future<String> signTransactionPayload({
    required String id,
    required String deviceId,
    required int amount,
    required String taxType,
    required String localTimestampIso8601,
  }) async {
    final keyPair = await _loadKeyPair();
    if (keyPair == null) {
      throw StateError('Aucune clé de device trouvée — le device doit être enrôlé avant de signer.');
    }

    final payload = buildSignedPayload(
      id: id,
      deviceId: deviceId,
      amount: amount,
      taxType: taxType,
      localTimestampIso8601: localTimestampIso8601,
    );

    final signature = await _algorithm.sign(utf8.encode(payload), keyPair: keyPair);
    return base64Encode(signature.bytes);
  }

  Future<bool> hasKeyPair() async => (await _loadKeyPair()) != null;
}

class GeneratedKeyPair {
  GeneratedKeyPair({required this.privateKeyBase64, required this.publicKeySpkiBase64});
  final String privateKeyBase64;
  final String publicKeySpkiBase64;
}

/// Doit rester un miroir EXACT de `buildSignedPayload` dans
/// src/transactions/utils/signature.util.ts côté backend.
String buildSignedPayload({
  required String id,
  required String deviceId,
  required int amount,
  required String taxType,
  required String localTimestampIso8601,
}) {
  return [id, deviceId, amount.toString(), taxType, localTimestampIso8601].join('|');
}
