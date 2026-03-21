import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import type {
  AdminAuditActorFacet,
  AdminAuditChange,
  AdminAuditFacetsResponse,
} from '@uai/shared';
import { Subscription } from 'rxjs';
import {
  ADMIN_AUDIT_DEFAULT_PAGE_SIZE,
  ADMIN_AUDIT_PAGE_SIZE_OPTIONS,
  AdminAuditQuery,
  AdminAuditService,
} from './admin-audit.service';

interface AuditFilters {
  moduleName: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  action: string;
  batchId: string;
  from: string;
  to: string;
}

interface AuditChangeView extends AdminAuditChange {
  moduleLabel: string;
  entityTypeLabel: string;
  entityDisplayLabel: string;
  actionLabel: string;
  actorDisplayLabel: string;
  actorRoleLabel: string | null;
  summaryLines: string[];
}

const EMPTY_FACETS: AdminAuditFacetsResponse = {
  modules: [],
  entityTypes: [],
  actions: [],
  actors: [],
};

const MODULE_LABELS: Record<string, string> = {
  ATTENDANCE: 'Asistencia',
  CLASSROOMS: 'Aulas',
  GRADES: 'Notas',
  PERIODS: 'Periodos',
  SCHEDULES: 'Horarios',
  SECTIONS: 'Secciones',
  TEACHERS: 'Docentes',
  USERS: 'Usuarios',
  WORKSHOPS: 'Talleres',
};

const ENTITY_LABELS: Record<string, string> = {
  ATTENDANCE_RECORDS: 'Registros de asistencia',
  ATTENDANCE_SESSION: 'Sesion de asistencia',
  CLASSROOM: 'Aula',
  CLASSROOM_STATUS: 'Estado de aula',
  GRADE_SCHEME: 'Configuracion de notas',
  INTERNAL_USER: 'Usuario interno',
  INTERNAL_USER_STATUS: 'Estado de usuario interno',
  PAVILION: 'Pabellon',
  PAVILION_STATUS: 'Estado de pabellon',
  PERIOD: 'Periodo',
  PERIOD_DATA: 'Datos de periodo',
  PERIOD_STATUS: 'Estado de periodo',
  SECTION_COURSE_CAPACITY: 'Aforo de seccion-curso',
  SECTION_COURSE_CLASSROOM: 'Aula de seccion-curso',
  SECTION_COURSE_GRADES: 'Notas de seccion-curso',
  SECTION_COURSE_GRADES_PUBLICATION: 'Publicacion de notas',
  SECTION_COURSE_SCHEDULE: 'Horario de seccion-curso',
  SECTION_COURSE_TEACHER: 'Docente de seccion-curso',
  SECTION_SCHEDULE_BLOCK: 'Bloque horario',
  SECTION_STUDENT_REASSIGNMENT: 'Cambio de seccion',
  TEACHER: 'Docente',
  USER_PASSWORD_RESET: 'Reseteo de password',
  WORKSHOP: 'Taller',
  WORKSHOP_APPLICATION: 'Aplicacion de taller',
  WORKSHOP_GROUP_SCHEDULE: 'Horario de grupo de taller',
  WORKSHOP_GROUP_SCHEDULE_MEETING: 'Vinculo Zoom de grupo',
  WORKSHOP_GROUPS: 'Grupos de taller',
};

const ACTION_LABELS: Record<string, string> = {
  APPLY: 'Aplicacion',
  BULK_UPDATE: 'Actualizacion masiva',
  CREATE: 'Creacion',
  DELETE: 'Eliminacion',
  REASSIGN: 'Reasignacion',
  REPLACE: 'Reemplazo',
  UPDATE: 'Actualizacion',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ADMINISTRATIVO: 'Administrativo',
  ALUMNO: 'Alumno',
  DOCENTE: 'Docente',
  SOPORTE_TECNICO: 'Soporte tecnico',
};

