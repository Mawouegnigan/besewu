import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';

/**
 * Compte utilisateur (agent, chef d'équipe, receveur, maire, auditeur).
 *
 * Sécurité PIN (section 2 de la revue critique) :
 * - pinHash est un hash argon2id du PIN, jamais stocké en clair.
 * - Le PIN n'est PAS l'unique facteur en production : côté mobile, la dérivation de clé
 *   locale doit passer par Android Keystore / iOS Keychain (hors périmètre du backend,
 *   documenté ici pour mémoire).
 * - failedLoginAttempts / lockedUntil implémentent le verrouillage progressif
 *   (5 tentatives → 5 min, 10 tentatives → blocage nécessitant un OTP superviseur).
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  username: string;

  @Column()
  pinHash: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  supervisorPhone: string; // Pour l'envoi de l'OTP de déblocage après 10 tentatives échouées

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
