import { Injectable, NestMiddleware } from '@nestjs/common';
import { AdminPeriodContextService } from './admin-period-context.service';

@Injectable()
export class AdminPeriodContextMiddleware implements NestMiddleware {
  constructor(
    private readonly adminPeriodContext: AdminPeriodContextService
  ) {}

  use(
    req: { headers?: Record<string, string | string[] | undefined> },
    _res: unknown,
    next: () => void
  ) {
    const rawHeader = req.headers?.['x-admin-period-id'];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const periodId = String(headerValue ?? '').trim();
    this.adminPeriodContext.run(periodId || null, () => next());
  }
}
