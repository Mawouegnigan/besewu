import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { TransactionsService } from './transactions.service';
import { CancelTransactionDto, SyncTransactionsDto } from './dto/sync-transaction.dto';

@Controller('transactions')
@UseGuards(RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Appelé par l'app mobile de l'agent — tout rôle authentifié avec un deviceId valide.
  @Roles(Role.AGENT)
  @Patch('sync')
  sync(@Body() dto: SyncTransactionsDto, @CurrentUser() user: AuthenticatedUser) {
    if (!user.deviceId) {
      throw new Error('Token sans deviceId — la synchro doit provenir d’un device enrôlé.');
    }
    return this.transactionsService.sync(user.deviceId, user.userId, dto.transactions);
  }

  // Vérification publique d'un ticket — section 3/4 de la revue critique. Pas d'auth.
  @Public()
  @Get('verify/:id')
  verify(@Param('id') id: string) {
    return this.transactionsService.verifyPublicly(id);
  }

  @Roles(Role.CHEF_EQUIPE, Role.MAIRE, Role.AUDITEUR)
  @Get('by-agent/:agentId')
  findByAgent(
    @Param('agentId') agentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.transactionsService.findByAgent(
      agentId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Roles(Role.CHEF_EQUIPE, Role.MAIRE)
  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transactionsService.cancel(id, dto.reason, user.userId);
  }

  @Roles(Role.MAIRE, Role.AUDITEUR)
  @Get('by-agent/:agentId/chain-integrity')
  verifyChain(@Param('agentId') agentId: string) {
    return this.transactionsService.verifyChainIntegrity(agentId);
  }
}
