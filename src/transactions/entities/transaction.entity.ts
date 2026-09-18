import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Device } from '../../devices/entities/device.entity';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

/**
 * Transaction de collecte. `id` est le UUID généré CÔTÉ MOBILE au moment de
 * l'encaissement (PrimaryColumn, pas PrimaryGeneratedColumn) : c'est la clé
 * d'idempotence qui élimine tout risque de double comptabilisation lors de
 * micro-coupures réseau pendant la synchro (cahier des charges original, section 5,
 * renforcé section 1 et 7 de la revue critique).
 *
 * Une requête de sync qui renvoie un id déjà connu est un no-op silencieux côté
 * comptage (mais peut mettre à jour clockTampered s'il y a du nouveau contexte) —
 * voir TransactionsService.sync.
 */
@Entity('transactions')
export class Transaction {
  @PrimaryColumn('uuid')
  id: string;

  // Voir la note dans devices/entities/device.entity.ts : @JoinColumn est requis
  // explicitement dès qu'une colonne FK "brute" (deviceId/agentId) coexiste avec
  // la relation, pour éviter que TypeORM ne crée une colonne implicite en doublon.
  @ManyToOne(() => Device, { eager: true })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column()
  deviceId: string;

  @Index()
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'agentId' })
  agent: User;

  @Column()
  agentId: string;

  @Column('int')
  amount: number; // FCFA, entier — pas de décimales sur cette devise

  @Column()
  taxType: string; // ex. 'place_marche', 'stationnement', ...

  @Column({ type: 'varchar', nullable: true })
  marketOrSector: string | null;

  // Géolocalisation obligatoire (section 4) — permet de vérifier que l'agent était
  // bien sur son secteur assigné et de détecter des transactions "fantômes".
  @Column('double precision')
  latitude: number;

  @Column('double precision')
  longitude: number;

  // Horodatage local du mobile — indicatif seulement, jamais celui qui fait foi (section 1).
  @Column({ type: 'timestamptz' })
  localTimestamp: Date;

  // Horodatage serveur — fait foi légalement. Fixé à la réception de la sync.
  @Column({ type: 'timestamptz' })
  serverTimestamp: Date;

  // true si l'écart local vs serveur dépasse MAX_CLOCK_DRIFT_HOURS (section 1).
  @Column({ default: false })
  clockTampered: boolean;

  // Signature Ed25519 de la transaction par la clé privée du device (section 3, Option B),
  // encodée base64. Vérifiée contre Device.publicKey à la synchro.
  @Column({ type: 'varchar', nullable: true })
  signature: string | null;

  // Hash-chaining (section 7).
  @Column()
  previousHash: string;

  @Column()
  hash: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.SYNCED })
  status: TransactionStatus;

  @Column({ type: 'varchar', nullable: true })
  cancelReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  cancelledBy: string | null; // userId du superviseur ayant validé l'annulation

  @CreateDateColumn()
  createdAt: Date;
}
