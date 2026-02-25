import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface AdminPeriodStore {
  adminPeriodId?: string;
}

@Injectable()
export class AdminPeriodContextService {
  private readonly storage = new AsyncLocalStorage<AdminPeriodStore>();

  run(adminPeriodId: string | null, callback: () => void) {
    const normalized = String(adminPeriodId ?? '').trim();
    this.storage.run(
      normalized ? { adminPeriodId: normalized } : {},
      callback
    );
  }

  getAdminPeriodId(): string | null {
    const value = String(this.storage.getStore()?.adminPeriodId ?? '').trim();
    return value || null;
  }
}

