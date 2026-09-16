import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Rejette les champs non déclarés dans les DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors(); // À restreindre à des origines précises en production

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Besewu API démarrée sur le port ${port}`);
}

bootstrap();