const FIELD_LABELS: Record<string, string> = {
  actorRole: 'Rol del actor',
  batchId: 'Lote',
  blocks: 'Bloques',
  capacity: 'Capacidad',
  classroomCode: 'Codigo de aula',
  classroomId: 'Aula',
  classroomName: 'Nombre de aula',
  code: 'Codigo',
  courseName: 'Curso',
  createdAt: 'Fecha de creacion',
  dayOfWeek: 'Dia',
  dni: 'DNI',
  email: 'Correo',
  endDate: 'Fecha fin',
  endTime: 'Hora fin',
  facultyGroup: 'Facultad',
  facultyName: 'Nombre de facultad',
  fullName: 'Nombre completo',
  id: 'ID',
  initialCapacity: 'Aforo base',
  isActive: 'Estado',
  joinUrl: 'Enlace de ingreso',
  location: 'Ubicacion',
  maxExtraCapacity: 'Aforo extra',
  modality: 'Modalidad',
  name: 'Nombre',
  notes: 'Notas',
  reason: 'Motivo',
  referenceClassroom: 'Aula referencial',
  referenceModality: 'Modalidad referencial',
  role: 'Rol',
  sectionCode: 'Codigo de seccion',
  sectionName: 'Seccion',
  startDate: 'Fecha inicio',
  startTime: 'Hora inicio',
  startUrl: 'Enlace anfitrion',
  status: 'Estado',
  targetDni: 'DNI objetivo',
  targetRole: 'Rol objetivo',
  targetUserId: 'Usuario objetivo',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-audit.page.html',
})
export class AdminAuditPage implements OnInit, OnDestroy {
  private readonly auditService = inject(AdminAuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly resizeHandler = () => this.checkViewport();

  private routeSub?: Subscription;

  readonly pageSizeOptions = [...ADMIN_AUDIT_PAGE_SIZE_OPTIONS];

  facets: AdminAuditFacetsResponse = { ...EMPTY_FACETS };
  items: AuditChangeView[] = [];
  selectedChange: AuditChangeView | null = null;
  appliedFilters = this.createEmptyFilters();
  draftFilters = this.createEmptyFilters();
  page = 1;
  pageSize = ADMIN_AUDIT_DEFAULT_PAGE_SIZE;
  total = 0;
  loading = false;
  loadingFacets = false;
  error: string | null = null;
  advancedOpen = false;
  isMobile = false;

  ngOnInit() {
    this.checkViewport();
    window.addEventListener('resize', this.resizeHandler);
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      this.appliedFilters = this.filtersFromQueryParams(params);
      this.draftFilters = { ...this.appliedFilters };
      this.page = this.normalizePage(params.get('page'));
      this.pageSize = this.normalizePageSize(params.get('pageSize'));
      if (this.hasAdvancedFilters(this.appliedFilters)) {
        this.advancedOpen = true;
      }
      void this.loadFacets();
      void this.loadChanges();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    window.removeEventListener('resize', this.resizeHandler);
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  moduleLabel(value: string) {
    return MODULE_LABELS[value] ?? this.humanizeConstant(value);
  }

  entityLabel(value: string) {
    return ENTITY_LABELS[value] ?? this.humanizeConstant(value);
  }

  actionLabel(value: string) {
    return ACTION_LABELS[value] ?? this.humanizeConstant(value);
  }

  actorOptionLabel(actor: AdminAuditActorFacet) {
    const role = this.roleLabel(actor.role);
    return role ? `${actor.name} (${role})` : actor.name;
  }

  toggleAdvancedFilters() {
    this.advancedOpen = !this.advancedOpen;
  }

  async applyFilters() {
    const filtersChanged = !this.areFiltersEqual(this.draftFilters, this.appliedFilters);
    const nextPage = filtersChanged ? 1 : this.page;
    await this.navigateToQuery(this.queryFromState(this.draftFilters, nextPage, this.pageSize));
  }

  async clearFilters() {
    this.draftFilters = this.createEmptyFilters();
    this.advancedOpen = false;
    await this.navigateToQuery(
      this.queryFromState(this.createEmptyFilters(), 1, ADMIN_AUDIT_DEFAULT_PAGE_SIZE)
    );
  }

  async refreshCurrent() {
    this.error = null;
    await Promise.all([this.loadFacets(), this.loadChanges()]);
  }

  async changePageSize(nextPageSize: number) {
    await this.navigateToQuery(
      this.queryFromState(this.draftFilters, 1, this.normalizePageSize(nextPageSize))
    );
  }

  async goToPage(nextPage: number) {
    const normalizedPage = Math.min(this.totalPages, Math.max(1, nextPage));
    await this.navigateToQuery(
      this.queryFromState(this.draftFilters, normalizedPage, this.pageSize)
    );
  }

  openChange(change: AuditChangeView) {
    this.selectedChange = change;
  }

  closeDetail() {
    this.selectedChange = null;
  }

  async applyBatchFilter(batchId: string) {
    this.advancedOpen = true;
    this.draftFilters = {
      ...this.draftFilters,
      batchId: String(batchId ?? '').trim(),
    };
    await this.applyFilters();
  }

  visiblePages() {
    const totalPages = this.totalPages;
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    if (this.page <= 3) {
      return [1, 2, 3, 4, totalPages];
    }
    if (this.page >= totalPages - 2) {
      return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, this.page - 1, this.page, this.page + 1, totalPages];
  }

  hasNextPage() {
    return this.page < this.totalPages;
  }

  hasAnyFilters() {
    return Object.values(this.draftFilters).some((value) => String(value ?? '').trim().length > 0);
  }

  metadataSummary(change: AuditChangeView) {
    const entries = this.metadataEntries(change.metadata);
    if (entries.length <= 0) {
      return ['Sin metadata relevante disponible.'];
    }
    return entries.slice(0, 4).map(({ key, value }) => `${this.fieldLabel(key)}: ${value}`);
  }

  fieldLabel(field: string) {
    return FIELD_LABELS[field] ?? this.humanizeField(field);
  }

  actionBadgeClass(action: string) {
    switch (String(action ?? '').trim().toUpperCase()) {
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-700';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-700';
      case 'DELETE':
        return 'bg-rose-100 text-rose-700';
      case 'BULK_UPDATE':
        return 'bg-amber-100 text-amber-700';
      case 'REASSIGN':
        return 'bg-sky-100 text-sky-700';
      case 'APPLY':
        return 'bg-emerald-100 text-emerald-700';
      case 'REPLACE':
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  formatDate(value: string) {
    const date = this.toDate(value);
    return date ? DATE_FORMATTER.format(date) : '-';
  }

  formatTime(value: string) {
    const date = this.toDate(value);
    return date ? TIME_FORMATTER.format(date) : '-';
  }

  formatValue(value: unknown, field?: string) {
    const normalizedField = String(field ?? '').trim();
    if (normalizedField === 'dayOfWeek') {
      const numeric = Number(value ?? 0);
      return (
        {
          1: 'Lunes',
          2: 'Martes',
          3: 'Miercoles',
          4: 'Jueves',
          5: 'Viernes',
          6: 'Sabado',
          7: 'Domingo',
        }[numeric] ?? this.stringifyScalar(value)
      );
    }

    if (
      normalizedField === 'role' ||
      normalizedField === 'targetRole' ||
      normalizedField === 'actorRole'
    ) {
      return this.roleLabel(value) ?? this.stringifyScalar(value);
    }

    if (normalizedField === 'isActive') {
      if (value === true) return 'Activo';
      if (value === false) return 'Inactivo';
    }

    if (value === null || value === undefined || value === '') {
      return 'Sin valor';
    }
    if (typeof value === 'boolean') {
      return value ? 'Si' : 'No';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      return value;
    }
    return this.prettyJson(value);
  }

  prettyJson(value: unknown) {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value ?? 'null');
    }
  }

  shortId(value: string) {
    const normalized = String(value ?? '').trim();
    if (normalized.length <= 12) return normalized;
    return `${normalized.slice(0, 8)}...`;
  }

  trackChange(_: number, change: AuditChangeView) {
    return change.id;
  }

  private createEmptyFilters(): AuditFilters {
    return {
      moduleName: '',
      entityType: '',
      entityId: '',
      actorUserId: '',
      action: '',
      batchId: '',
      from: '',
      to: '',
    };
  }

  private queryFromState(
    filters: AuditFilters,
    page: number,
    pageSize: number
  ): AdminAuditQuery {
    return {
      ...filters,
      page,
      pageSize,
    };
  }

  private currentQuery(): AdminAuditQuery {
    return this.queryFromState(this.appliedFilters, this.page, this.pageSize);
  }

  private filtersFromQueryParams(params: ParamMap): AuditFilters {
    return {
      moduleName: String(params.get('moduleName') ?? '').trim(),
      entityType: String(params.get('entityType') ?? '').trim(),
      entityId: String(params.get('entityId') ?? '').trim(),
      actorUserId: String(params.get('actorUserId') ?? '').trim(),
      action: String(params.get('action') ?? '').trim(),
      batchId: String(params.get('batchId') ?? '').trim(),
      from: String(params.get('from') ?? '').trim(),
      to: String(params.get('to') ?? '').trim(),
    };
  }

  private async navigateToQuery(query: AdminAuditQuery) {
    const normalized = this.normalizeQuery(query);
    if (this.serializeQuery(normalized) === this.serializeQuery(this.currentQuery())) {
      await Promise.all([this.loadFacets(), this.loadChanges()]);
      return;
    }

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.toQueryParams(normalized),
      replaceUrl: true,
    });
  }

