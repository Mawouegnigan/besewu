import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CashClosure } from './cash-closure.entity';

export enum DepositStatus {
  OK = 'ok',
  LITIGE = 'litige',
  RESOLVED = 'resolved',
}

/**
 * Dépôt physique des espèces auprès du receveur (section 6 — workflow imposé) :
 *  - Saisi par le RECEVEUR, jamais par l'agent lui-même (séparation des tâches).
 *  - L'écart avec CashClosure.theoreticalTotal est calculé automatiquement.
 *  - Tout écart > seuil déclenche un statut LITIGE bloquant, à documenter et résoudre
 *    avant la clôture comptable mensuelle.
 */
@Entity('deposits')
export class Deposit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CashClosure)
  closure: CashClosure;

  @Column()
  closureId: string;

  // Le RECEVEUR qui a compté et saisi le dépôt — distinct de l'agent (séparation des tâches).
  @ManyToOne(() => User, { eager: true })
  receiver: User;

  @Column()
  receiverId: string;

  @Column('int')
  depositedAmount: number;

  @Column('int')
  discrepancy: number; // theoreticalTotal - depositedAmount (peut être négatif)

  @Column({ type: 'enum', enum: DepositStatus, default: DepositStatus.OK })
  status: DepositStatus;

  @Column({ nullable: true })
  disputeNotes: string | null;

  @Column({ nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
