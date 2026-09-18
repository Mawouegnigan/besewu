import { computeTransactionHash, GENESIS_HASH } from './hash-chain.util';

describe('computeTransactionHash', () => {
  const base = {
    id: '11111111-1111-1111-1111-111111111111',
    deviceId: '22222222-2222-2222-2222-222222222222',
    amount: 500,
    taxType: 'place_marche',
    serverTimestamp: '2026-09-15T08:00:00.000Z',
    previousHash: GENESIS_HASH,
  };

  it('produit un hash déterministe pour des entrées identiques', () => {
    const h1 = computeTransactionHash(base);
    const h2 = computeTransactionHash({ ...base });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
  });

  it('change de hash si le montant change (résistance à la falsification a posteriori)', () => {
    const h1 = computeTransactionHash(base);
    const h2 = computeTransactionHash({ ...base, amount: 501 });
    expect(h1).not.toBe(h2);
  });

  it('change de hash si previousHash change — casse la chaîne en cas d’insertion/suppression', () => {
    const h1 = computeTransactionHash(base);
    const h2 = computeTransactionHash({ ...base, previousHash: 'a'.repeat(64) });
    expect(h1).not.toBe(h2);
  });

  it('deux transactions consécutives forment une chaîne vérifiable', () => {
    const tx1Hash = computeTransactionHash(base);
    const tx2 = {
      ...base,
      id: '33333333-3333-3333-3333-333333333333',
      amount: 200,
      previousHash: tx1Hash,
    };
    const tx2Hash = computeTransactionHash(tx2);

    // Rejouer le calcul avec les mêmes champs doit retomber sur le même hash —
    // c'est ce que vérifie TransactionsService.verifyChainIntegrity en production.
    expect(computeTransactionHash(tx2)).toBe(tx2Hash);
    expect(tx2Hash).not.toBe(tx1Hash);
  });
});
