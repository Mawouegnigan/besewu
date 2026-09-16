import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Écrit une entrée d'audit. Ne jamais exposer de méthode update/delete sur ce service :
   * le journal doit rester append-only (voir commentaire sur l'entité AuditLog).
   */
  async record(entry: AuditEntry): Promise<void> {
    const log = this.auditRepo.create({
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  async findAll(filters: { actorId?: string; action?: string; entityType?: string }) {
    return this.auditRepo.find({
      where: filters,
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }
}
