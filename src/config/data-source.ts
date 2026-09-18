import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';

loadEnv();

/**
 * DataSource dédié au CLI TypeORM (migration:generate / migration:run / migration:revert).
 * Séparé de la config NestJS (typeorm.config.ts) car le CLI s'exécute hors du contexte
 * Nest — voir les scripts "migration:*" dans package.json.
 *
 * Nécessite le package `dotenv` (ajouter à devDependencies si absent :
 * npm install --save-dev dotenv) pour charger le .env hors du bootstrap Nest.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'besewu',
  password: process.env.DB_PASSWORD || 'change_me',
  database: process.env.DB_NAME || 'besewu',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
