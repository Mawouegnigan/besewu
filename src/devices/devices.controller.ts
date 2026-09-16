import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { DevicesService } from './devices.service';
import { BlockDeviceDto, EnrollDeviceDto } from './dto/enroll-device.dto';

@Controller('devices')
@UseGuards(RolesGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // Enrôlement : fait par un CHEF_EQUIPE ou la MAIRE lors de la remise du terminal à l'agent.
  @Post('enroll')
  @Roles(Role.CHEF_EQUIPE, Role.MAIRE)
  enroll(@Body() dto: EnrollDeviceDto) {
    return this.devicesService.enroll(dto.agentId, dto.publicKey);
  }

  // Blocage à distance réversible — section 3.2 cahier des charges original.
  @Patch(':id/block')
  @Roles(Role.MAIRE, Role.CHEF_EQUIPE)
  block(
    @Param('id') id: string,
    @Body() dto: BlockDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.block(id, dto.reason, user.userId);
  }

  // Révocation définitive de la clé de signature — MAIRE uniquement (section 3, Option B).
  @Patch(':id/revoke')
  @Roles(Role.MAIRE)
  revoke(
    @Param('id') id: string,
    @Body() dto: BlockDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.revoke(id, dto.reason, user.userId);
  }
}
