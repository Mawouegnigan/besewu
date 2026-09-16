// Statuts d'une transaction de collecte.
// PENDING_SYNC n'existe côté serveur que de façon transitoire (le mobile envoie déjà
// les transactions closes) ; SYNCED est le cas nominal.
export enum TransactionStatus {
  SYNCED = 'synced',
  FLAGGED = 'flagged', // Écart d'horodatage ou autre anomalie détectée à la synchro (section 1)
  CANCELLED = 'cancelled', // Annulée avec motif + validation superviseur (section 4), jamais supprimée
}
