import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(RolesGuard)
@Roles(Role.MAIRE, Role.AUDITEUR)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.auditService.findAll({ actorId, action, entityType });
  }
}
