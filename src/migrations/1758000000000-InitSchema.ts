import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schéma initial de Besewu, dérivé directement des entités TypeORM du squelette
 * backend (users, devices, transactions, cash_closures, deposits, audit_log).
 *
 * Écrite en SQL explicite plutôt que générée automatiquement : sur un système
 * financier, une migration lisible et relisable ligne à ligne en revue de code est
 * préférable à une génération opaque — cohérent avec la posture d'audit du projet.
 *
 * Prérequis : extension pgcrypto pour gen_random_uuid() (disponible nativement à
 * partir de PostgreSQL 13, sinon nécessite `CREATE EXTENSION pgcrypto`).
 */
export class InitSchema1758000000000 implements MigrationInterface {
  name = 'InitSchema1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // --- Enums ---
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('agent', 'chef_equipe', 'receveur', 'maire', 'auditeur')
    `);
    await queryRunner.query(`
      CREATE TYPE "devices_status_enum" AS ENUM ('active', 'blocked', 'revoked')
    `);
    await queryRunner.query(`
      CREATE TYPE "transactions_status_enum" AS ENUM ('synced', 'flagged', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "deposits_status_enum" AS ENUM ('ok', 'litige', 'resolved')
    `);

    // --- users ---
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "username" character varying NOT NULL,
        "pinHash" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMP WITH TIME ZONE,
        "fullName" character varying,
        "supervisorPhone" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // --- devices ---
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agentId" uuid NOT NULL,
        "publicKey" character varying NOT NULL,
        "status" "devices_status_enum" NOT NULL DEFAULT 'active',
        "blockedReason" character varying,
        "lastSyncAt" TIMESTAMP WITH TIME ZONE,
        "enrolledAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_devices_publicKey" UNIQUE ("publicKey"),
        CONSTRAINT "PK_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_devices_agent" FOREIGN KEY ("agentId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    // --- transactions ---
    // id = UUID généré côté mobile, jamais côté serveur (clé d'idempotence).
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL,
        "deviceId" uuid NOT NULL,
        "agentId" uuid NOT NULL,
        "amount" integer NOT NULL,
        "taxType" character varying NOT NULL,
        "marketOrSector" character varying,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "localTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "serverTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "clockTampered" boolean NOT NULL DEFAULT false,
        "signature" character varying,
        "previousHash" character varying NOT NULL,
        "hash" character varying NOT NULL,
        "status" "transactions_status_enum" NOT NULL DEFAULT 'synced',
        "cancelReason" character varying,
        "cancelledBy" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_transactions_agent" FOREIGN KEY ("agentId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_agentId" ON "transactions" ("agentId")`);

    // --- cash_closures ---
    await queryRunner.query(`
      CREATE TABLE "cash_closures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agentId" uuid NOT NULL,
        "closureDate" date NOT NULL,
        "theoreticalTotal" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_closures" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_closures_agent" FOREIGN KEY ("agentId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cash_closures_agent_date" ON "cash_closures" ("agentId", "closureDate")
    `);

    // --- deposits ---
    await queryRunner.query(`
      CREATE TABLE "deposits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "closureId" uuid NOT NULL,
        "receiverId" uuid NOT NULL,
        "depositedAmount" integer NOT NULL,
        "discrepancy" integer NOT NULL,
        "status" "deposits_status_enum" NOT NULL DEFAULT 'ok',
        "disputeNotes" character varying,
        "resolvedBy" character varying,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposits" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposits_closure" FOREIGN KEY ("closureId") REFERENCES "cash_closures"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_deposits_receiver" FOREIGN KEY ("receiverId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    // --- audit_log ---
    // Volontairement AUCUNE clé étrangère stricte sur actorId : le journal doit rester
    // écrivable même si l'acteur est supprimé/anonymisé par la suite (conformité APDP).
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actorId" character varying,
        "actorRole" character varying,
        "action" character varying NOT NULL,
        "entityType" character varying,
        "entityId" character varying,
        "metadata" jsonb,
        "ipAddress" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_actorId" ON "audit_log" ("actorId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_action" ON "audit_log" ("action")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_entityType" ON "audit_log" ("entityType")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_entityId" ON "audit_log" ("entityId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordre inverse strict pour respecter les contraintes de clé étrangère.
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TABLE "deposits"`);
    await queryRunner.query(`DROP TABLE "cash_closures"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "deposits_status_enum"`);
    await queryRunner.query(`DROP TYPE "transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "devices_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
