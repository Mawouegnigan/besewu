import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * synchronize est désactivé sans exception, y compris en développement.
 *
 * Décision volontaire (à la demande de la revue de sécurité) : sur un système qui
 * manipule de l'argent public, le schéma de base ne doit JAMAIS dépendre d'une
 * génération automatique et silencieuse — même en dev, pour que les développeurs
 * prennent l'habitude d'écrire et de relire des migrations, et pour que l'historique
 * du schéma soit lui-même auditable (voir README > Base de données).
 *
 * Workflow : `npm run migration:generate -- src/migrations/NomDeLaMigration`
 *            `npm run migration:run`
 */
export const getTypeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get('DB_HOST', 'localhost'),
  port: parseInt(config.get('DB_PORT', '5432'), 10),
  username: config.get('DB_USERNAME', 'besewu'),
  password: config.get('DB_PASSWORD', 'change_me'),
  database: config.get('DB_NAME', 'besewu'),
  autoLoadEntities: true,
  synchronize: false,
  migrations: [join(__dirname, '..', 'migrations', '*{.ts,.js}')],
  // migrationsRun: true appliquerait les migrations en attente au démarrage de l'app.
  // Laissé à false par défaut pour garder une étape explicite et auditée en production
  // (npm run migration:run exécuté séparément, avec ses propres logs et revue).
  migrationsRun: config.get('MIGRATIONS_RUN_ON_BOOT', 'false') === 'true',
  logging: config.get('NODE_ENV') === 'development',
});
