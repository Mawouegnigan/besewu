import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { DeviceStatus } from '../common/enums/device-status.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Connexion (section 2 de la revue critique) :
   *  1. Le PIN est vérifié contre un hash argon2id (jamais stocké en clair).
   *  2. Verrouillage progressif : 5 échecs → 5 min, 10 échecs → blocage dur nécessitant
   *     un déblocage par OTP envoyé au superviseur (endpoint dédié, hors squelette).
   *  3. UNIQUEMENT pour le rôle AGENT : un deviceId est requis, doit correspondre à un
   *     device ACTIVE, ET appartenir à cet agent précis (defense in depth — empêche
   *     un agent d'emprunter le device d'un autre agent même en connaissant son id).
   *     Les autres rôles (portail web) n'ont pas de notion de "device" ici.
   */
  async login(dto: LoginDto, ipAddress: string) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user || !user.active) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        'Compte temporairement verrouillé suite à plusieurs échecs. Réessayez plus tard ou contactez votre superviseur.',
      );
    }

    if (user.role === Role.AGENT) {
      await this.assertAgentDeviceUsable(user.id, dto.deviceId, ipAddress);
    }

    const pinValid = await argon2.verify(user.pinHash, dto.pin);
    if (!pinValid) {
      await this.usersService.incrementFailedAttempts(user);
      await this.auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILED',
        metadata: { deviceId: dto.deviceId ?? null },
        ipAddress,
      });
      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.usersService.resetFailedAttempts(user);
    if (user.role === Role.AGENT && dto.deviceId) {
      await this.devicesService.touchLastSync(dto.deviceId);
    }

    await this.auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'LOGIN_SUCCESS',
      metadata: { deviceId: dto.deviceId ?? null },
      ipAddress,
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      deviceId: user.role === Role.AGENT ? dto.deviceId : undefined,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  private async assertAgentDeviceUsable(
    agentId: string,
    deviceId: string | undefined,
    ipAddress: string,
  ): Promise<void> {
    if (!deviceId) {
      throw new ForbiddenException('Un device enrôlé est requis pour se connecter en tant qu’agent.');
    }

    const device = await this.devicesService.findById(deviceId);
    const belongsToAgent = !!device && device.agentId === agentId;
    const usable = belongsToAgent && device!.status === DeviceStatus.ACTIVE;

    if (!usable) {
      await this.auditService.record({
        actorId: agentId,
        action: 'LOGIN_REJECTED_DEVICE',
        metadata: { deviceId, found: !!device, belongsToAgent },
        ipAddress,
      });
      throw new ForbiddenException(
        'Ce terminal est bloqué, révoqué, ou n’appartient pas à cet agent. Contactez la mairie.',
      );
    }
  }

  static async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, { type: argon2.argon2id });
  }
}
