import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Journal d'audit inaltérable (section 8 — "Journal d'audit inaltérable" listé comme manque
 * du cahier des charges original : "qui a consulté/modifié quoi, y compris côté admin").
 *
 * Cette table est INSERT-ONLY au niveau applicatif (aucun service ne doit exposer
 * d'UPDATE ni de DELETE dessus). En production, verrouiller ça aussi au niveau base :
 * REVOKE UPDATE, DELETE ON audit_log FROM besewu_app; (utilisateur DB dédié en écriture
 * seule additive), voire réplication vers un stockage write-once (WORM) pour les communes
 * qui l'exigent.
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  actorId: string | null; // null = action système (ex. job de vérification offline)

  @Column({ nullable: true })
  actorRole: string | null;

  @Index()
  @Column()
  action: string; // ex. 'TRANSACTION_SYNC', 'DEVICE_REVOKE', 'DISPUTE_RESOLVE', 'LOGIN_FAILED'

  @Index()
  @Column({ nullable: true })
  entityType: string | null; // ex. 'Transaction', 'Device', 'Deposit'

  @Index()
  @Column({ nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ nullable: true })
  ipAddress: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