  private normalizeQuery(query: AdminAuditQuery): AdminAuditQuery {
    return {
      moduleName: String(query.moduleName ?? '').trim(),
      entityType: String(query.entityType ?? '').trim(),
      entityId: String(query.entityId ?? '').trim(),
      actorUserId: String(query.actorUserId ?? '').trim(),
      action: String(query.action ?? '').trim(),
      batchId: String(query.batchId ?? '').trim(),
      from: String(query.from ?? '').trim(),
      to: String(query.to ?? '').trim(),
      page: this.normalizePage(query.page),
      pageSize: this.normalizePageSize(query.pageSize),
    };
  }

  private toQueryParams(query: AdminAuditQuery) {
    return {
      moduleName: query.moduleName || null,
      entityType: query.entityType || null,
      entityId: query.entityId || null,
      actorUserId: query.actorUserId || null,
      action: query.action || null,
      batchId: query.batchId || null,
      from: query.from || null,
      to: query.to || null,
      page: query.page === 1 ? null : query.page,
      pageSize: query.pageSize === ADMIN_AUDIT_DEFAULT_PAGE_SIZE ? null : query.pageSize,
    };
  }

  private serializeQuery(query: AdminAuditQuery) {
    return JSON.stringify(this.normalizeQuery(query));
  }

