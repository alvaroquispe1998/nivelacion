import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

export interface AuditActor {
  userId?: string | null;
  fullName?: string | null;
  role?: string | null;
}

export interface AuditChangeItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface RecordChangeParams {
  moduleName: string;
  entityType: string;
  entityId: string | null;
  entityLabel?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_UPDATE' | 'REASSIGN' | 'APPLY' | 'REPLACE';
  actor?: AuditActor | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  batchId?: string | null;
}

interface ListAuditChangesParams {
  moduleName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorUserId?: string | null;
  action?: string | null;
  batchId?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

interface AuditListQueryContext {
  conditions: string[];
  values: Array<string | number>;
}

interface AuditActorFacetResponse {
  userId: string;
  name: string;
  role: string | null;
}

interface AuditChangeResponse {
  id: string;
  moduleName: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  action: string;
  batchId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  changes: AuditChangeItem[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditListResponse {
  items: AuditChangeResponse[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface AuditFacetsResponse {
  modules: string[];
  entityTypes: string[];
  actions: string[];
  actors: AuditActorFacetResponse[];
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly dataSource: DataSource) {}

  async recordChange(params: RecordChangeParams) {
    try {
      const before = this.normalizeObject(params.before ?? null);
      const after = this.normalizeObject(params.after ?? null);
      const changes = this.buildChanges(before, after);
      const isPureUpdate =
        (params.action === 'UPDATE' || params.action === 'REPLACE') &&
        changes.length <= 0;
      if (isPureUpdate) {
        return;
      }

      await this.dataSource.query(
        `
        INSERT INTO admin_change_audit (
          id,
          moduleName,
          entityType,
          entityId,
          entityLabel,
          action,
          batchId,
          actorUserId,
          actorName,
          actorRole,
          changesJson,
          beforeJson,
          afterJson,
          metadataJson,
          createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
        `,
        [
          randomUUID(),
          this.normalizeText(params.moduleName) || 'GENERAL',
          this.normalizeText(params.entityType) || 'UNKNOWN',
          this.normalizeText(params.entityId) || null,
          this.normalizeText(params.entityLabel) || null,
          this.normalizeText(params.action) || 'UPDATE',
          this.normalizeText(params.batchId) || null,
          this.normalizeText(params.actor?.userId) || null,
          this.normalizeText(params.actor?.fullName) || null,
          this.normalizeText(params.actor?.role) || null,
          JSON.stringify(changes),
          JSON.stringify(before),
          JSON.stringify(after),
          JSON.stringify(this.normalizeObject(params.metadata ?? null)),
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      this.logger.warn(`[recordChange] No se pudo guardar auditoria: ${message}`);
    }
  }

  async listChanges(params: ListAuditChangesParams): Promise<AuditListResponse> {
    const { conditions, values } = this.buildListQueryContext(params);
    const page = Math.max(1, Math.floor(Number(params.page ?? 1) || 1));
    const pageSize = Math.max(
      1,
      Math.min(100, Math.floor(Number(params.pageSize ?? 50) || 50))
    );
    const offset = (page - 1) * pageSize;

    const totalRows: Array<{ total: number | string }> = await this.dataSource.query(
      `
      SELECT COUNT(*) AS total
      FROM admin_change_audit
      ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
      `,
      values
    );
    const total = Number(totalRows[0]?.total ?? 0);

    const rows: Array<{
      id: string;
      moduleName: string;
      entityType: string;
      entityId: string | null;
      entityLabel: string | null;
      action: string;
      batchId: string | null;
      actorUserId: string | null;
      actorName: string | null;
      actorRole: string | null;
      changesJson: string | null;
      beforeJson: string | null;
      afterJson: string | null;
      metadataJson: string | null;
      createdAt: Date | string;
    }> = await this.dataSource.query(
      `
      SELECT
        id,
        moduleName,
        entityType,
        entityId,
        entityLabel,
        action,
        batchId,
        actorUserId,
        actorName,
        actorRole,
        changesJson,
        beforeJson,
        afterJson,
        metadataJson,
        createdAt
      FROM admin_change_audit
      ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY createdAt DESC, id DESC
      LIMIT ?
      OFFSET ?
      `,
      [...values, pageSize, offset]
    );

    const items = rows.map((row) => this.mapRow(row));
    return {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  async getFacets(): Promise<AuditFacetsResponse> {
    const [moduleRows, entityTypeRows, actionRows, actorRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT DISTINCT moduleName
        FROM admin_change_audit
        WHERE moduleName IS NOT NULL
          AND TRIM(moduleName) <> ''
        ORDER BY moduleName ASC
        `
      ),
      this.dataSource.query(
        `
        SELECT DISTINCT entityType
        FROM admin_change_audit
        WHERE entityType IS NOT NULL
          AND TRIM(entityType) <> ''
        ORDER BY entityType ASC
        `
      ),
      this.dataSource.query(
        `
        SELECT DISTINCT action
        FROM admin_change_audit
        WHERE action IS NOT NULL
          AND TRIM(action) <> ''
        ORDER BY action ASC
        `
      ),
      this.dataSource.query(
        `
        SELECT actorUserId, MAX(actorName) AS actorName, MAX(actorRole) AS actorRole
        FROM admin_change_audit
        WHERE actorUserId IS NOT NULL
          AND TRIM(actorUserId) <> ''
        GROUP BY actorUserId
        ORDER BY
          COALESCE(NULLIF(MAX(actorName), ''), actorUserId) ASC,
          actorUserId ASC
        `
      ),
    ]);

    const actors: AuditActorFacetResponse[] = actorRows.map(
      (row: { actorUserId: string; actorName: string | null; actorRole: string | null }) => ({
        userId: String(row.actorUserId ?? ''),
        name: String(row.actorName ?? '').trim() || String(row.actorUserId ?? ''),
        role: this.normalizeText(row.actorRole) || null,
      })
    );

    return {
      modules: moduleRows
        .map((row: { moduleName: string }) => this.normalizeText(row.moduleName))
        .filter((value: string) => value.length > 0),
      entityTypes: entityTypeRows
        .map((row: { entityType: string }) => this.normalizeText(row.entityType))
        .filter((value: string) => value.length > 0),
      actions: actionRows
        .map((row: { action: string }) => this.normalizeText(row.action))
        .filter((value: string) => value.length > 0),
      actors,
    };
  }

  private buildListQueryContext(params: ListAuditChangesParams): AuditListQueryContext {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    const moduleName = this.normalizeText(params.moduleName);
    if (moduleName) {
      conditions.push('moduleName = ?');
      values.push(moduleName);
    }

    const entityType = this.normalizeText(params.entityType);
    if (entityType) {
      conditions.push('entityType = ?');
      values.push(entityType);
    }

    const entityId = this.normalizeText(params.entityId);
    if (entityId) {
      conditions.push('entityId = ?');
      values.push(entityId);
    }

    const actorUserId = this.normalizeText(params.actorUserId);
    if (actorUserId) {
      conditions.push('actorUserId = ?');
      values.push(actorUserId);
    }

    const action = this.normalizeText(params.action);
    if (action) {
      conditions.push('action = ?');
      values.push(action);
    }

    const batchId = this.normalizeText(params.batchId);
    if (batchId) {
      conditions.push('batchId = ?');
      values.push(batchId);
    }

    const from = this.normalizeText(params.from);
    if (from) {
      conditions.push('createdAt >= ?');
      values.push(from.length <= 10 ? `${from} 00:00:00` : from);
    }

    const to = this.normalizeText(params.to);
    if (to) {
      conditions.push('createdAt <= ?');
      values.push(to.length <= 10 ? `${to} 23:59:59` : to);
    }

    return { conditions, values };
  }

  private mapRow(row: {
    id: string;
    moduleName: string;
    entityType: string;
    entityId: string | null;
    entityLabel: string | null;
    action: string;
    batchId: string | null;
    actorUserId: string | null;
    actorName: string | null;
    actorRole: string | null;
    changesJson: string | null;
    beforeJson: string | null;
    afterJson: string | null;
    metadataJson: string | null;
    createdAt: Date | string;
  }): AuditChangeResponse {
    return {
      id: String(row.id),
      moduleName: String(row.moduleName ?? ''),
      entityType: String(row.entityType ?? ''),
      entityId: row.entityId ? String(row.entityId) : null,
      entityLabel: row.entityLabel ? String(row.entityLabel) : null,
      action: String(row.action ?? ''),
      batchId: row.batchId ? String(row.batchId) : null,
      actorUserId: row.actorUserId ? String(row.actorUserId) : null,
      actorName: row.actorName ? String(row.actorName) : null,
      actorRole: row.actorRole ? String(row.actorRole) : null,
      changes: this.parseJsonArray(row.changesJson),
      before: this.parseJsonObject(row.beforeJson),
      after: this.parseJsonObject(row.afterJson),
      metadata: this.parseJsonObject(row.metadataJson),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? ''),
    };
  }

  private buildChanges(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
  ): AuditChangeItem[] {
    const keys = Array.from(
      new Set([
        ...Object.keys(before ?? {}),
        ...Object.keys(after ?? {}),
      ])
    ).sort((a, b) => a.localeCompare(b));

    const items: Array<AuditChangeItem | null> = keys.map((field) => {
        const oldValue = before ? before[field] : null;
        const newValue = after ? after[field] : null;
        if (this.valuesEqual(oldValue, newValue)) {
          return null;
        }
        return {
          field,
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
        } satisfies AuditChangeItem;
      });
    return items.filter((item): item is AuditChangeItem => item !== null);
  }

  private valuesEqual(a: unknown, b: unknown) {
    return JSON.stringify(this.sortValue(a)) === JSON.stringify(this.sortValue(b));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce<Record<string, unknown>>((acc, [key, innerValue]) => {
          acc[key] = this.sortValue(innerValue);
          return acc;
        }, {});
    }
    return value ?? null;
  }

  private normalizeObject(value: Record<string, unknown> | null) {
    if (!value) return null;
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, innerValue]) => {
      if (innerValue === undefined) {
        return acc;
      }
      acc[key] = innerValue ?? null;
      return acc;
    }, {});
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').trim();
  }

  private parseJsonArray(value: string | null) {
    try {
      const parsed = JSON.parse(String(value ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseJsonObject(value: string | null) {
    try {
      const parsed = JSON.parse(String(value ?? 'null'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
