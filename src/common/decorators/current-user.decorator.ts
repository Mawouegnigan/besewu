import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrait l'utilisateur authentifié (injecté par JwtAuthGuard) de la requête.
 * Usage : findAll(@CurrentUser() user: AuthenticatedUser)
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: string;
  deviceId?: string; // Présent quand l'appelant est un device mobile (voir JwtStrategy)
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