  private normalizePage(value: unknown) {
    return Math.max(1, Math.floor(Number(value ?? 1) || 1));
  }

  private normalizePageSize(value: unknown) {
    const numeric =
      Math.floor(Number(value ?? ADMIN_AUDIT_DEFAULT_PAGE_SIZE) || ADMIN_AUDIT_DEFAULT_PAGE_SIZE);
    return this.pageSizeOptions.includes(numeric as 25 | 50 | 100)
      ? numeric
      : ADMIN_AUDIT_DEFAULT_PAGE_SIZE;
  }

  private async loadChanges() {
    this.loading = true;
    this.error = null;
    try {
      const response = await this.auditService.listChanges(this.currentQuery());
      this.total = Math.max(0, Number(response.total ?? 0));
      this.page = this.normalizePage(response.page);
      this.pageSize = this.normalizePageSize(response.pageSize);
      this.items = (response.items ?? []).map((item) => this.toView(item));
      if (this.selectedChange) {
        this.selectedChange =
          this.items.find((item) => item.id === this.selectedChange?.id) ?? null;
      }
    } catch (error) {
      this.items = [];
      this.total = 0;
      this.selectedChange = null;
      this.error = this.extractError(error, 'No se pudo cargar la auditoria');
    } finally {
      this.loading = false;
    }
  }

  private async loadFacets() {
    this.loadingFacets = true;
    try {
      this.facets = await this.auditService.getFacets();
    } catch (error) {
      this.facets = { ...EMPTY_FACETS };
      if (!this.error) {
        this.error = this.extractError(error, 'No se pudieron cargar los filtros de auditoria');
      }
    } finally {
      this.loadingFacets = false;
    }
  }

