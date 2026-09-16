import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restreint un handler/contrôleur aux rôles listés.
 * Usage : @Roles(Role.MAIRE, Role.RECEVEUR)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
