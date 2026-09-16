import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Connexion agent/superviseur (section 2 de la revue critique) :
   *  1. Le device appelant doit être ACTIVE (pas de login possible sur device
   *     bloqué/révoqué, même avec le bon PIN).
   *  2. Le PIN est vérifié contre un hash argon2id (jamais stocké en clair).
   *  3. Verrouillage progressif : 5 échecs → 5 min, 10 échecs → blocage dur nécessitant
   *     un déblocage par OTP envoyé au superviseur (endpoint dédié, hors squelette).
   */
  async login(dto: LoginDto, ipAddress: string) {
    const deviceUsable = await this.devicesService.isUsable(dto.deviceId);
    if (!deviceUsable) {
      await this.auditService.record({
        action: 'LOGIN_REJECTED_DEVICE',
        metadata: { deviceId: dto.deviceId },
        ipAddress,
      });
      throw new ForbiddenException('Ce terminal est bloqué ou révoqué. Contactez la mairie.');
    }

    const user = await this.usersService.findByUsername(dto.username);
    if (!user || !user.active) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        'Compte temporairement verrouillé suite à plusieurs échecs. Réessayez plus tard ou contactez votre superviseur.',
      );
    }

    const pinValid = await argon2.verify(user.pinHash, dto.pin);
    if (!pinValid) {
      await this.usersService.incrementFailedAttempts(user);
      await this.auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILED',
        metadata: { deviceId: dto.deviceId },
        ipAddress,
      });
      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.usersService.resetFailedAttempts(user);
    await this.devicesService.touchLastSync(dto.deviceId);

    await this.auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'LOGIN_SUCCESS',
      metadata: { deviceId: dto.deviceId },
      ipAddress,
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      deviceId: dto.deviceId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  static async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, { type: argon2.argon2id });
  }
}
