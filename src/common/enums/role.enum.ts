// Rôles RBAC — voir section 8 de la revue critique ("RBAC (rôles)" listé comme manque
// du cahier des charges original). Un utilisateur a exactement un rôle.
export enum Role {
  AGENT = 'agent', // Agent collecteur sur le terrain
  CHEF_EQUIPE = 'chef_equipe', // Supervise un groupe d'agents / un marché
  RECEVEUR = 'receveur', // Valide les dépôts d'espèces (séparation des tâches — section 6)
  MAIRE = 'maire', // Administration, blocage de devices, vision globale
  AUDITEUR = 'auditeur', // Lecture seule sur les journaux d'audit et les rapports
}
