import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getTypeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get('DB_HOST', 'localhost'),
  port: parseInt(config.get('DB_PORT', '5432'), 10),
  username: config.get('DB_USERNAME', 'besewu'),
  password: config.get('DB_PASSWORD', 'change_me'),
  database: config.get('DB_NAME', 'besewu'),
  autoLoadEntities: true,
  // synchronize: uniquement en dev. En production, utiliser des migrations TypeORM
  // (`npm run typeorm migration:generate` / `migration:run`) — jamais de synchronize
  // sur une base contenant des transactions financières réelles.
  synchronize: config.get('NODE_ENV') !== 'production',
  logging: config.get('NODE_ENV') === 'development',
});
