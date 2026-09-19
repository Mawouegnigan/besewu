import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { ReconciliationService } from './reconciliation.service';
import { CreateClosureDto, CreateDepositDto, ResolveDisputeDto } from './dto/create-deposit.dto';

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
@UseGuards(RolesGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  // Déclenché en fin de journée côté agent (ou par un job planifié côté serveur).
  @Roles(Role.AGENT, Role.CHEF_EQUIPE)
  @Post('closures')
  createClosure(@Body() dto: CreateClosureDto) {
    return this.reconciliationService.createClosure(dto.agentId, dto.closureDate);
  }

  // Séparation des tâches : seul un RECEVEUR peut saisir un dépôt (section 6).
  @Roles(Role.RECEVEUR)
  @Post('deposits')
  createDeposit(@Body() dto: CreateDepositDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reconciliationService.createDeposit(dto.closureId, user.userId, dto.depositedAmount);
  }

  @Roles(Role.MAIRE, Role.RECEVEUR, Role.AUDITEUR)
  @Get('disputes')
  findOpenDisputes() {
    return this.reconciliationService.findOpenDisputes();
  }

  @Roles(Role.MAIRE)
  @Patch('disputes/:depositId/resolve')
  resolveDispute(
    @Param('depositId') depositId: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconciliationService.resolveDispute(depositId, user.userId, dto.notes);
  }
}
