import { createHash } from 'crypto';

/**
 * Hash-chaining des transactions par agent (section 7 de la revue critique) :
 * chaque transaction inclut le hash de la précédente de ce même agent, de sorte que
 * toute insertion ou suppression a posteriori dans la table casse la chaîne et devient
 * détectable — l'équivalent low-tech d'une blockchain, sans son coût.
 *
 * Le hash couvre les champs qui NE DOIVENT PAS changer après coup. Le statut
 * (FLAGGED/CANCELLED) n'y entre pas : annuler une transaction est une opération
 * distincte et tracée (voir TransactionsService.cancel), pas une réécriture silencieuse.
 */
export function computeTransactionHash(input: {
  id: string; // UUID généré côté mobile
  deviceId: string;
  amount: number;
  taxType: string;
  serverTimestamp: string; // ISO 8601 — l'horodatage qui fait foi (section 1)
  previousHash: string; // hash de la transaction précédente du même agent, ou GENESIS
}): string {
  const payload = [
    input.id,
    input.deviceId,
    input.amount.toString(),
    input.taxType,
    input.serverTimestamp,
    input.previousHash,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

export const GENESIS_HASH = '0'.repeat(64);
