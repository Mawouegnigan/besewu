import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { getTypeOrmConfig } from './config/typeorm.config';
import { envValidationSchema } from './config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      // abortEarly: false liste TOUTES les variables invalides d'un coup au démarrage,
      // plutôt que de s'arrêter à la première — plus rapide à corriger en une passe.
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // Anti-brute-force générique
    AuditModule,
    UsersModule,
    DevicesModule,
    AuthModule,
    TransactionsModule,
    ReconciliationModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // JwtAuthGuard global : toute route est protégée par défaut, sauf @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
