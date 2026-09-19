import * as Joi from 'joi';

/**
 * Validation stricte des variables d'environnement au démarrage.
 *
 * Sur un système financier, une variable manquante ou mal typée ne doit jamais
 * passer silencieusement (ex. JWT_SECRET vide, MAX_CLOCK_DRIFT_HOURS non numérique) :
 * l'application refuse de démarrer avec un message clair plutôt que d'échouer plus
 * tard, de façon confuse, au premier appel concerné.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET doit faire au moins 32 caractères (clé de signature des tokens).',
  }),
  JWT_EXPIRES_IN: Joi.string().default('8h'),

  MAX_CLOCK_DRIFT_HOURS: Joi.number().positive().default(48),
  MAX_OFFLINE_HOURS: Joi.number().positive().default(72),
  RECONCILIATION_THRESHOLD_FCFA: Joi.number().min(0).default(1000),

  MIGRATIONS_RUN_ON_BOOT: Joi.string().valid('true', 'false').default('false'),
});