  private toView(change: AdminAuditChange): AuditChangeView {
    const entityTypeLabel = this.entityLabel(change.entityType);
    const entityDisplayLabel = change.entityLabel
      ? `${entityTypeLabel}: ${change.entityLabel}`
      : entityTypeLabel;
    return {
      ...change,
      moduleLabel: this.moduleLabel(change.moduleName),
      entityTypeLabel,
      entityDisplayLabel,
      actionLabel: this.actionLabel(change.action),
      actorDisplayLabel: String(change.actorName ?? '').trim() || 'Sistema',
      actorRoleLabel: this.roleLabel(change.actorRole),
      summaryLines: this.buildSummaryLines(change),
    };
  }

  private buildSummaryLines(change: AdminAuditChange) {
    if ((change.changes ?? []).length > 0) {
      return change.changes.slice(0, 2).map((item) => {
        const previous = this.formatSummaryValue(item.oldValue, item.field);
        const next = this.formatSummaryValue(item.newValue, item.field);
        return `${this.fieldLabel(item.field)}: ${previous} -> ${next}`;
      });
    }

    const metadataEntries = this.metadataEntries(change.metadata);
    if (metadataEntries.length > 0) {
      return metadataEntries
        .slice(0, 2)
        .map(({ key, value }) => `${this.fieldLabel(key)}: ${value}`);
    }

    return ['Sin diff visible registrado'];
  }

  private metadataEntries(metadata: Record<string, unknown> | null) {
    if (!metadata) return [];
    const allEntries = Object.entries(metadata).filter(
      ([, value]) => value !== null && value !== undefined && value !== ''
    );
    const prioritized = allEntries.sort(([leftKey], [rightKey]) => {
      const leftScore = leftKey.toLowerCase().includes('id') ? 1 : 0;
      const rightScore = rightKey.toLowerCase().includes('id') ? 1 : 0;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return leftKey.localeCompare(rightKey);
    });
    return prioritized.map(([key, value]) => ({
      key,
      value: this.formatSummaryValue(value, key),
    }));
  }

  private formatSummaryValue(value: unknown, field?: string) {
    const raw = this.formatValue(value, field);
    return raw.length > 64 ? `${raw.slice(0, 61)}...` : raw;
  }

  private stringifyScalar(value: unknown) {
    if (value === null || value === undefined || value === '') return 'Sin valor';
    return String(value);
  }

  private roleLabel(value: unknown) {
    const key = String(value ?? '').trim();
    if (!key) return null;
    return ROLE_LABELS[key] ?? this.humanizeConstant(key);
  }

  private humanizeConstant(value: string) {
    return String(value ?? '')
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private humanizeField(value: string) {
    return String(value ?? '')
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private hasAdvancedFilters(filters: AuditFilters) {
    return Boolean(String(filters.batchId ?? '').trim() || String(filters.entityId ?? '').trim());
  }

  private areFiltersEqual(left: AuditFilters, right: AuditFilters) {
    return this.serializeFilters(left) === this.serializeFilters(right);
  }

  private serializeFilters(filters: AuditFilters) {
    return JSON.stringify({
      moduleName: String(filters.moduleName ?? '').trim(),
      entityType: String(filters.entityType ?? '').trim(),
      entityId: String(filters.entityId ?? '').trim(),
      actorUserId: String(filters.actorUserId ?? '').trim(),
      action: String(filters.action ?? '').trim(),
      batchId: String(filters.batchId ?? '').trim(),
      from: String(filters.from ?? '').trim(),
      to: String(filters.to ?? '').trim(),
    });
  }

  private checkViewport() {
    this.isMobile = window.innerWidth < 1280;
  }

  private toDate(value: string) {
    const date = new Date(String(value ?? ''));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private extractError(error: unknown, fallback: string) {
    const maybeError = error as {
      error?: { message?: string | string[] };
      message?: string;
    };
    const message = maybeError?.error?.message ?? maybeError?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    return fallback;
  }
}
