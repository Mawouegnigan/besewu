import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { buildSignedPayload, verifyTransactionSignature } from './signature.util';

function generateTestKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { publicKey, privateKey, publicKeyBase64 };
}

function signPayload(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], payload: string) {
  return cryptoSign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
}

describe('verifyTransactionSignature', () => {
  const item = {
    id: '11111111-1111-1111-1111-111111111111',
    deviceId: '22222222-2222-2222-2222-222222222222',
    amount: 500,
    taxType: 'place_marche',
    localTimestamp: '2026-09-15T08:00:00.000Z',
  };

  it('accepte une signature Ed25519 valide produite par la clé privée du device', () => {
    const { privateKey, publicKeyBase64 } = generateTestKeyPair();
    const payload = buildSignedPayload(item);
    const signatureBase64 = signPayload(privateKey, payload);

    const valid = verifyTransactionSignature({ publicKeyBase64, signatureBase64, payload });
    expect(valid).toBe(true);
  });

  it('rejette une signature produite par une AUTRE clé privée (device usurpé)', () => {
    const { publicKeyBase64 } = generateTestKeyPair();
    const attacker = generateTestKeyPair();
    const payload = buildSignedPayload(item);
    const forgedSignature = signPayload(attacker.privateKey, payload);

    const valid = verifyTransactionSignature({
      publicKeyBase64,
      signatureBase64: forgedSignature,
      payload,
    });
    expect(valid).toBe(false);
  });

  it('rejette si le payload a été modifié après signature (ex. montant trafiqué)', () => {
    const { privateKey, publicKeyBase64 } = generateTestKeyPair();
    const originalPayload = buildSignedPayload(item);
    const signatureBase64 = signPayload(privateKey, originalPayload);

    const tamperedPayload = buildSignedPayload({ ...item, amount: 5000 });

    const valid = verifyTransactionSignature({
      publicKeyBase64,
      signatureBase64,
      payload: tamperedPayload,
    });
    expect(valid).toBe(false);
  });

  it('rejette proprement (sans lever d’exception) une clé publique malformée', () => {
    const payload = buildSignedPayload(item);
    const valid = verifyTransactionSignature({
      publicKeyBase64: 'ceci-nest-pas-une-cle-valide',
      signatureBase64: 'ceci-non-plus',
      payload,
    });
    expect(valid).toBe(false);
  });
});
