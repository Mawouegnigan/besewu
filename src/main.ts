import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // En-têtes de sécurité HTTP de base (CSP, HSTS, X-Frame-Options, etc.) — attendu
  // par défaut sur toute API exposée publiquement, a fortiori financière.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Rejette les champs non déclarés dans les DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors(); // À restreindre à des origines précises en production

  // Documentation OpenAPI, exposée sur /docs. Ne documente pas les corps de requête
  // en détail (DTOs sans @ApiProperty pour l'instant) mais liste déjà toutes les
  // routes, méthodes et rôles requis — suffisant pour qu'un tiers explore l'API
  // sans lire le code. À enrichir progressivement avec des décorateurs @ApiProperty.
  const isProd = config.get('NODE_ENV') === 'production';
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Besewu API')
      .setDescription(
        'API de collecte mobile des taxes municipales (Bénin). ' +
          'Authentification par JWT (voir POST /auth/login) — utiliser le bouton ' +
          '"Authorize" avec le token obtenu (sans le préfixe "Bearer ").',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Besewu API démarrée sur le port ${port}`);
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.log(`Documentation Swagger disponible sur http://localhost:${port}/docs`);
  }
}

bootstrap();
