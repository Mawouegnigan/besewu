import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../audit/audit.service';

/**
 * Journalise automatiquement toute requête mutante (POST/PATCH/PUT/DELETE) réussie.
 * Complète les appels explicites à AuditService.record() faits dans les services pour
 * des événements métier plus précis (ex. DEVICE_REVOKE avec le motif) — les deux
 * mécanismes coexistent : celui-ci est le filet de sécurité générique.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, user, ip } = request;

    const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    return next.handle().pipe(
      tap(() => {
        if (!isMutating) return;
        void this.auditService.record({
          actorId: user?.userId ?? null,
          actorRole: user?.role ?? null,
          action: `HTTP_${method}`,
          entityType: null,
          entityId: null,
          metadata: { path: originalUrl },
          ipAddress: ip,
        });
      }),
    );
  }
}
