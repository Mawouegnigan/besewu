import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionStatus } from '../common/enums/transaction-status.enum';
import { DeviceStatus } from '../common/enums/device-status.enum';
import { DevicesService } from '../devices/devices.service';
import { AuditService } from '../audit/audit.service';
import { SyncTransactionItemDto } from './dto/sync-transaction.dto';
import { computeTransactionHash, GENESIS_HASH } from './utils/hash-chain.util';
import { buildSignedPayload, verifyTransactionSignature } from './utils/signature.util';

export interface SyncResultItem {
  id: string;
  outcome: 'accepted' | 'duplicate' | 'flagged' | 'rejected_signature' | 'rejected_device';
}

@Injectable()
export class TransactionsService {
  private readonly maxClockDriftHours: number;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
    private readonly devicesService: DevicesService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.maxClockDriftHours = Number(this.configService.get('MAX_CLOCK_DRIFT_HOURS', '48'));
  }

  /**
   * Synchronise un lot de transactions envoyées par un device.
   *
   * Ordre des contrôles (chacun peut rejeter/flagger, jamais silencieusement) :
   *  1. Le device doit être ACTIVE (pas BLOCKED ni REVOKED) — section 3.
   *  2. Idempotence : un id déjà en base = duplicate, no-op (section 5 cahier des charges
   *     original + section 1 de la revue critique).
   *  3. Signature Ed25519 vérifiée contre la clé publique du device — rejet si invalide.
   *  4. Dérive d'horloge : écart local vs serveur > seuil → accepté mais FLAGGED,
   *     jamais rejeté silencieusement (le paiement a bien eu lieu — section 1).
   *  5. Hash-chaining : chaque transaction acceptée référence le hash de la précédente
   *     du même agent (section 7).
   */
  async sync(deviceId: string, agentId: string, items: SyncTransactionItemDto[]): Promise<SyncResultItem[]> {
    const device = await this.devicesService.findById(deviceId);
    if (!device) throw new NotFoundException('Device introuvable');

    if (device.status !== DeviceStatus.ACTIVE) {
      await this.auditService.record({
        actorId: agentId,
        action: 'SYNC_REJECTED_DEVICE',
        entityType: 'Device',
        entityId: deviceId,
        metadata: { deviceStatus: device.status, itemCount: items.length },
      });
      // On rejette tout le lot : un device bloqué/révoqué ne doit produire aucune
      // transaction valide, même celles antérieures au blocage mais pas encore syncées.
      throw new ForbiddenException(
        `Ce terminal est ${device.status}. Aucune transaction ne peut être synchronisée.`,
      );
    }

    const results: SyncResultItem[] = [];
    const now = new Date();

    for (const item of items) {
      const existing = await this.transactionsRepo.findOne({ where: { id: item.id } });
      if (existing) {
        results.push({ id: item.id, outcome: 'duplicate' });
        continue;
      }

      const signatureValid = verifyTransactionSignature({
        publicKeyBase64: device.publicKey,
        signatureBase64: item.signature,
        payload: buildSignedPayload({
          id: item.id,
          deviceId,
          amount: item.amount,
          taxType: item.taxType,
          localTimestamp: item.localTimestamp,
        }),
      });

      if (!signatureValid) {
        await this.auditService.record({
          actorId: agentId,
          action: 'TRANSACTION_REJECTED_SIGNATURE',
          entityType: 'Transaction',
          entityId: item.id,
          metadata: { deviceId },
        });
        results.push({ id: item.id, outcome: 'rejected_signature' });
        continue;
      }

      const localTs = new Date(item.localTimestamp);
      const driftHours = Math.abs(now.getTime() - localTs.getTime()) / 36e5;
      const clockTampered = driftHours > this.maxClockDriftHours;

      const previousHash = await this.getLastHashForAgent(agentId);
      const hash = computeTransactionHash({
        id: item.id,
        deviceId,
        amount: item.amount,
        taxType: item.taxType,
        serverTimestamp: now.toISOString(),
        previousHash,
      });

      const transaction = this.transactionsRepo.create({
        id: item.id,
        deviceId,
        agentId,
        amount: item.amount,
        taxType: item.taxType,
        marketOrSector: item.marketOrSector ?? null,
        latitude: item.latitude,
        longitude: item.longitude,
        localTimestamp: localTs,
        serverTimestamp: now,
        clockTampered,
        signature: item.signature,
        previousHash,
        hash,
        status: clockTampered ? TransactionStatus.FLAGGED : TransactionStatus.SYNCED,
      });

      await this.transactionsRepo.save(transaction);

      if (clockTampered) {
        await this.auditService.record({
          actorId: agentId,
          action: 'TRANSACTION_FLAGGED_CLOCK_DRIFT',
          entityType: 'Transaction',
          entityId: item.id,
          metadata: { driftHours },
        });
      }

      results.push({ id: item.id, outcome: clockTampered ? 'flagged' : 'accepted' });
    }

    await this.devicesService.touchLastSync(deviceId);

    return results;
  }

  /**
   * Vérification publique d'un ticket (section 3 et 4 de la revue critique —
   * "vérification publique obligatoire"). Endpoint sans authentification, exposé
   * pour un contrôleur ou un contribuable via QR/USSD. Ne renvoie QUE le strict
   * nécessaire, jamais de données personnelles sur l'agent.
   */
  async verifyPublicly(id: string) {
    const tx = await this.transactionsRepo.findOne({ where: { id } });
    if (!tx) {
      return { found: false };
    }
    return {
      found: true,
      status: tx.status,
      amount: tx.amount,
      taxType: tx.taxType,
      serverTimestamp: tx.serverTimestamp,
    };
  }

  /**
   * Annulation : jamais une suppression. Le ticket reste visible avec son statut et
   * son motif (section 4 — "numérotation séquentielle stricte, sans trou possible").
   */
  async cancel(id: string, reason: string, supervisorId: string): Promise<Transaction> {
    const tx = await this.transactionsRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction introuvable');
    if (tx.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException('Transaction déjà annulée');
    }

    tx.status = TransactionStatus.CANCELLED;
    tx.cancelReason = reason;
    tx.cancelledBy = supervisorId;
    await this.transactionsRepo.save(tx);

    await this.auditService.record({
      actorId: supervisorId,
      action: 'TRANSACTION_CANCELLED',
      entityType: 'Transaction',
      entityId: id,
      metadata: { reason },
    });

    return tx;
  }

  async findByAgent(agentId: string, from?: Date, to?: Date) {
    const qb = this.transactionsRepo
      .createQueryBuilder('t')
      .where('t.agentId = :agentId', { agentId });
    if (from) qb.andWhere('t.serverTimestamp >= :from', { from });
    if (to) qb.andWhere('t.serverTimestamp <= :to', { to });
    return qb.orderBy('t.serverTimestamp', 'ASC').getMany();
  }

  /**
   * Vérifie l'intégrité de la chaîne de hash d'un agent — à exposer plus tard via un
   * job planifié ou un endpoint AUDITEUR, pas dans le chemin critique de la sync.
   */
  async verifyChainIntegrity(agentId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const txs = await this.findByAgent(agentId);
    let expectedPrevious = GENESIS_HASH;

    for (const tx of txs) {
      if (tx.previousHash !== expectedPrevious) {
        return { valid: false, brokenAt: tx.id };
      }
      const recomputed = computeTransactionHash({
        id: tx.id,
        deviceId: tx.deviceId,
        amount: tx.amount,
        taxType: tx.taxType,
        serverTimestamp: tx.serverTimestamp.toISOString(),
        previousHash: tx.previousHash,
      });
      if (recomputed !== tx.hash) {
        return { valid: false, brokenAt: tx.id };
      }
      expectedPrevious = tx.hash;
    }

    return { valid: true };
  }

  private async getLastHashForAgent(agentId: string): Promise<string> {
    const last = await this.transactionsRepo.findOne({
      where: { agentId },
      order: { serverTimestamp: 'DESC' },
    });
    return last?.hash ?? GENESIS_HASH;
  }
}
