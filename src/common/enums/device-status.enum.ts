// Statut d'un device mobile enrôlé. Un device REVOKED voit toutes ses transactions
// futures (même signées offline) rejetées à la synchro — voir section 3, Option B.
export enum DeviceStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked', // Blocage à distance (perte/vol/suspicion) — section 2, réversible
  REVOKED = 'revoked', // Révocation définitive de la clé de signature — section 3
}
