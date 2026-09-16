import { createPublicKey, verify } from 'crypto';

/**
 * Vérifie la signature Ed25519 d'une transaction (section 3, Option B).
 *
 * `publicKeyBase64` est attendu au format SPKI DER encodé en base64 (format standard
 * produit par la plupart des Keystores mobiles lors de l'export de la clé publique).
 * `signatureBase64` est la signature Ed25519 (64 octets) encodée en base64.
 *
 * Le message signé doit être reconstruit à l'identique de ce que le mobile a signé :
 * voir `buildSignedPayload`. Toute divergence de format entre mobile et backend fait
 * échouer la vérification — ce contrat DOIT être versionné (ex. inclure une version de
 * schéma) si le format évolue.
 */
export function verifyTransactionSignature(params: {
  publicKeyBase64: string;
  signatureBase64: string;
  payload: string;
}): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(params.publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null, // Ed25519 : pas d'algorithme de digest séparé
      Buffer.from(params.payload, 'utf8'),
      publicKey,
      Buffer.from(params.signatureBase64, 'base64'),
    );
  } catch {
    // Clé/signature malformée = signature invalide, pas une erreur 500
    return false;
  }
}

export function buildSignedPayload(input: {
  id: string;
  deviceId: string;
  amount: number;
  taxType: string;
  localTimestamp: string;
}): string {
  return [input.id, input.deviceId, input.amount.toString(), input.taxType, input.localTimestamp].join(
    '|',
  );
}
