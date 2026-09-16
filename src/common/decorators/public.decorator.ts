import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marque une route comme publique (pas de JWT requis).
 * Utilisé UNIQUEMENT pour l'endpoint de vérification de ticket par le contribuable
 * (section 3 et 4 de la revue critique — "vérification publique obligatoire").
 * Toute nouvelle route publique doit être justifiée explicitement en revue de code.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
