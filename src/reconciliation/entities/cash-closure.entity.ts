import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Clôture de caisse quotidienne côté agent (déjà prévue au cahier des charges original,
 * section 3.1). Génère le "total attendu théorique" utilisé dans le rapprochement
 * (section 6 de la revue critique).
 */
@Entity('cash_closures')
@Index(['agentId', 'closureDate'], { unique: true })
export class CashClosure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'agentId' })
  agent: User;

  @Column()
  agentId: string;

  @Column({ type: 'date' })
  closureDate: string; // YYYY-MM-DD

  // Somme des transactions SYNCED (hors CANCELLED/FLAGGED non résolues) de la journée,
  // calculée côté serveur — jamais saisie manuellement par l'agent.
  @Column('int')
  theoreticalTotal: number;

  @CreateDateColumn()
  createdAt: Date;
}
