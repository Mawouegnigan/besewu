import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashClosure } from './entities/cash-closure.entity';
import { Deposit, DepositStatus } from './entities/deposit.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus } from '../common/enums/transaction-status.enum';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ReconciliationService {
  private readonly thresholdFcfa: number;

  constructor(
    @InjectRepository(CashClosure)
    private readonly closuresRepo: Repository<CashClosure>,
    @InjectRepository(Deposit)
    private readonly depositsRepo: Repository<Deposit>,
    private readonly transactionsService: TransactionsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.thresholdFcfa = Number(this.configService.get('RECONCILIATION_THRESHOLD_FCFA', '1000'));
  }

  /**
   * Calcule et enregistre la clôture de caisse quotidienne d'un agent (section 6,
   * étape 1 du workflow). Le total est calculé côté serveur à partir des transactions
   * SYNCED réellement synchronisées — jamais une valeur déclarative de l'agent.
   */
  async createClosure(agentId: string, closureDate: string): Promise<CashClosure> {
    const dayStart = new Date(`${closureDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${closureDate}T23:59:59.999Z`);

    const txs = await this.transactionsService.findByAgent(agentId, dayStart, dayEnd);
    const theoreticalTotal = txs
      .filter((t) => t.status === TransactionStatus.SYNCED)
      .reduce((sum, t) => sum + t.amount, 0);

    const closure = this.closuresRepo.create({ agentId, closureDate, theoreticalTotal });
    return this.closuresRepo.save(closure);
  }

  /**
   * Saisie du dépôt physique par le RECEVEUR (section 6, étape 2) — séparation des
   * tâches imposée au niveau du contrôleur (@Roles(Role.RECEVEUR)), pas ici.
   */
  async createDeposit(
    closureId: string,
    receiverId: string,
    depositedAmount: number,
  ): Promise<Deposit> {
    const closure = await this.closuresRepo.findOne({ where: { id: closureId } });
    if (!closure) throw new NotFoundException('Clôture de caisse introuvable');

    const existing = await this.depositsRepo.findOne({ where: { closureId } });
    if (existing) {
      throw new BadRequestException('Un dépôt existe déjà pour cette clôture.');
    }

    const discrepancy = closure.theoreticalTotal - depositedAmount;
    const status =
      Math.abs(discrepancy) > this.thresholdFcfa ? DepositStatus.LITIGE : DepositStatus.OK;

    const deposit = this.depositsRepo.create({
      closureId,
      receiverId,
      depositedAmount,
      discrepancy,
      status,
    });
    await this.depositsRepo.save(deposit);

    await this.auditService.record({
      actorId: receiverId,
      action: status === DepositStatus.LITIGE ? 'DEPOSIT_DISPUTE_OPENED' : 'DEPOSIT_RECORDED',
      entityType: 'Deposit',
      entityId: deposit.id,
      metadata: { closureId, depositedAmount, discrepancy, threshold: this.thresholdFcfa },
    });

    return deposit;
  }

  /**
   * Résolution d'un litige (section 6, étape 3) — doit rester tracée : qui, quand,
   * pourquoi. Ne modifie jamais depositedAmount/discrepancy a posteriori.
   */
  async resolveDispute(depositId: string, resolverId: string, notes: string): Promise<Deposit> {
    const deposit = await this.depositsRepo.findOne({ where: { id: depositId } });
    if (!deposit) throw new NotFoundException('Dépôt introuvable');
    if (deposit.status !== DepositStatus.LITIGE) {
      throw new BadRequestException('Ce dépôt n’est pas en litige.');
    }

    deposit.status = DepositStatus.RESOLVED;
    deposit.disputeNotes = notes;
    deposit.resolvedBy = resolverId;
    deposit.resolvedAt = new Date();
    await this.depositsRepo.save(deposit);

    await this.auditService.record({
      actorId: resolverId,
      action: 'DEPOSIT_DISPUTE_RESOLVED',
      entityType: 'Deposit',
      entityId: deposit.id,
      metadata: { notes },
    });

    return deposit;
  }

  async findOpenDisputes(): Promise<Deposit[]> {
    return this.depositsRepo.find({
      where: { status: DepositStatus.LITIGE },
      order: { createdAt: 'ASC' },
    });
  }
}
