import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AdminAuditFacetsResponse, AdminAuditListResponse } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

export interface AdminAuditQuery {
  moduleName: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  action: string;
  batchId: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

export const ADMIN_AUDIT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  private readonly http = inject(HttpClient);

  listChanges(query: AdminAuditQuery) {
    const params = this.buildParams(query);
    return firstValueFrom(
      this.http.get<AdminAuditListResponse>('/api/admin/audit/changes', {
        params,
      })
    );
  }

  getFacets() {
    return firstValueFrom(
      this.http.get<AdminAuditFacetsResponse>('/api/admin/audit/facets')
    );
  }

  private buildParams(query: AdminAuditQuery) {
    let params = new HttpParams()
      .set('page', String(query.page))
      .set('pageSize', String(query.pageSize));

    const scalarEntries: Array<[keyof Omit<AdminAuditQuery, 'page' | 'pageSize'>, string]> = [
      ['moduleName', query.moduleName],
      ['entityType', query.entityType],
      ['entityId', query.entityId],
      ['actorUserId', query.actorUserId],
      ['action', query.action],
      ['batchId', query.batchId],
      ['from', query.from],
      ['to', query.to],
    ];

    for (const [key, rawValue] of scalarEntries) {
      const value = String(rawValue ?? '').trim();
      if (!value) continue;
      params = params.set(key, value);
    }

    return params;
  }
}
