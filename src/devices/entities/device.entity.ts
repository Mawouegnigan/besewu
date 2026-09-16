import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DeviceStatus } from '../../common/enums/device-status.enum';

/**
 * Device mobile enrôlé pour un agent (section 3 — Option B : signature offline).
 *
 * publicKey : clé publique correspondant à la clé privée générée et stockée dans le
 * Keystore matériel du device au moment de l'enrôlement (la clé privée ne transite
 * JAMAIS par le backend — seule la clé publique est envoyée ici pour vérifier les
 * signatures des transactions à la synchro).
 *
 * status REVOKED : toute transaction signée par ce device après révocation, même
 * datée d'avant, est marquée invalide à la synchro (liste de révocation consultée
 * systématiquement — voir TransactionsService.verifySignature).
 */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  agent: User;

  @Column()
  agentId: string;

  @Index({ unique: true })
  @Column()
  publicKey: string; // Clé publique Ed25519, encodée base64

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE })
  status: DeviceStatus;

  @Column({ nullable: true })
  blockedReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @CreateDateColumn()
  enrolledAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Durée max sans synchronisation avant blocage automatique local côté app (72h,
   * voir section 2). Le backend expose lastSyncAt pour que le dashboard MAIRE
   * puisse aussi surveiller les devices "silencieux" côté serveur.
   */
}
