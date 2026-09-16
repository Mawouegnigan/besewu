import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    username: string;
    role: string;
    deviceId: string;
  }): Promise<AuthenticatedUser> {
    // Le payload devient `request.user`. Toute vérification supplémentaire (ex. device
    // toujours actif) est faite au niveau des guards/services métier pour rester
    // rapide ici — cette méthode est appelée à chaque requête authentifiée.
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      deviceId: payload.deviceId,
    };
  }
}
