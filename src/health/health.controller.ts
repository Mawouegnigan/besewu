import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

/**
 * Endpoint de santé standard, public et sans authentification — utilisé par un
 * load balancer, un orchestrateur (Docker/Kubernetes) ou un simple `curl` de
 * vérification post-déploiement. Volontairement minimal : il ne renvoie aucune
 * donnée métier, seulement l'état de connexion à la base.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    const dbOk = this.dataSource.isInitialized;
    if (!dbOk) {
      throw new ServiceUnavailableException({ status: 'error', database: 'disconnected' });
    }

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }

    return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() };
  }
}
