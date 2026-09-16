import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { DeviceStatus } from '../common/enums/device-status.enum';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    private readonly auditService: AuditService,
  ) {}

  async enroll(agentId: string, publicKey: string): Promise<Device> {
    const existing = await this.devicesRepo.findOne({ where: { publicKey } });
    if (existing) {
      throw new BadRequestException('Cette clé publique est déjà enrôlée sur un device.');
    }
    const device = this.devicesRepo.create({ agentId, publicKey, status: DeviceStatus.ACTIVE });
    return this.devicesRepo.save(device);
  }

  findById(id: string): Promise<Device | null> {
    return this.devicesRepo.findOne({ where: { id } });
  }

  findByPublicKey(publicKey: string): Promise<Device | null> {
    return this.devicesRepo.findOne({ where: { publicKey } });
  }

  /**
   * Blocage réversible (perte/vol suspecté) — section 3.2 du cahier des charges original,
   * renforcé section 2 de la revue critique.
   */
  async block(id: string, reason: string, actorId: string): Promise<Device> {
    const device = await this.getOrThrow(id);
    device.status = DeviceStatus.BLOCKED;
    device.blockedReason = reason;
    await this.devicesRepo.save(device);

    await this.auditService.record({
      actorId,
      action: 'DEVICE_BLOCK',
      entityType: 'Device',
      entityId: id,
      metadata: { reason },
    });

    return device;
  }

  /**
   * Révocation définitive de la clé — section 3, Option B. Irréversible : un nouveau
   * device (nouvelle paire de clés) doit être enrôlé pour cet agent.
   */
  async revoke(id: string, reason: string, actorId: string): Promise<Device> {
    const device = await this.getOrThrow(id);
    device.status = DeviceStatus.REVOKED;
    device.blockedReason = reason;
    await this.devicesRepo.save(device);

    await this.auditService.record({
      actorId,
      action: 'DEVICE_REVOKE',
      entityType: 'Device',
      entityId: id,
      metadata: { reason },
    });

    return device;
  }

  async touchLastSync(id: string): Promise<void> {
    await this.devicesRepo.update(id, { lastSyncAt: new Date() });
  }

  async isUsable(id: string): Promise<boolean> {
    const device = await this.findById(id);
    return !!device && device.status === DeviceStatus.ACTIVE;
  }

  private async getOrThrow(id: string): Promise<Device> {
    const device = await this.findById(id);
    if (!device) throw new NotFoundException('Device introuvable');
    return device;
  }
}
