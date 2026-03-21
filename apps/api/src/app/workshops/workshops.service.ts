import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { PeriodsService } from '../periods/periods.service';
import { AttendanceStatus, Role } from '@uai/shared';
import { MeetingsService } from '../management-zoom/meetings.service';
import { AuditActor, AuditService } from '../audit/audit.service';

type WorkshopMode = 'BY_SIZE' | 'SINGLE';
type SelectionMode = 'ALL' | 'MANUAL';
type DeliveryMode = 'VIRTUAL' | 'PRESENCIAL';
type PendingReasonCode = 'SCHEDULE_CONFLICT' | 'NO_CAPACITY' | 'NO_ELIGIBLE_GROUP';

interface ResponsibleTeacherSnapshot {
  id: string;
  dni: string | null;
  fullName: string;
}

interface WorkshopGroupInput {
  id?: string;
  code?: string | null;
  displayName?: string;
  capacity?: number | null;
  sortOrder?: number;
  isActive?: boolean;
}

interface WorkshopScheduleBlockInput {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  zoomMeetingRecordId?: string | null;
  joinUrl?: string | null;
  startUrl?: string | null;
}

interface GroupScheduleBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string | null;
  endDate: string | null;
  zoomMeetingRecordId?: string | null;
  joinUrl?: string | null;
  startUrl?: string | null;
}

interface GroupWithSchedule {
  id: string;
  workshopId: string;
  code: string;
  displayName: string;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  scheduleBlocks: GroupScheduleBlock[];
}

interface WorkshopAttendanceSaveItem {
  studentId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

interface StudentScheduleWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  label?: string | null;
}

interface WorkshopStudentSummaryRow {
  studentId: string;
  dni: string | null;
  codigoAlumno: string | null;
  fullName: string;
  careerName: string | null;
  facultyGroup: string | null;
  campusName: string | null;
}

interface WorkshopStudentCodeImportSummary {
  rowsRead: number;
  resolvedCount: number;
  duplicateCodes: string[];
  notFoundCodes: string[];
  ambiguousCodes: string[];
  emptyRows: number;
}

interface WorkshopStudentCodeImportResult {
  students: WorkshopStudentSummaryRow[];
  summary: WorkshopStudentCodeImportSummary;
}

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly periodsService: PeriodsService,
    private readonly meetingsService: MeetingsService,
    private readonly auditService: AuditService
  ) { }

  private normalize(value: string | null | undefined) {
    return String(value ?? '').trim();
  }

  private normalizeArray(value: string | string[] | null | undefined) {
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .map((v) => this.normalize(v))
      .filter((v) => v.length > 0);
  }

  private normalizeHeaderToken(value: unknown) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizeStudentCode(value: unknown) {
    return String(value ?? '').trim().toUpperCase();
  }

  private toBool(value: any) {
    return Number(value ?? 0) > 0;
  }

  private ensurePositiveInteger(value: any, fallback: number | null = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('La capacidad debe ser mayor a 0');
    }
    return parsed;
  }

  private toTimeMinutes(value: string) {
    const raw = String(value ?? '').trim();
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  private mapWorkshopStudentRow(row: any): WorkshopStudentSummaryRow {
    return {
      studentId: String(row.studentId),
      dni: row.dni ? String(row.dni) : null,
      codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
      fullName: String(row.fullName ?? ''),
      careerName: row.careerName ? String(row.careerName) : null,
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
    };
  }

  private hasDateRangeOverlap(
    a: { startDate?: string | null; endDate?: string | null },
    b: { startDate?: string | null; endDate?: string | null }
  ) {
    const aStart = this.normalizeIsoDateOnly(a.startDate) ?? '1000-01-01';
    const aEnd = this.normalizeIsoDateOnly(a.endDate) ?? '9999-12-31';
    const bStart = this.normalizeIsoDateOnly(b.startDate) ?? '1000-01-01';
    const bEnd = this.normalizeIsoDateOnly(b.endDate) ?? '9999-12-31';
    return aStart <= bEnd && bStart <= aEnd;
  }

  private hasTimeOverlap(
    a: { dayOfWeek: number; startTime: string; endTime: string; startDate?: string | null; endDate?: string | null },
    b: { dayOfWeek: number; startTime: string; endTime: string; startDate?: string | null; endDate?: string | null }
  ) {
    if (Number(a.dayOfWeek) !== Number(b.dayOfWeek)) return false;
    const aStart = this.toTimeMinutes(a.startTime);
    const aEnd = this.toTimeMinutes(a.endTime);
    const bStart = this.toTimeMinutes(b.startTime);
    const bEnd = this.toTimeMinutes(b.endTime);
    if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
    if (!(aStart < bEnd && aEnd > bStart)) return false;
    return this.hasDateRangeOverlap(a, b);
  }

  private findOverlappingBlocks(
    studentBlocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
      label?: string | null;
    }>,
    groupBlocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    }>
  ) {
    const overlaps: Array<{
      studentBlock: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate?: string | null;
        endDate?: string | null;
        label?: string | null;
      };
      groupBlock: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate?: string | null;
        endDate?: string | null;
      };
    }> = [];
    for (const sb of studentBlocks) {
      for (const gb of groupBlocks) {
        if (this.hasTimeOverlap(sb, gb)) {
          overlaps.push({ studentBlock: sb, groupBlock: gb });
        }
      }
    }
    return overlaps;
  }

  private normalizeGroupCode(input: string) {
    return String(input ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/[^A-Z0-9\-_]/g, '');
  }

  private deriveGroupCode(displayName: string, index: number) {
    const parts = String(displayName ?? '')
      .trim()
      .split(/\s+/g)
      .filter(Boolean);
    if (parts.length === 0) return `GRUPO-${index}`;
    if (parts.length === 1) return this.normalizeGroupCode(parts[0]) || `GRUPO-${index}`;
    const initials = parts.map((part) => part[0]).join('');
    return this.normalizeGroupCode(initials) || `GRUPO-${index}`;
  }

  private makeUniqueCode(baseCode: string, usedCodes: Set<string>) {
    const base = baseCode || 'GRUPO';
    let candidate = base;
    let suffix = 1;
    while (usedCodes.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    usedCodes.add(candidate);
    return candidate;
  }

  private resolveGroupCapacity(workshop: any, group: GroupWithSchedule, totalStudents: number) {
    if (group.capacity !== null && group.capacity !== undefined) {
      return Math.max(1, Number(group.capacity));
    }
    if (String(workshop.mode ?? '') === 'BY_SIZE') {
      const configured = Number(workshop.groupSize ?? 0);
      if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
    }
    return totalStudents > 0 ? totalStudents : null;
  }

  async list() {
    console.log('list() called');
    const rows = await this.dataSource.query(
      `
      SELECT
        w.*,
        rt.dni AS responsibleTeacherDni,
        rt.fullName AS responsibleTeacherName,
        (
          SELECT COUNT(*)
          FROM workshop_students ws
          WHERE ws.workshopId = w.id
        ) AS selectedStudentsCount,
        (
          SELECT COUNT(*)
          FROM workshop_groups wg
          WHERE wg.workshopId = w.id
        ) AS groupsCount,
        (
          SELECT COUNT(DISTINCT b.groupId)
          FROM workshop_groups wg
          INNER JOIN workshop_group_schedule_blocks b ON b.groupId = wg.id
          WHERE wg.workshopId = w.id
        ) AS scheduledGroupsCount,
        (
          SELECT wa.id
          FROM workshop_applications wa
          WHERE wa.workshopId = w.id
          ORDER BY wa.createdAt DESC, wa.id DESC
          LIMIT 1
        ) AS lastApplicationId,
        (
          SELECT wa.createdAt
          FROM workshop_applications wa
          WHERE wa.workshopId = w.id
          ORDER BY wa.createdAt DESC, wa.id DESC
          LIMIT 1
        ) AS lastApplicationAt
      FROM workshops w
      LEFT JOIN users rt ON rt.id = w.responsibleTeacherId
      ORDER BY w.createdAt DESC
      `
    );
    console.log(`list() database returned ${rows.length} rows`);
    const mapped = rows.map((r: any) => this.mapWorkshop(r));
    console.log(`list() mapped returning now`);
    return mapped;
  }

  async get(id: string, loadStudents = true) {
    const row = await this.dataSource
      .query(
        `
        SELECT
          w.*,
          rt.dni AS responsibleTeacherDni,
          rt.fullName AS responsibleTeacherName
        FROM workshops w
        LEFT JOIN users rt ON rt.id = w.responsibleTeacherId
        WHERE w.id = ?
        LIMIT 1
        `,
        [id]
      )
      .then((r) => r[0]);
    if (!row) throw new NotFoundException('Taller no encontrado');
    const workshop = this.mapWorkshop(row) as ReturnType<WorkshopsService['mapWorkshop']> & {
      studentIds?: string[];
      selectedStudents?: WorkshopStudentSummaryRow[];
    };
    if (loadStudents) {
      workshop.studentIds = await this.loadStudentIds(id);
      workshop.selectedStudents = await this.loadWorkshopSelectedStudents(
        workshop.studentIds ?? []
      );
    }
    return workshop;
  }

  async create(payload: {
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    facultyGroups?: string[] | null;
    campusNames?: string[] | null;
    careerNames?: string[] | null;
    facultyGroup?: string | null;
    campusName?: string | null;
    careerName?: string | null;
    deliveryMode?: DeliveryMode;
    venueCampusName?: string | null;
    responsibleTeacherId?: string | null;
    studentIds?: string[];
  }, actor?: AuditActor | null) {
    this.validatePayload(payload);
    const responsibleTeacher = await this.resolveResponsibleTeacherOrThrow(
      payload.responsibleTeacherId ?? null
    );
    const id = randomUUID();
    const facultyGroups = this.normalizeArray(payload.facultyGroups ?? payload.facultyGroup);
    const campusNames = this.normalizeArray(payload.campusNames ?? payload.campusName);
    const careerNames = this.normalizeArray(payload.careerNames ?? payload.careerName);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        INSERT INTO workshops (
          id, name, mode, groupSize, selectionMode,
          facultyGroup, campusName, careerName,
          facultyGroups, campusNames, careerNames,
          deliveryMode, venueCampusName, responsibleTeacherId,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
        `,
        [
          id,
          payload.name,
          payload.mode,
          payload.mode === 'BY_SIZE' ? Number(payload.groupSize) : null,
          payload.selectionMode,
          (facultyGroups[0] ?? this.normalize(payload.facultyGroup)) || null,
          (campusNames[0] ?? this.normalize(payload.campusName)) || null,
          (careerNames[0] ?? this.normalize(payload.careerName)) || null,
          facultyGroups.length > 0 ? JSON.stringify(facultyGroups) : null,
          campusNames.length > 0 ? JSON.stringify(campusNames) : null,
          careerNames.length > 0 ? JSON.stringify(careerNames) : null,
          payload.deliveryMode ?? 'VIRTUAL',
          this.normalize(payload.venueCampusName) || null,
          responsibleTeacher?.id ?? null,
        ]
      );
      if (payload.selectionMode === 'MANUAL') {
        await this.saveStudentIds(manager, id, payload.studentIds ?? []);
      }
    });
    const created = await this.get(id);
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP',
      entityId: id,
      entityLabel: created.name,
      action: 'CREATE',
      actor: actor ?? null,
      before: null,
      after: this.toAuditWorkshopSnapshot(created),
    });
    return created;
  }

  async update(id: string, payload: Partial<{
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    facultyGroups?: string[] | null;
    campusNames?: string[] | null;
    careerNames?: string[] | null;
    facultyGroup?: string | null;
    campusName?: string | null;
    careerName?: string | null;
    deliveryMode?: DeliveryMode;
    venueCampusName?: string | null;
    responsibleTeacherId?: string | null;
    studentIds?: string[];
  }>, actor?: AuditActor | null) {
    const existing = await this.get(id);
    const merged = { ...existing, ...payload };
    this.validatePayload(merged as any);
    const responsibleTeacher = await this.resolveResponsibleTeacherOrThrow(
      (payload as any).responsibleTeacherId ?? (merged as any).responsibleTeacherId ?? null
    );
    const facultyGroups = this.normalizeArray((payload as any).facultyGroups ?? merged.facultyGroups ?? merged.facultyGroup);
    const campusNames = this.normalizeArray((payload as any).campusNames ?? merged.campusNames ?? merged.campusName);
    const careerNames = this.normalizeArray((payload as any).careerNames ?? merged.careerNames ?? merged.careerName);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE workshops SET
          name = ?, mode = ?, groupSize = ?, selectionMode = ?,
          facultyGroup = ?, campusName = ?, careerName = ?,
          facultyGroups = ?, campusNames = ?, careerNames = ?,
          deliveryMode = ?, venueCampusName = ?, responsibleTeacherId = ?, updatedAt = NOW(6)
        WHERE id = ?
        `,
        [
          merged.name,
          merged.mode,
          merged.mode === 'BY_SIZE' ? Number(merged.groupSize) : null,
          merged.selectionMode,
          (facultyGroups[0] ?? this.normalize(merged.facultyGroup)) || null,
          (campusNames[0] ?? this.normalize(merged.campusName)) || null,
          (careerNames[0] ?? this.normalize(merged.careerName)) || null,
          facultyGroups.length > 0 ? JSON.stringify(facultyGroups) : null,
          campusNames.length > 0 ? JSON.stringify(campusNames) : null,
          careerNames.length > 0 ? JSON.stringify(careerNames) : null,
          merged.deliveryMode ?? 'VIRTUAL',
          this.normalize(merged.venueCampusName) || null,
          responsibleTeacher?.id ?? null,
          id,
        ]
      );
      await manager.query(`DELETE FROM workshop_students WHERE workshopId = ?`, [id]);
      if (merged.selectionMode === 'MANUAL') {
        await this.saveStudentIds(manager, id, merged.studentIds ?? []);
      }
    });
    const updated = await this.get(id);
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP',
      entityId: id,
      entityLabel: updated.name,
      action: 'UPDATE',
      actor: actor ?? null,
      before: this.toAuditWorkshopSnapshot(existing),
      after: this.toAuditWorkshopSnapshot(updated),
    });
    return updated;
  }

  async delete(id: string, actor?: AuditActor | null) {
    const existing = await this.get(id, false);
    await this.dataSource.query(`DELETE FROM workshops WHERE id = ?`, [id]);
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP',
      entityId: id,
      entityLabel: existing.name,
      action: 'DELETE',
      actor: actor ?? null,
      before: this.toAuditWorkshopSnapshot(existing),
      after: null,
    });
    return { ok: true };
  }

  private async loadStudentIds(workshopId: string) {
    const rows = await this.dataSource.query(
      `SELECT studentId FROM workshop_students WHERE workshopId = ?`,
      [workshopId]
    );
    return rows.map((r: any) => String(r.studentId));
  }

  private async loadWorkshopSelectedStudents(studentIds: string[]) {
    const uniqueIds = Array.from(
      new Set((studentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
    );
    if (uniqueIds.length === 0) return [];
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.loadStudentRowsByIds(uniqueIds, periodId);
  }

  private async loadStudentRowsByIds(studentIds: string[], periodId: string) {
    const uniqueIds = Array.from(
      new Set((studentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
    );
    if (uniqueIds.length === 0) return [];

    const rows = await this.dataSource.query(
      `
      SELECT
        u.id AS studentId,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        se.careerName AS careerName,
        se.facultyGroup AS facultyGroup,
        se.campusName AS campusName
      FROM users u
      LEFT JOIN (
        SELECT
          studentId,
          MAX(TRIM(REPLACE(REPLACE(careerName, '\\r', ''), '\\n', ''))) AS careerName,
          MAX(TRIM(facultyGroup)) AS facultyGroup,
          MAX(TRIM(campusName)) AS campusName
        FROM student_enrollments
        WHERE periodId = ?
        GROUP BY studentId
      ) se ON se.studentId = u.id
      WHERE u.id IN (${uniqueIds.map(() => '?').join(', ')})
        AND u.role = ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [periodId, ...uniqueIds, Role.ALUMNO]
    );

    return rows.map((row: any) => this.mapWorkshopStudentRow(row));
  }

  private async loadStudentsByCodes(codes: string[], periodId: string) {
    const uniqueCodes = Array.from(
      new Set((codes ?? []).map((code) => this.normalizeStudentCode(code)).filter(Boolean))
    );
    const result = new Map<string, WorkshopStudentSummaryRow[]>();
    if (uniqueCodes.length === 0) return result;

    const rows = await this.dataSource.query(
      `
      SELECT
        u.id AS studentId,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        se.careerName AS careerName,
        se.facultyGroup AS facultyGroup,
        se.campusName AS campusName
      FROM users u
      LEFT JOIN (
        SELECT
          studentId,
          MAX(TRIM(REPLACE(REPLACE(careerName, '\\r', ''), '\\n', ''))) AS careerName,
          MAX(TRIM(facultyGroup)) AS facultyGroup,
          MAX(TRIM(campusName)) AS campusName
        FROM student_enrollments
        WHERE periodId = ?
        GROUP BY studentId
      ) se ON se.studentId = u.id
      WHERE u.role = ?
        AND UPPER(COALESCE(u.codigoAlumno, '')) IN (${uniqueCodes.map(() => '?').join(', ')})
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [periodId, Role.ALUMNO, ...uniqueCodes]
    );

    for (const row of rows) {
      const code = this.normalizeStudentCode(row.codigoAlumno);
      if (!code) continue;
      if (!result.has(code)) result.set(code, []);
      result.get(code)!.push(this.mapWorkshopStudentRow(row));
    }

    return result;
  }

  private async saveStudentIds(manager: any, workshopId: string, studentIds: string[]) {
    if (!studentIds || studentIds.length === 0) {
      throw new BadRequestException('Seleccion manual vacia');
    }
    const unique = Array.from(new Set(studentIds.map((x) => String(x))));
    const values = unique.map((id) => [randomUUID(), workshopId, id]);
    if (values.length > 0) {
      const placeholders = values.map(() => '(?, ?, ?, NOW(6))').join(', ');
      await manager.query(
        `INSERT INTO workshop_students (id, workshopId, studentId, createdAt) VALUES ${placeholders}`,
        values.flat()
      );
    }
  }

  private validatePayload(payload: {
    name: string;
    mode: WorkshopMode;
    groupSize?: number | null;
    selectionMode: SelectionMode;
    studentIds?: string[];
  }) {
    const name = this.normalize(payload.name);
    if (!name) throw new BadRequestException('El nombre del taller es requerido');
    const mode = (payload.mode || 'BY_SIZE').toUpperCase() as WorkshopMode;
    if (mode === 'BY_SIZE') {
      const size = Number(payload.groupSize ?? 0);
      if (!Number.isFinite(size) || size <= 0) {
        throw new BadRequestException('El tamaño de grupo debe ser mayor a 0');
      }
    }
    const selectionMode = (payload.selectionMode || 'ALL').toUpperCase() as SelectionMode;
    if (selectionMode === 'MANUAL') {
      if (!payload.studentIds || payload.studentIds.length === 0) {
        throw new BadRequestException('Debes seleccionar al menos un alumno en modo manual');
      }
    }
  }

  async listStudents(filters: {
    facultyGroup?: string | string[];
    campusName?: string | string[];
    careerName?: string | string[];
  }) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const conditions: string[] = [`u.role = 'ALUMNO'`, 'se.periodId = ?'];
    const params: any[] = [periodId];
    const faculties = this.normalizeArray(filters.facultyGroup);
    const campuses = this.normalizeArray(filters.campusName);
    const careers = this.normalizeArray(filters.careerName);

    if (faculties.length === 1) {
      conditions.push('se.facultyGroup = ?');
      params.push(faculties[0]);
    } else if (faculties.length > 1) {
      conditions.push(`se.facultyGroup IN (${faculties.map(() => '?').join(', ')})`);
      params.push(...faculties);
    }

    if (campuses.length === 1) {
      conditions.push('se.campusName = ?');
      params.push(campuses[0]);
    } else if (campuses.length > 1) {
      conditions.push(`se.campusName IN (${campuses.map(() => '?').join(', ')})`);
      params.push(...campuses);
    }

    if (careers.length === 1) {
      conditions.push(`se.careerName LIKE CONCAT('%', ?, '%')`);
      params.push(careers[0]);
    } else if (careers.length > 1) {
      const orConditions = careers.map(() => `se.careerName LIKE CONCAT('%', ?, '%')`);
      conditions.push(`(${orConditions.join(' OR ')})`);
      params.push(...careers);
    }

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT
        u.id AS studentId,
        u.dni,
        u.codigoAlumno,
        u.fullName,
        TRIM(REPLACE(REPLACE(se.careerName, '\\r', ''), '\\n', '')) AS careerName,
        TRIM(se.facultyGroup) AS facultyGroup,
        TRIM(se.campusName) AS campusName
      FROM users u
      INNER JOIN student_enrollments se ON se.studentId = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.fullName ASC
      `,
      params
    );

    return rows.map((row: any) => ({
      studentId: String(row.studentId),
      dni: row.dni ? String(row.dni) : null,
      codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
      fullName: String(row.fullName ?? ''),
      careerName: row.careerName ? String(row.careerName) : null,
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
    }));
  }

  async importStudentCodesFromExcel(file: {
    buffer?: Buffer;
    originalname?: string;
  }): Promise<WorkshopStudentCodeImportResult> {
    const fileBuffer = file?.buffer;
    const originalName = String(file?.originalname ?? '').trim().toLowerCase();
    if (!fileBuffer?.length) {
      throw new BadRequestException('Debes adjuntar un archivo Excel.');
    }
    if (!originalName.endsWith('.xlsx') && !originalName.endsWith('.xls')) {
      throw new BadRequestException('El archivo debe ser Excel (.xlsx o .xls).');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel.');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('El archivo Excel no contiene hojas.');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    const recognizedHeaders = new Set(['CODIGO', 'CODIGOALUMNO', 'CODIGOESTUDIANTE']);
    let headerRowIdx = -1;
    let codeColumnIdx = -1;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] ?? [];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const token = this.normalizeHeaderToken(row[colIdx]);
        if (!recognizedHeaders.has(token)) continue;
        headerRowIdx = rowIdx;
        codeColumnIdx = colIdx;
        break;
      }
      if (codeColumnIdx >= 0) break;
    }

    const firstNonEmptyRowIdx = rows.findIndex((row) =>
      (row ?? []).some((cell) => this.normalize(String(cell ?? '')).length > 0)
    );
    if (firstNonEmptyRowIdx < 0) {
      throw new BadRequestException('El archivo Excel no contiene datos.');
    }

    if (codeColumnIdx < 0) {
      const fallbackRow = rows[firstNonEmptyRowIdx] ?? [];
      codeColumnIdx = fallbackRow.findIndex(
        (cell) => this.normalize(String(cell ?? '')).length > 0
      );
    }
    if (codeColumnIdx < 0) {
      throw new BadRequestException(
        'No se pudo identificar una columna de codigo de alumno en el archivo.'
      );
    }

    const startRowIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : firstNonEmptyRowIdx;
    if (startRowIdx >= rows.length) {
      throw new BadRequestException('El archivo no contiene filas de datos para importar.');
    }

    let rowsRead = 0;
    let emptyRows = 0;
    const uniqueCodes: string[] = [];
    const seenCodes = new Set<string>();
    const duplicateCodes: string[] = [];
    const duplicateCodesSeen = new Set<string>();

    for (let rowIdx = startRowIdx; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] ?? [];
      rowsRead += 1;
      const isRowEmpty = row.every((cell) => this.normalize(String(cell ?? '')).length === 0);
      if (isRowEmpty) {
        emptyRows += 1;
        continue;
      }

      const normalizedCode = this.normalizeStudentCode(row[codeColumnIdx]);
      if (!normalizedCode) {
        emptyRows += 1;
        continue;
      }

      if (seenCodes.has(normalizedCode)) {
        if (!duplicateCodesSeen.has(normalizedCode)) {
          duplicateCodesSeen.add(normalizedCode);
          duplicateCodes.push(normalizedCode);
        }
        continue;
      }

      seenCodes.add(normalizedCode);
      uniqueCodes.push(normalizedCode);
    }

    if (rowsRead === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos para importar.');
    }
    if (uniqueCodes.length === 0) {
      throw new BadRequestException('No se encontraron codigos de alumno validos en el archivo.');
    }

    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const studentsByCode = await this.loadStudentsByCodes(uniqueCodes, periodId);
    const students: WorkshopStudentSummaryRow[] = [];
    const notFoundCodes: string[] = [];
    const ambiguousCodes: string[] = [];

    for (const code of uniqueCodes) {
      const matches = studentsByCode.get(code) ?? [];
      if (matches.length === 1) {
        students.push(matches[0]);
        continue;
      }
      if (matches.length > 1) {
        ambiguousCodes.push(code);
        continue;
      }
      notFoundCodes.push(code);
    }

    return {
      students,
      summary: {
        rowsRead,
        resolvedCount: students.length,
        duplicateCodes,
        notFoundCodes,
        ambiguousCodes,
        emptyRows,
      },
    };
  }

  async listFilters(filters: { facultyGroup?: string | string[]; campusName?: string | string[] }) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const faculties = await this.dataSource
      .query(
        `
        SELECT DISTINCT TRIM(se.facultyGroup) AS value
        FROM student_enrollments se
        WHERE se.periodId = ?
          AND se.facultyGroup IS NOT NULL
          AND se.facultyGroup <> ''
        ORDER BY value ASC
        `,
        [periodId]
      )
      .then((rows: any[]) => rows.map((row) => String(row.value ?? '')));

    const facs = this.normalizeArray(filters.facultyGroup);
    let campuses: string[] = [];
    if (facs.length > 0) {
      campuses = await this.dataSource
        .query(
          `
          SELECT DISTINCT TRIM(se.campusName) AS value
          FROM student_enrollments se
          WHERE se.periodId = ?
            AND se.campusName IS NOT NULL
            AND se.campusName <> ''
            AND se.facultyGroup IN (${facs.map(() => '?').join(', ')})
          ORDER BY value ASC
          `,
          [periodId, ...facs]
        )
        .then((rows: any[]) => rows.map((row) => String(row.value ?? '')));
    }

    const camps = this.normalizeArray(filters.campusName);
    let careers: string[] = [];
    if (facs.length > 0 && camps.length > 0) {
      careers = await this.dataSource
        .query(
          `
          SELECT DISTINCT TRIM(REPLACE(REPLACE(se.careerName, '\\r', ''), '\\n', '')) AS value
          FROM student_enrollments se
          WHERE se.periodId = ?
            AND se.careerName IS NOT NULL
            AND se.careerName <> ''
            AND se.facultyGroup IN (${facs.map(() => '?').join(', ')})
            AND se.campusName IN (${camps.map(() => '?').join(', ')})
          ORDER BY value ASC
          `,
          [periodId, ...facs, ...camps]
        )
        .then((rows: any[]) => rows.map((row) => String(row.value ?? '')));
    }

    return {
      faculties,
      campuses,
      careers,
    };
  }

  async listGroups(workshopId: string) {
    await this.get(workshopId, false);
    const groupsRows: any[] = await this.dataSource.query(
      `
      SELECT
        g.id, g.workshopId, g.code, g.displayName, g.capacity, g.sortOrder, g.isActive,
        g.createdAt, g.updatedAt
      FROM workshop_groups g
      WHERE g.workshopId = ?
      ORDER BY g.sortOrder ASC, g.createdAt ASC
      `,
      [workshopId]
    );
    const groupIds = groupsRows.map((row) => String(row.id));
    let scheduleRows: any[] = [];
    if (groupIds.length > 0) {
      scheduleRows = await this.dataSource.query(
        `
        SELECT
          b.id, b.groupId, b.dayOfWeek, b.startTime, b.endTime, b.startDate, b.endDate,
          b.zoomMeetingRecordId, b.joinUrl, b.startUrl
        FROM workshop_group_schedule_blocks b
        WHERE b.groupId IN (${groupIds.map(() => '?').join(', ')})
        ORDER BY COALESCE(b.startDate, '9999-12-31') ASC, b.startTime ASC, b.dayOfWeek ASC
        `,
        groupIds
      );
    }

    const scheduleByGroup = new Map<string, GroupScheduleBlock[]>();
    for (const row of scheduleRows) {
      const groupId = String(row.groupId);
      if (!scheduleByGroup.has(groupId)) scheduleByGroup.set(groupId, []);
      scheduleByGroup.get(groupId)!.push({
        id: String(row.id),
        dayOfWeek: Number(row.dayOfWeek ?? 0),
        startTime: String(row.startTime ?? ''),
        endTime: String(row.endTime ?? ''),
        startDate: row.startDate ? this.normalizeIsoDateOnly(row.startDate) : null,
        endDate: row.endDate ? this.normalizeIsoDateOnly(row.endDate) : null,
        zoomMeetingRecordId: row.zoomMeetingRecordId
          ? String(row.zoomMeetingRecordId)
          : null,
        joinUrl: row.joinUrl ? String(row.joinUrl) : null,
        startUrl: row.startUrl ? String(row.startUrl) : null,
      });
    }

    return groupsRows.map((row) => ({
      id: String(row.id),
      workshopId: String(row.workshopId),
      code: String(row.code ?? ''),
      displayName: String(row.displayName ?? ''),
      capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
      sortOrder: Number(row.sortOrder ?? 0),
      isActive: this.toBool(row.isActive),
      scheduleBlocks: scheduleByGroup.get(String(row.id)) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async upsertGroups(
    workshopId: string,
    groups: WorkshopGroupInput[],
    actor?: AuditActor | null
  ) {
    await this.get(workshopId, false);
    const beforeGroups = await this.listGroups(workshopId);
    const incoming = Array.isArray(groups) ? groups : [];
    await this.dataSource.transaction(async (manager) => {
      const existingRows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM workshop_groups WHERE workshopId = ?`,
        [workshopId]
      );
      const existingIds = new Set(existingRows.map((row) => String(row.id)));
      const keptIds = new Set<string>();
      const usedCodes = new Set<string>();

      const normalizedIncomingIds = incoming
        .map((row) => this.normalize(row.id))
        .filter((id) => id.length > 0);
      if (normalizedIncomingIds.length === 0) {
        await manager.query(`DELETE FROM workshop_groups WHERE workshopId = ?`, [workshopId]);
      } else {
        await manager.query(
          `
          DELETE FROM workshop_groups
          WHERE workshopId = ?
            AND id NOT IN (${normalizedIncomingIds.map(() => '?').join(', ')})
          `,
          [workshopId, ...normalizedIncomingIds]
        );
      }

      for (let index = 0; index < incoming.length; index += 1) {
        const row = incoming[index];
        const displayName = this.normalize(row.displayName);
        if (!displayName) {
          throw new BadRequestException('Cada grupo debe tener nombre');
        }
        const id = this.normalize(row.id) || randomUUID();
        const baseCode =
          this.normalizeGroupCode(this.normalize(row.code)) ||
          this.deriveGroupCode(displayName, index + 1);
        const code = this.makeUniqueCode(baseCode, usedCodes);
        const capacity = this.ensurePositiveInteger(row.capacity, null);
        const sortOrder = Number.isFinite(Number(row.sortOrder))
          ? Math.floor(Number(row.sortOrder))
          : index + 1;
        const isActive = row.isActive === undefined ? true : Boolean(row.isActive);

        if (existingIds.has(id)) {
          await manager.query(
            `
            UPDATE workshop_groups
            SET code = ?, displayName = ?, capacity = ?, sortOrder = ?, isActive = ?, updatedAt = NOW(6)
            WHERE id = ? AND workshopId = ?
            `,
            [code, displayName, capacity, sortOrder, isActive ? 1 : 0, id, workshopId]
          );
        } else {
          await manager.query(
            `
            INSERT INTO workshop_groups (
              id, workshopId, code, displayName, capacity, sortOrder, isActive, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
            `,
            [id, workshopId, code, displayName, capacity, sortOrder, isActive ? 1 : 0]
          );
        }
        keptIds.add(id);
      }
    });
    const savedGroups = await this.listGroups(workshopId);
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP_GROUPS',
      entityId: workshopId,
      entityLabel: workshopId,
      action: 'REPLACE',
      actor: actor ?? null,
      before: {
        groups: beforeGroups.map((group) => this.toAuditGroupSnapshot(group)),
      },
      after: {
        groups: savedGroups.map((group) => this.toAuditGroupSnapshot(group)),
      },
    });
    return savedGroups;
  }

  async regenerateGroups(workshopId: string, actor?: AuditActor | null) {
    const workshop = await this.get(workshopId);
    // Borramos grupos existentes para evitar colisiones de UNIQUE (workshopId, code)
    // El ON DELETE CASCADE se encarga de los bloques horarios.
    await this.dataSource.query(`DELETE FROM workshop_groups WHERE workshopId = ?`, [workshopId]);

    const students = await this.loadStudentsForWorkshop(workshop);
    const totalStudents = students.length;
    if (totalStudents <= 0) {
      throw new BadRequestException('Debes seleccionar al menos un alumno antes de generar grupos');
    }

    const mode = String(workshop.mode ?? 'BY_SIZE') as WorkshopMode;
    const groups: WorkshopGroupInput[] = [];
    if (mode === 'SINGLE') {
      groups.push({
        code: 'G1',
        displayName: 'Grupo 1',
        capacity: totalStudents,
        sortOrder: 1,
        isActive: true,
      });
    } else {
      const groupSize = this.ensurePositiveInteger(workshop.groupSize, null);
      if (!groupSize) {
        throw new BadRequestException('El tamaño de grupo debe ser mayor a 0');
      }
      const groupsCount = Math.max(1, Math.ceil(totalStudents / groupSize));
      for (let index = 0; index < groupsCount; index += 1) {
        groups.push({
          code: `G${index + 1}`,
          displayName: `Grupo ${index + 1}`,
          capacity: groupSize,
          sortOrder: index + 1,
          isActive: true,
        });
      }
    }

    return this.upsertGroups(workshopId, groups, actor ?? null);
  }

  async listGroupSchedule(workshopId: string, groupId: string) {
    await this.getGroupOrThrow(workshopId, groupId);
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        id,
        groupId,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        zoomMeetingRecordId,
        joinUrl,
        startUrl
      FROM workshop_group_schedule_blocks
      WHERE groupId = ?
      ORDER BY COALESCE(startDate, '9999-12-31') ASC, startTime ASC, dayOfWeek ASC
      `,
      [groupId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      groupId: String(row.groupId),
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      startTime: String(row.startTime ?? ''),
      endTime: String(row.endTime ?? ''),
      startDate: row.startDate ? this.normalizeIsoDateOnly(row.startDate) : null,
      endDate: row.endDate ? this.normalizeIsoDateOnly(row.endDate) : null,
      zoomMeetingRecordId: row.zoomMeetingRecordId
        ? String(row.zoomMeetingRecordId)
        : null,
      joinUrl: row.joinUrl ? String(row.joinUrl) : null,
      startUrl: row.startUrl ? String(row.startUrl) : null,
    }));
  }

  async updateGroupSchedule(
    workshopId: string,
    groupId: string,
    blocks: WorkshopScheduleBlockInput[],
    options?: { forceConflicts?: boolean; actor?: AuditActor | null }
  ) {
    await this.getGroupOrThrow(workshopId, groupId);
    const currentBlocks = await this.listGroupSchedule(workshopId, groupId);
    const incoming = Array.isArray(blocks) ? blocks : [];
    for (const block of incoming) {
      const day = Number(block.dayOfWeek);
      if (!Number.isFinite(day) || day < 1 || day > 7) {
        throw new BadRequestException('dayOfWeek invalido para horario de taller');
      }
      const start = this.toTimeMinutes(block.startTime);
      const end = this.toTimeMinutes(block.endTime);
      if (start === null || end === null || start >= end) {
        throw new BadRequestException('Bloque horario invalido (startTime/endTime)');
      }
    }
    const conflictPayload = await this.findWorkshopGroupScheduleStudentConflicts({
      workshopId,
      groupId,
      blocks: incoming,
    });
    if (conflictPayload && !options?.forceConflicts) {
      throw new ConflictException({
        ...conflictPayload,
        code: 'WORKSHOP_GROUP_SCHEDULE_CONFIRMATION_REQUIRED',
        message:
          'Este cambio genera cruces de horario con nivelacion. Desea continuar? Recuerde que luego debe cambiar de grupo a los alumnos afectados.',
      });
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM workshop_group_schedule_blocks WHERE groupId = ?`, [groupId]);
      if (incoming.length > 0) {
        const rows = incoming.map((block) => [
          randomUUID(),
          groupId,
          Number(block.dayOfWeek),
          String(block.startTime),
          String(block.endTime),
          this.normalize(block.startDate ?? null) || null,
          this.normalize(block.endDate ?? null) || null,
          this.normalize(block.zoomMeetingRecordId ?? null) || null,
          this.normalize(block.joinUrl ?? null) || null,
          this.normalize(block.startUrl ?? null) || null,
        ]);
        const placeholders = rows
          .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))')
          .join(', ');
        await manager.query(
          `
          INSERT INTO workshop_group_schedule_blocks (
            id, groupId, dayOfWeek, startTime, endTime, startDate, endDate,
            zoomMeetingRecordId, joinUrl, startUrl, createdAt, updatedAt
          )
          VALUES ${placeholders}
          `,
          rows.flat()
        );
      }
    });
    const savedBlocks = await this.listGroupSchedule(workshopId, groupId);
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP_GROUP_SCHEDULE',
      entityId: groupId,
      entityLabel: workshopId,
      action: 'REPLACE',
      actor: options?.actor ?? null,
      before: {
        blocks: currentBlocks.map((block) => this.toAuditScheduleBlock(block)),
      },
      after: {
        blocks: savedBlocks.map((block) => this.toAuditScheduleBlock(block)),
      },
      metadata: conflictPayload && options?.forceConflicts
        ? {
            forcedWithConflicts: true,
            warningCode: 'WORKSHOP_GROUP_SCHEDULE_WARNING',
          }
        : null,
    });
    return {
      blocks: savedBlocks,
      warnings:
        conflictPayload && options?.forceConflicts
          ? {
              ...conflictPayload,
              code: 'WORKSHOP_GROUP_SCHEDULE_WARNING',
              message:
                'Horario del taller guardado con alerta. Recuerde cambiar de grupo a los alumnos con cruce de horario.',
            }
          : null,
    };
  }

  async updateGroupScheduleBlockMeetingLinks(
    workshopId: string,
    groupId: string,
    blockId: string,
    body: {
      zoomMeetingRecordId?: string | null;
      joinUrl?: string | null;
      startUrl?: string | null;
    },
    actor?: AuditActor | null
  ) {
    const block = await this.getWorkshopScheduleBlockOrThrow(workshopId, groupId, blockId);
    const before = {
      zoomMeetingRecordId: block.zoomMeetingRecordId ?? null,
      joinUrl: block.joinUrl ?? null,
      startUrl: block.startUrl ?? null,
    };
    await this.dataSource.query(
      `
      UPDATE workshop_group_schedule_blocks
      SET zoomMeetingRecordId = ?,
          joinUrl = ?,
          startUrl = ?,
          updatedAt = NOW(6)
      WHERE id = ?
      `,
      [
        this.normalize(body.zoomMeetingRecordId ?? null) || null,
        this.normalize(body.joinUrl ?? null) || null,
        this.normalize(body.startUrl ?? null) || null,
        block.id,
      ]
    );
    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP_GROUP_SCHEDULE_MEETING',
      entityId: block.id,
      entityLabel: `${workshopId} | ${groupId}`,
      action: 'UPDATE',
      actor: actor ?? null,
      before,
      after: {
        zoomMeetingRecordId: this.normalize(body.zoomMeetingRecordId ?? null) || null,
        joinUrl: this.normalize(body.joinUrl ?? null) || null,
        startUrl: this.normalize(body.startUrl ?? null) || null,
      },
    });
    return this.listGroupSchedule(workshopId, groupId);
  }

  async refreshWorkshopGroupScheduleBlockLinks(blockId: string) {
    const block = await this.getWorkshopScheduleBlockByIdOrThrow(blockId);
    const meetingRecordId = this.normalize(block.zoomMeetingRecordId);
    if (!meetingRecordId) {
      const joinUrl = this.normalize(block.joinUrl);
      const startUrl = this.normalize(block.startUrl);
      if (!joinUrl && !startUrl) {
        throw new BadRequestException(
          'El bloque del taller no tiene una reunion Zoom vinculada ni enlaces guardados.'
        );
      }
      return {
        joinUrl: joinUrl || null,
        startUrl: startUrl || null,
      };
    }

    const refreshed = await this.meetingsService.refreshMeetingLinks(meetingRecordId);
    await this.dataSource.query(
      `
      UPDATE workshop_group_schedule_blocks
      SET joinUrl = ?, startUrl = ?, updatedAt = NOW(6)
      WHERE id = ?
      `,
      [refreshed.joinUrl ?? null, refreshed.startUrl ?? null, block.id]
    );
    return {
      joinUrl: refreshed.joinUrl ?? null,
      startUrl: refreshed.startUrl ?? null,
    };
  }

  async refreshWorkshopGroupScheduleBlockLinksForAdmin(
    workshopId: string,
    groupId: string,
    blockId: string
  ) {
    await this.getWorkshopScheduleBlockOrThrow(workshopId, groupId, blockId);
    return this.refreshWorkshopGroupScheduleBlockLinks(blockId);
  }

  async preview(workshopId: string) {
    return this.previewAssignments(workshopId);
  }

  async apply(workshopId: string, actor: AuditActor | null) {
    return this.runAssignments(workshopId, actor);
  }

  async previewAssignments(workshopId: string) {
    const workshop = await this.get(workshopId);
    const students = await this.loadStudentsForWorkshop(workshop);
    const groups = (await this.listGroups(workshopId)) as GroupWithSchedule[];
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const loadByStudent = await this.loadStudentLevelingSchedule(
      students.map((s: any) => String(s.studentId)),
      periodId
    );
    return this.buildAssignmentPreview(workshop, students, groups, loadByStudent);
  }

  async runAssignments(workshopId: string, actor: AuditActor | null) {
    const preview = await this.previewAssignments(workshopId);
    if (!String((preview.workshop as any).responsibleTeacherId ?? '').trim()) {
      throw new BadRequestException(
        'Debes asignar un responsable al taller antes de aplicarlo'
      );
    }
    const runId = randomUUID();
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const filtersJson = JSON.stringify({
      facultyGroups: preview.workshop.facultyGroups ?? [],
      campusNames: preview.workshop.campusNames ?? [],
      careerNames: preview.workshop.careerNames ?? [],
      mode: preview.workshop.mode,
      groupSize: preview.workshop.groupSize ?? null,
      groupsConfigured: preview.groupsConfigured,
      groupsEligible: preview.groupsEligible,
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        INSERT INTO workshop_applications (
          id, workshopId, periodId, name, mode, groupSize, selectionMode,
          deliveryMode, venueCampusName, filtersJson, totalStudents, appliedById,
          responsibleTeacherId, responsibleTeacherDni, responsibleTeacherName, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
        `,
        [
          runId,
          preview.workshop.id,
          periodId,
          preview.workshop.name,
          preview.workshop.mode,
          preview.workshop.groupSize ?? null,
          preview.workshop.selectionMode,
          preview.workshop.deliveryMode ?? 'VIRTUAL',
          preview.workshop.venueCampusName ?? null,
          filtersJson,
          preview.totalCandidates,
          actor?.userId ?? null,
          (preview.workshop as any).responsibleTeacherId ?? null,
          (preview.workshop as any).responsibleTeacherDni ?? null,
          (preview.workshop as any).responsibleTeacherName ?? null,
        ]
      );

      const runGroupBySource = new Map<string, string>();
      for (let i = 0; i < preview.groups.length; i += 1) {
        const group = preview.groups[i];
        const runGroupId = randomUUID();
        runGroupBySource.set(group.sourceGroupId, runGroupId);
        const firstBlock = group.scheduleBlocks[0] ?? null;
        await manager.query(
          `
          INSERT INTO workshop_application_groups (
            id, applicationId, sourceGroupId, groupCode, groupName,
            groupIndex, studentCount, capacitySnapshot,
            dayOfWeek, startTime, endTime, venueDetails, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
          `,
          [
            runGroupId,
            runId,
            group.sourceGroupId,
            group.code,
            group.displayName,
            i + 1,
            group.assignedCount,
            group.capacity ?? null,
            firstBlock ? firstBlock.dayOfWeek : null,
            firstBlock ? firstBlock.startTime : null,
            firstBlock ? firstBlock.endTime : null,
            preview.workshop.deliveryMode === 'PRESENCIAL'
              ? preview.workshop.venueCampusName ?? null
              : 'VIRTUAL',
          ]
        );
      }

      for (const group of preview.groups) {
        const runGroupId = runGroupBySource.get(group.sourceGroupId);
        if (!runGroupId) continue;
        for (const student of group.students) {
          await manager.query(
            `
            INSERT INTO workshop_application_students (
              id, applicationId, groupId, studentId, createdAt
            ) VALUES (?, ?, ?, ?, NOW(6))
            `,
            [randomUUID(), runId, runGroupId, student.studentId]
          );
        }
      }

      for (const pending of preview.pending) {
        await manager.query(
          `
          INSERT INTO workshop_assignment_pending (
            id, applicationId, studentId, reasonCode, reasonDetail, createdAt
          ) VALUES (?, ?, ?, ?, ?, NOW(6))
          `,
          [randomUUID(), runId, pending.studentId, pending.reasonCode, pending.reasonDetail ?? null]
        );
      }
    });

    await this.auditService.recordChange({
      moduleName: 'WORKSHOPS',
      entityType: 'WORKSHOP_APPLICATION',
      entityId: runId,
      entityLabel: preview.workshop.name,
      action: 'APPLY',
      actor: actor ?? null,
      before: null,
      after: {
        workshopId,
        runId,
        assignedCount: preview.groups.reduce(
          (acc: number, group: any) => acc + Number(group.assignedCount ?? 0),
          0
        ),
        pendingCount: Array.isArray(preview.pending) ? preview.pending.length : 0,
      },
    });

    return { ok: true, runId, runStatus: 'APPLIED', ...preview };
  }

  async getAssignmentRun(workshopId: string, runId: string) {
    const run = await this.dataSource
      .query(
        `
        SELECT *
        FROM workshop_applications
        WHERE id = ? AND workshopId = ?
        LIMIT 1
        `,
        [runId, workshopId]
      )
      .then((rows) => rows[0]);
    if (!run) throw new NotFoundException('Run de taller no encontrado');

    const groups: any[] = await this.dataSource.query(
      `
      SELECT *
      FROM workshop_application_groups
      WHERE applicationId = ?
      ORDER BY groupIndex ASC, createdAt ASC
      `,
      [runId]
    );
    const assignedRows: any[] = await this.dataSource.query(
      `
      SELECT
        was.groupId,
        was.studentId,
        u.codigoAlumno,
        u.fullName,
        se.careerName,
        se.campusName
      FROM workshop_application_students was
      INNER JOIN users u ON BINARY u.id = BINARY was.studentId
      LEFT JOIN student_enrollments se
        ON BINARY se.studentId = BINARY was.studentId
       AND BINARY se.periodId = BINARY ?
      WHERE BINARY was.applicationId = BINARY ?
      ORDER BY u.fullName ASC
      `,
      [run.periodId, runId]
    );
    const byGroup = new Map<string, any[]>();
    for (const row of assignedRows) {
      const groupId = String(row.groupId);
      if (!byGroup.has(groupId)) byGroup.set(groupId, []);
      byGroup.get(groupId)!.push({
        studentId: String(row.studentId),
        codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
        fullName: String(row.fullName ?? ''),
        careerName: row.careerName ? String(row.careerName) : null,
        campusName: row.campusName ? String(row.campusName) : null,
      });
    }

    const pending = await this.getAssignmentRunPending(workshopId, runId);
    return {
      runId: String(run.id),
      workshopId: String(run.workshopId),
      periodId: String(run.periodId),
      createdAt: run.createdAt,
      totalCandidates: Number(run.totalStudents ?? 0),
      groups: groups.map((group) => ({
        runGroupId: String(group.id),
        sourceGroupId: group.sourceGroupId ? String(group.sourceGroupId) : null,
        code: group.groupCode ? String(group.groupCode) : null,
        displayName: group.groupName ? String(group.groupName) : null,
        index: Number(group.groupIndex ?? 0),
        assignedCount: Number(group.studentCount ?? 0),
        capacity: group.capacitySnapshot === null ? null : Number(group.capacitySnapshot),
        students: byGroup.get(String(group.id)) ?? [],
      })),
      pending,
      summary: {
        assignedCount: assignedRows.length,
        pendingCount: pending.length,
      },
    };
  }

  async getLatestAppliedView(workshopId: string) {
    const workshop = await this.get(workshopId, false);
    const run = await this.getLatestAssignmentRunOrThrow(workshopId);
    return this.buildAppliedRunView(workshop, run);
  }

  async getAssignmentRunStudentGroupOptions(
    workshopId: string,
    runId: string,
    studentId: string
  ) {
    const run = await this.getAssignmentRunRowOrThrow(workshopId, runId);
    const normalizedStudentId = this.normalize(studentId);
    if (!normalizedStudentId) {
      throw new BadRequestException('Alumno invalido');
    }

    const assignment = await this.dataSource
      .query(
        `
        SELECT
          was.groupId AS currentRunGroupId,
          u.id AS studentId,
          u.dni AS dni,
          u.codigoAlumno AS codigoAlumno,
          u.fullName AS fullName,
          se.careerName AS careerName,
          se.campusName AS campusName
        FROM workshop_application_students was
        INNER JOIN users u ON BINARY u.id = BINARY was.studentId
        LEFT JOIN student_enrollments se
          ON BINARY se.studentId = BINARY was.studentId
         AND BINARY se.periodId = BINARY ?
        WHERE BINARY was.applicationId = BINARY ?
          AND BINARY was.studentId = BINARY ?
        LIMIT 1
        `,
        [run.periodId, run.id, normalizedStudentId]
      )
      .then((rows) => rows[0] ?? null);
    if (!assignment?.studentId || !assignment?.currentRunGroupId) {
      throw new NotFoundException('Alumno no asignado en la aplicacion del taller');
    }

    const appliedRun = await this.buildAppliedRunView(
      await this.get(workshopId, false),
      run
    );
    const loadByStudent = await this.loadStudentLevelingSchedule([normalizedStudentId], run.periodId);
    const studentLoad = loadByStudent.get(normalizedStudentId) ?? {
      blocks: [] as StudentScheduleWindow[],
      loadCourses: 0,
    };

    const groups = appliedRun.groups.map((group) => {
      const overlaps = this.findOverlappingBlocks(
        studentLoad.blocks,
        group.scheduleBlocks ?? []
      );
      const isCurrent = group.runGroupId === String(assignment.currentRunGroupId);
      const nextAssignedCount = isCurrent ? group.assignedCount : group.assignedCount + 1;
      const wouldBeOverCapacity =
        group.capacity !== null &&
        group.capacity !== undefined &&
        nextAssignedCount > Number(group.capacity);
      const conflictDetail =
        overlaps.length > 0
          ? overlaps
              .map((overlap) => {
                const workshopBlock = this.formatScheduleBlock(overlap.groupBlock);
                const studentBlock = this.formatScheduleBlock(
                  overlap.studentBlock,
                  overlap.studentBlock.label
                );
                return `${workshopBlock} cruza con ${studentBlock}`;
              })
              .join(' | ')
          : null;
      return {
        runGroupId: group.runGroupId,
        sourceGroupId: group.sourceGroupId,
        code: group.code,
        displayName: group.displayName,
        assignedCount: group.assignedCount,
        capacity: group.capacity,
        wouldBeOverCapacity,
        scheduleBlocks: group.scheduleBlocks ?? [],
        hasConflict: overlaps.length > 0,
        conflictDetail,
        selectable: !isCurrent && overlaps.length === 0,
        isCurrent,
      };
    });

    return {
      runId: run.id,
      workshopId: run.workshopId,
      student: {
        studentId: String(assignment.studentId),
        dni: assignment.dni ? String(assignment.dni) : null,
        codigoAlumno: assignment.codigoAlumno ? String(assignment.codigoAlumno) : null,
        fullName: String(assignment.fullName ?? ''),
        careerName: assignment.careerName ? String(assignment.careerName) : null,
        campusName: assignment.campusName ? String(assignment.campusName) : null,
      },
      currentRunGroupId: String(assignment.currentRunGroupId),
      groups,
    };
  }

  async changeAssignmentRunStudentGroup(
    workshopId: string,
    runId: string,
    studentId: string,
    body: { targetRunGroupId?: string | null }
  ) {
    const run = await this.getAssignmentRunRowOrThrow(workshopId, runId);
    const normalizedStudentId = this.normalize(studentId);
    const targetRunGroupId = this.normalize(body?.targetRunGroupId);
    if (!normalizedStudentId || !targetRunGroupId) {
      throw new BadRequestException('Alumno o grupo destino invalido');
    }

    const currentAssignment = await this.dataSource
      .query(
        `
        SELECT groupId
        FROM workshop_application_students
        WHERE applicationId = ?
          AND studentId = ?
        LIMIT 1
        `,
        [run.id, normalizedStudentId]
      )
      .then((rows) => rows[0] ?? null);
    if (!currentAssignment?.groupId) {
      throw new NotFoundException('Alumno no asignado en la aplicacion del taller');
    }
    if (String(currentAssignment.groupId) === targetRunGroupId) {
      throw new BadRequestException('El alumno ya pertenece al grupo seleccionado');
    }

    const targetGroup = await this.dataSource
      .query(
        `
        SELECT id
        FROM workshop_application_groups
        WHERE id = ?
          AND applicationId = ?
        LIMIT 1
        `,
        [targetRunGroupId, run.id]
      )
      .then((rows) => rows[0] ?? null);
    if (!targetGroup?.id) {
      throw new NotFoundException('Grupo destino no encontrado en la aplicacion');
    }

    const options = await this.getAssignmentRunStudentGroupOptions(
      workshopId,
      runId,
      normalizedStudentId
    );
    const selectedGroup = options.groups.find((group) => group.runGroupId === targetRunGroupId);
    if (!selectedGroup) {
      throw new NotFoundException('Grupo destino no encontrado en la aplicacion');
    }
    if (selectedGroup.hasConflict) {
      throw new ConflictException({
        message: 'El grupo destino genera cruce de horario con nivelacion',
        code: 'WORKSHOP_GROUP_CHANGE_CONFLICT',
        summary: {
          affectedStudents: 1,
          totalConflicts: 1,
        },
        students: [
          {
            studentId: options.student.studentId,
            fullName: options.student.fullName,
            codigoAlumno: options.student.codigoAlumno,
            conflicts: [
              {
                reason: selectedGroup.conflictDetail,
                groupName: selectedGroup.displayName || selectedGroup.code || 'Grupo',
              },
            ],
          },
        ],
      });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE workshop_application_students
        SET groupId = ?
        WHERE applicationId = ?
          AND studentId = ?
        `,
        [targetRunGroupId, run.id, normalizedStudentId]
      );

      await manager.query(
        `
        UPDATE workshop_application_groups wag
        SET studentCount = (
          SELECT COUNT(*)
          FROM workshop_application_students was
          WHERE was.groupId = wag.id
        )
        WHERE wag.id IN (?, ?)
        `,
        [String(currentAssignment.groupId), targetRunGroupId]
      );
    });

    return {
      ok: true,
      runId: run.id,
      workshopId: run.workshopId,
      studentId: normalizedStudentId,
      targetRunGroupId,
    };
  }

  async getAssignmentRunPending(workshopId: string, runId: string) {
    const run = await this.dataSource
      .query(
        `
        SELECT id, periodId
        FROM workshop_applications
        WHERE id = ? AND workshopId = ?
        LIMIT 1
        `,
        [runId, workshopId]
      )
      .then((rows) => rows[0]);
    if (!run) throw new NotFoundException('Run de taller no encontrado');

    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        p.id,
        p.studentId,
        p.reasonCode,
        p.reasonDetail,
        u.dni,
        u.codigoAlumno,
        u.email,
        u.fullName,
        se.careerName,
        se.campusName
      FROM workshop_assignment_pending p
      INNER JOIN users u ON BINARY u.id = BINARY p.studentId
      LEFT JOIN student_enrollments se
        ON BINARY se.studentId = BINARY p.studentId
       AND BINARY se.periodId = BINARY ?
      WHERE BINARY p.applicationId = BINARY ?
      ORDER BY u.fullName ASC
      `,
      [run.periodId, runId]
    );

    return rows.map((row) => ({
      id: String(row.id),
      studentId: String(row.studentId),
      dni: row.dni ? String(row.dni) : null,
      codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
      email: row.email ? String(row.email) : null,
      fullName: String(row.fullName ?? ''),
      careerName: row.careerName ? String(row.careerName) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      reasonCode: String(row.reasonCode ?? '') as PendingReasonCode,
      reasonDetail: row.reasonDetail ? String(row.reasonDetail) : null,
    }));
  }

  private async getLatestAssignmentRunOrThrow(workshopId: string) {
    const row = await this.dataSource
      .query(
        `
        SELECT *
        FROM workshop_applications
        WHERE workshopId = ?
        ORDER BY createdAt DESC, id DESC
        LIMIT 1
        `,
        [workshopId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.id) {
      throw new BadRequestException('El taller aun no tiene una aplicacion');
    }
    return {
      id: String(row.id),
      workshopId: String(row.workshopId),
      periodId: String(row.periodId),
      name: String(row.name ?? ''),
      createdAt: row.createdAt,
      totalStudents: Number(row.totalStudents ?? 0),
      deliveryMode: String(row.deliveryMode ?? 'VIRTUAL'),
      venueCampusName: row.venueCampusName ? String(row.venueCampusName) : null,
      responsibleTeacherId: row.responsibleTeacherId
        ? String(row.responsibleTeacherId)
        : null,
      responsibleTeacherDni: row.responsibleTeacherDni
        ? String(row.responsibleTeacherDni)
        : null,
      responsibleTeacherName: row.responsibleTeacherName
        ? String(row.responsibleTeacherName)
        : null,
    };
  }

  private async getAssignmentRunRowOrThrow(workshopId: string, runId: string) {
    const row = await this.dataSource
      .query(
        `
        SELECT *
        FROM workshop_applications
        WHERE id = ? AND workshopId = ?
        LIMIT 1
        `,
        [runId, workshopId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.id) {
      throw new NotFoundException('Run de taller no encontrado');
    }
    return {
      id: String(row.id),
      workshopId: String(row.workshopId),
      periodId: String(row.periodId),
      name: String(row.name ?? ''),
      createdAt: row.createdAt,
      totalStudents: Number(row.totalStudents ?? 0),
      deliveryMode: String(row.deliveryMode ?? 'VIRTUAL'),
      venueCampusName: row.venueCampusName ? String(row.venueCampusName) : null,
      responsibleTeacherId: row.responsibleTeacherId
        ? String(row.responsibleTeacherId)
        : null,
      responsibleTeacherDni: row.responsibleTeacherDni
        ? String(row.responsibleTeacherDni)
        : null,
      responsibleTeacherName: row.responsibleTeacherName
        ? String(row.responsibleTeacherName)
        : null,
    };
  }

  private async buildAppliedRunView(
    workshop: any,
    run: {
      id: string;
      workshopId: string;
      periodId: string;
      name: string;
      createdAt: unknown;
      totalStudents: number;
      deliveryMode: string;
      venueCampusName: string | null;
      responsibleTeacherId: string | null;
      responsibleTeacherDni: string | null;
      responsibleTeacherName: string | null;
    }
  ) {
    const groupRows: any[] = await this.dataSource.query(
      `
      SELECT
        wag.id AS runGroupId,
        wag.sourceGroupId AS sourceGroupId,
        wag.groupCode AS groupCode,
        wag.groupName AS groupName,
        wag.groupIndex AS groupIndex,
        wag.studentCount AS studentCount,
        wag.capacitySnapshot AS capacitySnapshot
      FROM workshop_application_groups wag
      WHERE wag.applicationId = ?
      ORDER BY wag.groupIndex ASC, wag.createdAt ASC
      `,
      [run.id]
    );

    const assignedRows: any[] = await this.dataSource.query(
      `
      SELECT
        was.groupId AS runGroupId,
        was.studentId AS studentId,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        se.careerName AS careerName,
        se.campusName AS campusName
      FROM workshop_application_students was
      INNER JOIN users u ON BINARY u.id = BINARY was.studentId
      LEFT JOIN student_enrollments se
        ON BINARY se.studentId = BINARY was.studentId
       AND BINARY se.periodId = BINARY ?
      WHERE BINARY was.applicationId = BINARY ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [run.periodId, run.id]
    );

    const scheduleBySourceGroup = await this.loadScheduleBlocksBySourceGroup(
      Array.from(
        new Set(
          groupRows
            .map((row) => this.normalize(row.sourceGroupId))
            .filter(Boolean)
        )
      )
    );
    const pending = await this.getAssignmentRunPending(workshop.id, run.id);

    const studentsByGroup = new Map<string, any[]>();
    for (const row of assignedRows) {
      const key = String(row.runGroupId);
      if (!studentsByGroup.has(key)) studentsByGroup.set(key, []);
      studentsByGroup.get(key)!.push({
        studentId: String(row.studentId),
        dni: row.dni ? String(row.dni) : null,
        codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
        fullName: String(row.fullName ?? ''),
        careerName: row.careerName ? String(row.careerName) : null,
        campusName: row.campusName ? String(row.campusName) : null,
      });
    }

    const loadByStudent = await this.loadStudentLevelingSchedule(
      assignedRows.map((row) => String(row.studentId)),
      run.periodId
    );

    const groups = groupRows.map((row) => ({
      runGroupId: String(row.runGroupId),
      sourceGroupId: row.sourceGroupId ? String(row.sourceGroupId) : null,
      code: row.groupCode ? String(row.groupCode) : null,
      displayName: row.groupName ? String(row.groupName) : null,
      index: Number(row.groupIndex ?? 0),
      assignedCount: Number(row.studentCount ?? 0),
      capacity: row.capacitySnapshot === null ? null : Number(row.capacitySnapshot),
      scheduleBlocks:
        scheduleBySourceGroup.get(String(row.sourceGroupId ?? ''))?.map((block) => ({
          dayOfWeek: block.dayOfWeek,
          startTime: block.startTime,
          endTime: block.endTime,
          startDate: block.startDate,
          endDate: block.endDate,
        })) ?? [],
      students: studentsByGroup.get(String(row.runGroupId)) ?? [],
    }));

    const currentConflicts: Array<{
      workshopName: string;
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string | null;
      campusName: string | null;
      runGroupId: string;
      sourceGroupId: string | null;
      groupName: string | null;
      workshopBlockText: string;
      levelingBlockText: string;
    }> = [];

    for (const group of groups) {
      for (const student of group.students) {
        const studentLoad = loadByStudent.get(student.studentId) ?? {
          blocks: [] as StudentScheduleWindow[],
          loadCourses: 0,
        };
        const overlaps = this.findOverlappingBlocks(
          studentLoad.blocks,
          group.scheduleBlocks ?? []
        );
        for (const overlap of overlaps) {
          currentConflicts.push({
            workshopName: String(workshop.name ?? ''),
            studentId: student.studentId,
            dni: student.dni,
            codigoAlumno: student.codigoAlumno,
            fullName: student.fullName,
            careerName: student.careerName ?? null,
            campusName: student.campusName ?? null,
            runGroupId: group.runGroupId,
            sourceGroupId: group.sourceGroupId,
            groupName: group.displayName || group.code || null,
            workshopBlockText: this.formatScheduleBlock(overlap.groupBlock),
            levelingBlockText: this.formatScheduleBlock(
              overlap.studentBlock,
              overlap.studentBlock.label
            ),
          });
        }
      }
    }

    const affectedStudents = new Set(currentConflicts.map((row) => row.studentId)).size;

    return {
      workshop,
      run: {
        runId: run.id,
        workshopId: run.workshopId,
        periodId: run.periodId,
        createdAt: run.createdAt,
        totalCandidates: Number(run.totalStudents ?? 0),
      },
      groups,
      pending,
      summary: {
        assignedCount: assignedRows.length,
        pendingCount: pending.length,
        groupsCount: groups.length,
        conflictingStudents: affectedStudents,
        totalConflicts: currentConflicts.length,
      },
      currentConflicts,
    };
  }

  private async findWorkshopGroupScheduleStudentConflicts(params: {
    workshopId: string;
    groupId: string;
    blocks: WorkshopScheduleBlockInput[];
  }) {
    const workshop = await this.get(params.workshopId, false);
    const latestRun = await this.dataSource
      .query(
        `
        SELECT
          wa.id AS runId,
          wa.periodId AS periodId,
          wag.id AS runGroupId
        FROM workshop_applications wa
        INNER JOIN workshop_application_groups wag
          ON wag.applicationId = wa.id
        WHERE wa.workshopId = ?
          AND wag.sourceGroupId = ?
          AND wa.id = (
            SELECT wa2.id
            FROM workshop_applications wa2
            WHERE wa2.workshopId = wa.workshopId
            ORDER BY wa2.createdAt DESC, wa2.id DESC
            LIMIT 1
          )
        LIMIT 1
        `,
        [params.workshopId, params.groupId]
      )
      .then((rows) => rows[0] ?? null);
    if (!latestRun?.runId || !latestRun?.runGroupId) {
      return null;
    }

    const students: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
    }> = await this.dataSource.query(
      `
      SELECT
        was.studentId AS studentId,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName
      FROM workshop_application_students was
      INNER JOIN users u ON BINARY u.id = BINARY was.studentId
      WHERE BINARY was.applicationId = BINARY ?
        AND BINARY was.groupId = BINARY ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [String(latestRun.runId), String(latestRun.runGroupId)]
    );
    if (students.length === 0 || params.blocks.length === 0) {
      return null;
    }

    const normalizedBlocks = params.blocks.map((block) => ({
      dayOfWeek: Number(block.dayOfWeek),
      startTime: this.toHHmm(String(block.startTime ?? '')),
      endTime: this.toHHmm(String(block.endTime ?? '')),
      startDate: this.normalizeIsoDateOnly(block.startDate) ?? null,
      endDate: this.normalizeIsoDateOnly(block.endDate) ?? null,
    }));
    const loadByStudent = await this.loadStudentLevelingSchedule(
      students.map((student) => student.studentId),
      String(latestRun.periodId)
    );

    const conflictStudents = students
      .map((student) => {
        const studentLoad = loadByStudent.get(student.studentId) ?? {
          blocks: [] as StudentScheduleWindow[],
          loadCourses: 0,
        };
        const overlaps = this.findOverlappingBlocks(studentLoad.blocks, normalizedBlocks);
        return {
          ...student,
          overlaps,
        };
      })
      .filter((student) => student.overlaps.length > 0);

    if (conflictStudents.length <= 0) {
      return null;
    }

    return {
      workshopName: String(workshop?.name ?? ''),
      message:
        conflictStudents.length === 1
          ? 'No se puede guardar el horario del grupo: 1 alumno presenta cruce con nivelacion.'
          : `No se puede guardar el horario del grupo: ${conflictStudents.length} alumnos presentan cruces con nivelacion.`,
      code: 'WORKSHOP_GROUP_SCHEDULE_CONFLICT',
      summary: {
        affectedStudents: conflictStudents.length,
        totalConflicts: conflictStudents.reduce(
          (total, student) => total + student.overlaps.length,
          0
        ),
      },
      students: conflictStudents.slice(0, 10).map((student) => ({
        studentId: student.studentId,
        dni: student.dni,
        codigoAlumno: student.codigoAlumno,
        fullName: student.fullName,
        conflicts: student.overlaps.slice(0, 5).map((overlap) => ({
          workshopBlock: this.formatScheduleBlock(overlap.groupBlock),
          levelingBlock: this.formatScheduleBlock(
            overlap.studentBlock,
            overlap.studentBlock.label
          ),
        })),
      })),
    };
  }

  async buildLatestAppliedGroupsExportWorkbook(workshopId: string) {
    const run = await this.dataSource
      .query(
        `
        SELECT
          id,
          workshopId,
          periodId,
          name,
          createdAt,
          totalStudents,
          responsibleTeacherName,
          responsibleTeacherDni
        FROM workshop_applications
        WHERE workshopId = ?
        ORDER BY createdAt DESC, id DESC
        LIMIT 1
        `,
        [workshopId]
      )
      .then((rows) => rows[0] ?? null);
    if (!run?.id) {
      throw new BadRequestException('El taller aun no tiene una aplicacion para exportar');
    }

    const groups: Array<{
      id: string;
      groupCode: string | null;
      groupName: string | null;
      groupIndex: number;
      studentCount: number;
      capacitySnapshot: number | null;
      dayOfWeek: number | null;
      startTime: string | null;
      endTime: string | null;
      venueDetails: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        id,
        groupCode,
        groupName,
        groupIndex,
        studentCount,
        capacitySnapshot,
        dayOfWeek,
        startTime,
        endTime,
        venueDetails
      FROM workshop_application_groups
      WHERE applicationId = ?
      ORDER BY groupIndex ASC, createdAt ASC
      `,
      [run.id]
    );

    const assigned: Array<{
      groupId: string;
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      email: string | null;
      fullName: string;
      careerName: string | null;
      campusName: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        was.groupId,
        was.studentId,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.email AS email,
        u.fullName AS fullName,
        se.careerName AS careerName,
        se.campusName AS campusName
      FROM workshop_application_students was
      INNER JOIN users u ON BINARY u.id = BINARY was.studentId
      LEFT JOIN student_enrollments se
        ON BINARY se.studentId = BINARY was.studentId
       AND BINARY se.periodId = BINARY ?
      WHERE BINARY was.applicationId = BINARY ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [run.periodId, run.id]
    );

    const pending = await this.getAssignmentRunPending(workshopId, String(run.id));
    const assignedByGroup = new Map<string, typeof assigned>();
    for (const row of assigned) {
      const key = String(row.groupId);
      if (!assignedByGroup.has(key)) assignedByGroup.set(key, []);
      assignedByGroup.get(key)!.push(row);
    }

    const workbook = XLSX.utils.book_new();
    const summaryRows: Array<Array<string | number>> = [
      ['EXPORTACION DE TALLER POR GRUPOS'],
      [],
      ['Taller', String(run.name ?? '')],
      [
        'Responsable',
        run.responsibleTeacherName
          ? `${String(run.responsibleTeacherName)}${run.responsibleTeacherDni ? ` (${String(run.responsibleTeacherDni)})` : ''}`
          : 'Sin responsable',
      ],
      ['Fecha aplicacion', this.normalizeExcelDateTime(run.createdAt)],
      ['Candidatos', Number(run.totalStudents ?? 0)],
      ['Asignados', assigned.length],
      ['Pendientes', pending.length],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

    for (const group of groups) {
      const groupStudents = assignedByGroup.get(String(group.id)) ?? [];
      const rows: Array<Array<string | number>> = [
        ['Grupo', group.groupName ? String(group.groupName) : `Grupo ${Number(group.groupIndex ?? 0)}`],
        ['Codigo', group.groupCode ? String(group.groupCode) : '-'],
        ['Horario', this.buildApplicationGroupScheduleSummary(group)],
        ['Capacidad', group.capacitySnapshot === null ? '-' : Number(group.capacitySnapshot)],
        ['Asignados', groupStudents.length],
        [],
        ['Grupo', 'DNI', 'Codigo', 'Alumno', 'Carrera', 'Sede', 'Correo institucional'],
      ];
      for (const student of groupStudents) {
        rows.push([
          group.groupName ? String(group.groupName) : `Grupo ${Number(group.groupIndex ?? 0)}`,
          student.dni ? String(student.dni) : '',
          student.codigoAlumno ? String(student.codigoAlumno) : '',
          String(student.fullName ?? ''),
          student.careerName ? String(student.careerName) : 'SIN CARRERA',
          student.campusName ? String(student.campusName) : 'SIN SEDE',
          student.email ? String(student.email) : '',
        ]);
      }
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 42 },
        { wch: 30 },
        { wch: 22 },
        { wch: 34 },
      ];
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        this.toWorksheetName(group.groupName ? String(group.groupName) : `Grupo ${Number(group.groupIndex ?? 0)}`)
      );
    }

    if (pending.length > 0) {
      const pendingRows: Array<Array<string>> = [
        ['DNI', 'Codigo', 'Alumno', 'Carrera', 'Sede', 'Correo institucional', 'Motivo', 'Detalle'],
      ];
      for (const row of pending) {
        pendingRows.push([
          row.dni ? String(row.dni) : '',
          row.codigoAlumno ? String(row.codigoAlumno) : '',
          String(row.fullName ?? ''),
          row.careerName ? String(row.careerName) : 'SIN CARRERA',
          row.campusName ? String(row.campusName) : 'SIN SEDE',
          row.email ? String(row.email) : '',
          String(row.reasonCode ?? ''),
          row.reasonDetail ? String(row.reasonDetail) : '',
        ]);
      }
      const pendingSheet = XLSX.utils.aoa_to_sheet(pendingRows);
      pendingSheet['!cols'] = [
        { wch: 16 },
        { wch: 18 },
        { wch: 42 },
        { wch: 30 },
        { wch: 22 },
        { wch: 34 },
        { wch: 22 },
        { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(workbook, pendingSheet, 'Pendientes');
    }

    return {
      fileBuffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      fileName: this.buildWorkshopGroupsExportFileName(
        String(run.name ?? 'taller'),
        this.normalizeIsoDateOnly(run.createdAt) ?? 'aplicacion'
      ),
    };
  }

  async listTeacherScheduleItems(teacherId: string) {
    const groups = await this.listTeacherWorkshops(teacherId);
    return groups.flatMap((group) =>
      group.scheduleBlocks.map((block: GroupScheduleBlock) => ({
        id: block.id,
        scheduleBlockId: block.id,
        kind: 'WORKSHOP' as const,
        workshopId: group.workshopId,
        applicationId: group.applicationId,
        applicationGroupId: group.applicationGroupId,
        groupName: group.groupName,
        courseName: group.workshopName,
        sectionName: group.groupName,
        teacherName: group.responsibleTeacherName,
        modality: group.deliveryMode,
        classroomCode: null,
        classroomName: null,
        zoomMeetingRecordId: block.zoomMeetingRecordId ?? null,
        joinUrl: block.joinUrl ?? null,
        startUrl: block.startUrl ?? null,
        location: group.deliveryMode === 'PRESENCIAL' ? group.venueCampusName : 'VIRTUAL',
        referenceModality: group.deliveryMode,
        referenceClassroom:
          group.deliveryMode === 'PRESENCIAL' ? group.venueCampusName : 'VIRTUAL',
        dayOfWeek: block.dayOfWeek,
        startTime: this.toHHmm(block.startTime),
        endTime: this.toHHmm(block.endTime),
        startDate: block.startDate,
        endDate: block.endDate,
      }))
    );
  }

  async listStudentScheduleItems(studentId: string) {
    const groups = await this.listStudentWorkshops(studentId);
    return groups.flatMap((group) =>
      group.scheduleBlocks.map((block: GroupScheduleBlock) => ({
        id: block.id,
        scheduleBlockId: block.id,
        kind: 'WORKSHOP' as const,
        workshopId: group.workshopId,
        applicationId: group.applicationId,
        applicationGroupId: group.applicationGroupId,
        groupName: group.groupName,
        courseName: group.workshopName,
        sectionName: group.groupName,
        teacherName: group.responsibleTeacherName,
        modality: group.deliveryMode,
        classroomCode: null,
        classroomName: null,
        zoomMeetingRecordId: block.zoomMeetingRecordId ?? null,
        joinUrl: block.joinUrl ?? null,
        startUrl: null,
        location: group.deliveryMode === 'PRESENCIAL' ? group.venueCampusName : 'VIRTUAL',
        referenceModality: group.deliveryMode,
        referenceClassroom:
          group.deliveryMode === 'PRESENCIAL' ? group.venueCampusName : 'VIRTUAL',
        dayOfWeek: block.dayOfWeek,
        startTime: this.toHHmm(block.startTime),
        endTime: this.toHHmm(block.endTime),
        startDate: block.startDate,
        endDate: block.endDate,
      }))
    );
  }

  async listTeacherWorkshops(teacherId: string) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        wa.id AS applicationId,
        wa.workshopId AS workshopId,
        wa.name AS workshopName,
        wa.deliveryMode AS deliveryMode,
        wa.venueCampusName AS venueCampusName,
        wa.responsibleTeacherName AS responsibleTeacherName,
        wag.id AS applicationGroupId,
        wag.sourceGroupId AS sourceGroupId,
        wag.groupCode AS groupCode,
        wag.groupName AS groupName,
        wag.groupIndex AS groupIndex,
        wag.studentCount AS studentCount
      FROM workshop_applications wa
      INNER JOIN workshop_application_groups wag ON wag.applicationId = wa.id
      WHERE wa.periodId = ?
        AND wa.responsibleTeacherId = ?
        AND wa.id = (
          SELECT wa2.id
          FROM workshop_applications wa2
          WHERE wa2.workshopId = wa.workshopId
          ORDER BY wa2.createdAt DESC, wa2.id DESC
          LIMIT 1
        )
      ORDER BY wa.name ASC, wag.groupIndex ASC, wag.groupName ASC
      `,
      [periodId, teacherId]
    );
    return this.attachScheduleToWorkshopGroups(rows);
  }

  async listTeacherWorkshopGroups(teacherId: string, applicationId: string) {
    const groups = await this.listTeacherWorkshops(teacherId);
    return groups.filter((group) => group.applicationId === applicationId);
  }

  async getTeacherWorkshopAttendance(
    teacherId: string,
    applicationGroupId: string,
    sessionDate: string
  ) {
    const context = await this.loadTeacherWorkshopAttendanceContextOrThrow(
      teacherId,
      applicationGroupId
    );
    const date = this.normalizeIsoDateOnly(sessionDate);
    if (!date) {
      throw new BadRequestException('Fecha invalida');
    }
    if (!this.isDateAllowedForScheduleBlocks(date, context.scheduleBlocks)) {
      throw new BadRequestException(
        'La fecha no coincide con el horario configurado del grupo'
      );
    }

    const session = await this.findWorkshopAttendanceSession(
      context.applicationId,
      applicationGroupId,
      date
    );
    const students = await this.loadWorkshopGroupStudents(
      context.applicationId,
      applicationGroupId,
      context.periodId
    );
    const records = session
      ? await this.dataSource.query(
          `
          SELECT studentId, status, notes
          FROM workshop_attendance_records
          WHERE sessionId = ?
          `,
          [session.id]
        )
      : [];
    const recordByStudent = new Map<string, { status: AttendanceStatus; notes: string | null }>(
      records.map((row: any) => [
        String(row.studentId),
        {
          status: this.normalizeAttendanceStatus(row.status),
          notes: row.notes ? String(row.notes) : null,
        },
      ])
    );

    return {
      applicationId: context.applicationId,
      applicationGroupId,
      workshopId: context.workshopId,
      workshopName: context.workshopName,
      groupName: context.groupName,
      sessionDate: date,
      scheduleBlocks: context.scheduleBlocks,
      students: students.map((student) => ({
        ...student,
        status: recordByStudent.get(student.id)?.status ?? AttendanceStatus.FALTO,
        notes: recordByStudent.get(student.id)?.notes ?? null,
      })),
    };
  }

  async saveTeacherWorkshopAttendance(params: {
    teacherId: string;
    applicationGroupId: string;
    sessionDate: string;
    items: WorkshopAttendanceSaveItem[];
  }) {
    const context = await this.loadTeacherWorkshopAttendanceContextOrThrow(
      params.teacherId,
      params.applicationGroupId
    );
    const date = this.normalizeIsoDateOnly(params.sessionDate);
    if (!date) {
      throw new BadRequestException('Fecha invalida');
    }
    if (!this.isDateAllowedForScheduleBlocks(date, context.scheduleBlocks)) {
      throw new BadRequestException(
        'La fecha no coincide con el horario configurado del grupo'
      );
    }

    const students = await this.loadWorkshopGroupStudents(
      context.applicationId,
      params.applicationGroupId,
      context.periodId
    );
    const validStudentIds = new Set(students.map((student) => student.id));
    const items = Array.isArray(params.items) ? params.items : [];
    for (const item of items) {
      const studentId = this.normalize(item.studentId);
      if (!validStudentIds.has(studentId)) {
        throw new BadRequestException('Alumno invalido para este grupo de taller');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      let session = await manager
        .query(
          `
          SELECT id
          FROM workshop_attendance_sessions
          WHERE applicationId = ?
            AND applicationGroupId = ?
            AND sessionDate = ?
          LIMIT 1
          `,
          [context.applicationId, params.applicationGroupId, date]
        )
        .then((rows) => rows[0]);

      if (!session?.id) {
        const sessionId = randomUUID();
        await manager.query(
          `
          INSERT INTO workshop_attendance_sessions (
            id, applicationId, applicationGroupId, sessionDate, createdById, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))
          `,
          [
            sessionId,
            context.applicationId,
            params.applicationGroupId,
            date,
            params.teacherId,
          ]
        );
        session = { id: sessionId };
      }

      for (const item of items) {
        const status = this.normalizeAttendanceStatus(item.status);
        const notes = this.normalize(item.notes ?? null) || null;
        const existing = await manager
          .query(
            `
            SELECT id
            FROM workshop_attendance_records
            WHERE sessionId = ? AND studentId = ?
            LIMIT 1
            `,
            [session.id, item.studentId]
          )
          .then((rows) => rows[0]);

        if (existing?.id) {
          await manager.query(
            `
            UPDATE workshop_attendance_records
            SET status = ?, notes = ?, updatedById = ?, updatedAt = NOW(6)
            WHERE id = ?
            `,
            [status, notes, params.teacherId, existing.id]
          );
        } else {
          await manager.query(
            `
            INSERT INTO workshop_attendance_records (
              id, sessionId, studentId, status, notes, updatedById, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
            `,
            [
              randomUUID(),
              session.id,
              item.studentId,
              status,
              notes,
              params.teacherId,
            ]
          );
        }
      }
    });

    return this.getTeacherWorkshopAttendance(
      params.teacherId,
      params.applicationGroupId,
      date
    );
  }

  async listStudentWorkshops(studentId: string) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        wa.id AS applicationId,
        wa.workshopId AS workshopId,
        wa.name AS workshopName,
        wa.deliveryMode AS deliveryMode,
        wa.venueCampusName AS venueCampusName,
        wa.responsibleTeacherName AS responsibleTeacherName,
        wag.id AS applicationGroupId,
        wag.sourceGroupId AS sourceGroupId,
        wag.groupCode AS groupCode,
        wag.groupName AS groupName,
        wag.groupIndex AS groupIndex,
        wag.studentCount AS studentCount
      FROM workshop_application_students was
      INNER JOIN workshop_application_groups wag ON wag.id = was.groupId
      INNER JOIN workshop_applications wa ON wa.id = was.applicationId
      WHERE was.studentId = ?
        AND wa.periodId = ?
        AND wa.id = (
          SELECT wa2.id
          FROM workshop_applications wa2
          WHERE wa2.workshopId = wa.workshopId
          ORDER BY wa2.createdAt DESC, wa2.id DESC
          LIMIT 1
        )
      ORDER BY wa.name ASC, wag.groupIndex ASC, wag.groupName ASC
      `,
      [studentId, periodId]
    );
    return this.attachScheduleToWorkshopGroups(rows);
  }

  async listStudentWorkshopAttendance(
    studentId: string,
    applicationGroupId?: string | null
  ) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const normalizedGroupId = this.normalize(applicationGroupId);
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        wa.id AS applicationId,
        wag.id AS applicationGroupId,
        wa.name AS workshopName,
        wag.groupName AS groupName,
        ws.sessionDate AS sessionDate,
        wr.status AS status
      FROM workshop_application_students was
      INNER JOIN workshop_application_groups wag ON wag.id = was.groupId
      INNER JOIN workshop_applications wa ON wa.id = was.applicationId
      INNER JOIN workshop_attendance_sessions ws
        ON ws.applicationId = wa.id
       AND ws.applicationGroupId = wag.id
      INNER JOIN workshop_attendance_records wr
        ON wr.sessionId = ws.id
       AND wr.studentId = was.studentId
      WHERE was.studentId = ?
        AND wa.periodId = ?
        AND wa.id = (
          SELECT wa2.id
          FROM workshop_applications wa2
          WHERE wa2.workshopId = wa.workshopId
          ORDER BY wa2.createdAt DESC, wa2.id DESC
          LIMIT 1
        )
        ${normalizedGroupId ? 'AND wag.id = ?' : ''}
      ORDER BY ws.sessionDate DESC, wa.name ASC
      `,
      normalizedGroupId ? [studentId, periodId, normalizedGroupId] : [studentId, periodId]
    );

    return rows.map((row) => ({
      kind: 'WORKSHOP' as const,
      courseName: String(row.workshopName ?? ''),
      sessionDate: this.normalizeIsoDateOnly(row.sessionDate),
      status: this.normalizeAttendanceStatus(row.status),
      sectionCourseId: null,
      sectionName: null,
      applicationId: String(row.applicationId),
      applicationGroupId: String(row.applicationGroupId),
      groupName: row.groupName ? String(row.groupName) : null,
    }));
  }

  private async loadStudentsForWorkshop(workshop: any) {
    if (workshop.selectionMode === 'MANUAL') {
      const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
      const ids = await this.loadStudentIds(workshop.id);
      if (ids.length === 0) return [];
      return this.dataSource.query(
        `
        SELECT
          u.id AS studentId,
          u.dni,
          u.codigoAlumno,
          u.fullName,
          TRIM(REPLACE(REPLACE(se.careerName, '\\r', ''), '\\n', '')) AS careerName,
          TRIM(se.facultyGroup) AS facultyGroup,
          TRIM(se.campusName) AS campusName
        FROM users u
        LEFT JOIN student_enrollments se
          ON BINARY se.studentId = BINARY u.id
         AND BINARY se.periodId = BINARY ?
        WHERE u.id IN (${ids.map(() => '?').join(', ')})
        ORDER BY u.fullName ASC
        `,
        [periodId, ...ids]
      );
    }
    return this.listStudents({
      facultyGroup: workshop.facultyGroups?.length ? workshop.facultyGroups : workshop.facultyGroup ?? undefined,
      campusName: workshop.campusNames?.length ? workshop.campusNames : workshop.campusName ?? undefined,
      careerName: workshop.careerNames?.length ? workshop.careerNames : workshop.careerName ?? undefined,
    });
  }

  private async loadStudentLevelingSchedule(studentIds: string[], periodId: string) {
    const unique = Array.from(new Set((studentIds ?? []).map((id) => String(id).trim()).filter(Boolean)));
    const result = new Map<string, {
      blocks: Array<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
        label: string | null;
      }>;
      loadCourses: number;
    }>();
    if (unique.length === 0) return result;

    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        ssc.studentId AS studentId,
        sb.dayOfWeek AS dayOfWeek,
        sb.startTime AS startTime,
        sb.endTime AS endTime,
        sb.startDate AS startDate,
        sb.endDate AS endDate,
        sb.courseName AS courseName,
        sec.name AS sectionName,
        ssc.sectionCourseId AS sectionCourseId
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      INNER JOIN sections sec ON sec.id = sb.sectionId
      WHERE sc.periodId = ?
        AND ssc.studentId IN (${unique.map(() => '?').join(', ')})
      `,
      [periodId, ...unique]
    );

    const byStudentCourses = new Map<string, Set<string>>();
    for (const row of rows) {
      const studentId = String(row.studentId);
      if (!result.has(studentId)) result.set(studentId, { blocks: [], loadCourses: 0 });
      if (!byStudentCourses.has(studentId)) byStudentCourses.set(studentId, new Set());
      const dayOfWeek = Number(row.dayOfWeek ?? 0);
      const startTime = String(row.startTime ?? '');
      const endTime = String(row.endTime ?? '');
      const startDate = row.startDate ? this.normalizeIsoDateOnly(row.startDate) : null;
      const endDate = row.endDate ? this.normalizeIsoDateOnly(row.endDate) : null;
      const label = [row.courseName ? String(row.courseName) : '', row.sectionName ? String(row.sectionName) : '']
        .filter(Boolean)
        .join(' | ') || null;
      const start = this.toTimeMinutes(startTime);
      const end = this.toTimeMinutes(endTime);
      if (dayOfWeek >= 1 && dayOfWeek <= 7 && start !== null && end !== null && start < end) {
        result.get(studentId)!.blocks.push({ dayOfWeek, startTime, endTime, startDate, endDate, label });
      }
      const sectionCourseId = this.normalize(row.sectionCourseId);
      if (sectionCourseId) byStudentCourses.get(studentId)!.add(sectionCourseId);
    }

    for (const id of unique) {
      const entry = result.get(id) ?? { blocks: [], loadCourses: 0 };
      entry.loadCourses = byStudentCourses.get(id)?.size ?? 0;
      result.set(id, entry);
    }
    return result;
  }

  private buildAssignmentPreview(
    workshop: any,
    students: any[],
    groups: GroupWithSchedule[],
    loadByStudent: Map<string, {
      blocks: Array<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
        label: string | null;
      }>;
      loadCourses: number;
    }>
  ) {
    const candidates = students.map((student: any) => {
      const load = loadByStudent.get(String(student.studentId)) ?? { blocks: [], loadCourses: 0 };
      return {
        studentId: String(student.studentId),
        dni: student.dni ? String(student.dni) : null,
        codigoAlumno: student.codigoAlumno ? String(student.codigoAlumno) : null,
        fullName: String(student.fullName ?? ''),
        careerName: student.careerName ? String(student.careerName) : null,
        campusName: student.campusName ? String(student.campusName) : null,
        hasLevelingLoad: load.blocks.length > 0,
        loadCourses: Number(load.loadCourses ?? 0),
        loadBlocks: load.blocks.length,
        scheduleBlocks: load.blocks,
      };
    });
    candidates.sort((a, b) => {
      if (a.hasLevelingLoad !== b.hasLevelingLoad) return a.hasLevelingLoad ? -1 : 1;
      if (a.loadCourses !== b.loadCourses) return b.loadCourses - a.loadCourses;
      if (a.loadBlocks !== b.loadBlocks) return b.loadBlocks - a.loadBlocks;
      return a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' });
    });

    const sortedGroups = [...groups].sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.code.localeCompare(b.code)
    );
    const eligibleGroups = sortedGroups.filter((group) => group.isActive && group.scheduleBlocks.length > 0);
    const assignedByGroup = new Map<string, any[]>();
    const assignedCountByGroup = new Map<string, number>();
    sortedGroups.forEach((group) => {
      assignedByGroup.set(group.id, []);
      assignedCountByGroup.set(group.id, 0);
    });
    const pending: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string | null;
      campusName: string | null;
      hasLevelingLoad: boolean;
      loadCourses: number;
      reasonCode: PendingReasonCode;
      reasonDetail: string;
    }> = [];

    for (const student of candidates) {
      if (eligibleGroups.length === 0) {
        pending.push({
          studentId: student.studentId,
          dni: student.dni,
          codigoAlumno: student.codigoAlumno,
          fullName: student.fullName,
          careerName: student.careerName,
          campusName: student.campusName,
          hasLevelingLoad: student.hasLevelingLoad,
          loadCourses: student.loadCourses,
          reasonCode: 'NO_ELIGIBLE_GROUP',
          reasonDetail: 'No hay grupos activos con horario configurado',
        });
        continue;
      }

      const conflictsByGroup = eligibleGroups.map((group) => ({
        group,
        overlaps: this.findOverlappingBlocks(student.scheduleBlocks, group.scheduleBlocks),
      }));
      const noConflict = conflictsByGroup
        .filter((entry) => entry.overlaps.length === 0)
        .map((entry) => entry.group);
      if (noConflict.length === 0) {
        const detail = conflictsByGroup
          .filter((entry) => entry.overlaps.length > 0)
          .map((entry) => {
            const label = entry.group.displayName || entry.group.code || 'Grupo';
            const overlapText = entry.overlaps
              .map((overlap) => {
                const workshopBlock = this.formatScheduleBlock(overlap.groupBlock);
                const studentBlock = this.formatScheduleBlock(overlap.studentBlock, overlap.studentBlock.label);
                return `${label}: ${workshopBlock} cruza con ${studentBlock}`;
              })
              .join(' | ');
            return overlapText;
          })
          .join(' || ');
        pending.push({
          studentId: student.studentId,
          dni: student.dni,
          codigoAlumno: student.codigoAlumno,
          fullName: student.fullName,
          careerName: student.careerName,
          campusName: student.campusName,
          hasLevelingLoad: student.hasLevelingLoad,
          loadCourses: student.loadCourses,
          reasonCode: 'SCHEDULE_CONFLICT',
          reasonDetail: detail || 'Cruce de horario con todos los grupos elegibles',
        });
        continue;
      }

      const withCapacity = noConflict.filter((group) => {
        const capacity = this.resolveGroupCapacity(workshop, group, candidates.length);
        if (capacity === null) return true;
        return (assignedCountByGroup.get(group.id) ?? 0) < capacity;
      });
      if (withCapacity.length === 0) {
        pending.push({
          studentId: student.studentId,
          dni: student.dni,
          codigoAlumno: student.codigoAlumno,
          fullName: student.fullName,
          careerName: student.careerName,
          campusName: student.campusName,
          hasLevelingLoad: student.hasLevelingLoad,
          loadCourses: student.loadCourses,
          reasonCode: 'NO_CAPACITY',
          reasonDetail: 'Sin cupo en grupos compatibles',
        });
        continue;
      }

      withCapacity.sort((a, b) => {
        const aCap = this.resolveGroupCapacity(workshop, a, candidates.length);
        const bCap = this.resolveGroupCapacity(workshop, b, candidates.length);
        const aCount = assignedCountByGroup.get(a.id) ?? 0;
        const bCount = assignedCountByGroup.get(b.id) ?? 0;
        const aUtil = aCap ? aCount / aCap : aCount;
        const bUtil = bCap ? bCount / bCap : bCount;
        if (aUtil !== bUtil) return aUtil - bUtil;
        if (aCount !== bCount) return aCount - bCount;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.code.localeCompare(b.code);
      });

      const selected = withCapacity[0];
      assignedCountByGroup.set(selected.id, (assignedCountByGroup.get(selected.id) ?? 0) + 1);
      assignedByGroup.get(selected.id)!.push(student);
    }

    const pendingSummary = {
      SCHEDULE_CONFLICT: 0,
      NO_CAPACITY: 0,
      NO_ELIGIBLE_GROUP: 0,
    } as Record<PendingReasonCode, number>;
    pending.forEach((row) => {
      pendingSummary[row.reasonCode] += 1;
    });

    const groupsPreview = sortedGroups.map((group) => {
      const assigned = assignedByGroup.get(group.id) ?? [];
      const capacity = this.resolveGroupCapacity(workshop, group, candidates.length);
      return {
        sourceGroupId: group.id,
        code: group.code,
        displayName: group.displayName,
        sortOrder: group.sortOrder,
        capacity,
        assignedCount: assigned.length,
        utilization: capacity ? assigned.length / capacity : null,
        scheduleBlocks: group.scheduleBlocks.map((block) => ({
          dayOfWeek: block.dayOfWeek,
          startTime: block.startTime,
          endTime: block.endTime,
          startDate: block.startDate,
          endDate: block.endDate,
        })),
        students: assigned.map((student: any) => ({
          studentId: student.studentId,
          dni: student.dni,
          codigoAlumno: student.codigoAlumno,
          fullName: student.fullName,
          careerName: student.careerName,
          campusName: student.campusName,
          hasLevelingLoad: student.hasLevelingLoad,
          loadCourses: student.loadCourses,
        })),
      };
    });

    const suggestedCapacity =
      String(workshop.mode ?? '') === 'BY_SIZE'
        ? Math.max(1, Number(workshop.groupSize ?? 1))
        : Math.max(1, candidates.length);

    return {
      workshop,
      groupsConfigured: sortedGroups.length,
      groupsEligible: eligibleGroups.length,
      totalCandidates: candidates.length,
      assignedCount: candidates.length - pending.length,
      pendingCount: pending.length,
      pendingSummary,
      groups: groupsPreview,
      pending,
      suggestion: {
        recommendedGroupCapacity: suggestedCapacity,
        potentialCoveredIfAddOneGroup: Math.min(
          suggestedCapacity,
          pendingSummary.NO_CAPACITY + (eligibleGroups.length === 0 ? pending.length : 0)
        ),
      },
    };
  }

  private async attachScheduleToWorkshopGroups(rows: any[]) {
    const sourceGroupIds = Array.from(
      new Set(
        rows
          .map((row) => this.normalize(row.sourceGroupId))
          .filter(Boolean)
      )
    );
    const scheduleBySourceGroup = await this.loadScheduleBlocksBySourceGroup(sourceGroupIds);
    return rows.map((row) => {
      const scheduleBlocks = scheduleBySourceGroup.get(String(row.sourceGroupId ?? '')) ?? [];
      return {
        applicationId: String(row.applicationId),
        workshopId: String(row.workshopId),
        workshopName: String(row.workshopName ?? ''),
        deliveryMode: String(row.deliveryMode ?? 'VIRTUAL'),
        venueCampusName: row.venueCampusName ? String(row.venueCampusName) : null,
        responsibleTeacherName: row.responsibleTeacherName
          ? String(row.responsibleTeacherName)
          : null,
        applicationGroupId: String(row.applicationGroupId),
        sourceGroupId: row.sourceGroupId ? String(row.sourceGroupId) : null,
        groupCode: row.groupCode ? String(row.groupCode) : null,
        groupName: row.groupName ? String(row.groupName) : null,
        groupIndex: Number(row.groupIndex ?? 0),
        studentCount: Number(row.studentCount ?? 0),
        scheduleBlocks,
        scheduleSummary: this.buildScheduleSummary(scheduleBlocks),
      };
    });
  }

  private async loadScheduleBlocksBySourceGroup(sourceGroupIds: string[]) {
    const byGroup = new Map<string, GroupScheduleBlock[]>();
    if (sourceGroupIds.length === 0) return byGroup;
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        id,
        groupId,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        zoomMeetingRecordId,
        joinUrl,
        startUrl
      FROM workshop_group_schedule_blocks
      WHERE groupId IN (${sourceGroupIds.map(() => '?').join(', ')})
      ORDER BY dayOfWeek ASC, startTime ASC
      `,
      sourceGroupIds
    );
    for (const row of rows) {
      const groupId = String(row.groupId);
      if (!byGroup.has(groupId)) byGroup.set(groupId, []);
      byGroup.get(groupId)!.push({
        id: String(row.id),
        dayOfWeek: Number(row.dayOfWeek ?? 0),
        startTime: this.toHHmm(String(row.startTime ?? '')),
        endTime: this.toHHmm(String(row.endTime ?? '')),
        startDate: row.startDate ? this.normalizeIsoDateOnly(row.startDate) : null,
        endDate: row.endDate ? this.normalizeIsoDateOnly(row.endDate) : null,
        zoomMeetingRecordId: row.zoomMeetingRecordId
          ? String(row.zoomMeetingRecordId)
          : null,
        joinUrl: row.joinUrl ? String(row.joinUrl) : null,
        startUrl: row.startUrl ? String(row.startUrl) : null,
      });
    }
    return byGroup;
  }

  private buildScheduleSummary(blocks: GroupScheduleBlock[]) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return 'Sin horario';
    }
    const labels: Record<number, string> = {
      1: 'Lun',
      2: 'Mar',
      3: 'Mie',
      4: 'Jue',
      5: 'Vie',
      6: 'Sab',
      7: 'Dom',
    };
    return blocks
      .map((block) => {
        const base = `${labels[Number(block.dayOfWeek)] ?? block.dayOfWeek} ${this.toHHmm(
          block.startTime
        )}-${this.toHHmm(block.endTime)}`;
        if (block.startDate && block.endDate) {
          return `${base} (${block.startDate} a ${block.endDate})`;
        }
        return base;
      })
      .join(' | ');
  }

  private async getWorkshopScheduleBlockByIdOrThrow(blockId: string) {
    const row = await this.dataSource
      .query(
        `
        SELECT
          b.id,
          b.groupId,
          b.dayOfWeek,
          b.startTime,
          b.endTime,
          b.startDate,
          b.endDate,
          b.zoomMeetingRecordId,
          b.joinUrl,
          b.startUrl
        FROM workshop_group_schedule_blocks b
        WHERE b.id = ?
        LIMIT 1
        `,
        [blockId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.id) {
      throw new NotFoundException('Bloque horario del taller no encontrado');
    }
    return {
      id: String(row.id),
      groupId: String(row.groupId),
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      startTime: String(row.startTime ?? ''),
      endTime: String(row.endTime ?? ''),
      startDate: row.startDate ? this.normalizeIsoDateOnly(row.startDate) : null,
      endDate: row.endDate ? this.normalizeIsoDateOnly(row.endDate) : null,
      zoomMeetingRecordId: row.zoomMeetingRecordId
        ? String(row.zoomMeetingRecordId)
        : null,
      joinUrl: row.joinUrl ? String(row.joinUrl) : null,
      startUrl: row.startUrl ? String(row.startUrl) : null,
    };
  }

  private async getWorkshopScheduleBlockOrThrow(
    workshopId: string,
    groupId: string,
    blockId: string
  ) {
    const row = await this.dataSource
      .query(
        `
        SELECT b.id
        FROM workshop_group_schedule_blocks b
        INNER JOIN workshop_groups g ON g.id = b.groupId
        WHERE b.id = ?
          AND b.groupId = ?
          AND g.workshopId = ?
        LIMIT 1
        `,
        [blockId, groupId, workshopId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.id) {
      throw new NotFoundException('Bloque horario del taller no encontrado');
    }
    return this.getWorkshopScheduleBlockByIdOrThrow(blockId);
  }

  private formatScheduleBlock(
    block: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    },
    label?: string | null
  ) {
    const days: Record<number, string> = {
      1: 'Lun',
      2: 'Mar',
      3: 'Mie',
      4: 'Jue',
      5: 'Vie',
      6: 'Sab',
      7: 'Dom',
    };
    const base = `${days[Number(block.dayOfWeek)] ?? block.dayOfWeek} ${this.toHHmm(
      block.startTime
    )}-${this.toHHmm(block.endTime)}`;
    const datePart =
      block.startDate && block.endDate
        ? block.startDate === block.endDate
          ? block.startDate
          : `${block.startDate} a ${block.endDate}`
        : block.startDate || block.endDate || '';
    const withDate = datePart ? `${base} (${datePart})` : base;
    return label ? `${label} ${withDate}` : withDate;
  }

  private async loadTeacherWorkshopAttendanceContextOrThrow(
    teacherId: string,
    applicationGroupId: string
  ) {
    const row = await this.dataSource
      .query(
        `
        SELECT
          wa.id AS applicationId,
          wa.periodId AS periodId,
          wa.workshopId AS workshopId,
          wa.name AS workshopName,
          wag.id AS applicationGroupId,
          wag.sourceGroupId AS sourceGroupId,
          wag.groupName AS groupName
        FROM workshop_application_groups wag
        INNER JOIN workshop_applications wa ON wa.id = wag.applicationId
        WHERE wag.id = ?
          AND wa.responsibleTeacherId = ?
          AND wa.id = (
            SELECT wa2.id
            FROM workshop_applications wa2
            WHERE wa2.workshopId = wa.workshopId
            ORDER BY wa2.createdAt DESC, wa2.id DESC
            LIMIT 1
          )
        LIMIT 1
        `,
        [applicationGroupId, teacherId]
      )
      .then((rows) => rows[0]);
    if (!row?.applicationId) {
      throw new NotFoundException('Grupo de taller no disponible para este docente');
    }
    const scheduleBlocks = (
      await this.loadScheduleBlocksBySourceGroup([String(row.sourceGroupId ?? '')])
    ).get(String(row.sourceGroupId ?? '')) ?? [];
    return {
      applicationId: String(row.applicationId),
      periodId: String(row.periodId),
      workshopId: String(row.workshopId),
      workshopName: String(row.workshopName ?? ''),
      groupName: String(row.groupName ?? ''),
      sourceGroupId: String(row.sourceGroupId ?? ''),
      scheduleBlocks,
    };
  }

  async assertTeacherCanAccessWorkshopScheduleBlock(
    teacherId: string,
    blockId: string
  ) {
    const row = await this.dataSource
      .query(
        `
        SELECT b.id AS blockId
        FROM workshop_group_schedule_blocks b
        INNER JOIN workshop_groups wg ON wg.id = b.groupId
        INNER JOIN workshop_application_groups wag ON wag.sourceGroupId = wg.id
        INNER JOIN workshop_applications wa ON wa.id = wag.applicationId
        WHERE b.id = ?
          AND wa.responsibleTeacherId = ?
          AND wa.id = (
            SELECT wa2.id
            FROM workshop_applications wa2
            WHERE wa2.workshopId = wa.workshopId
            ORDER BY wa2.createdAt DESC, wa2.id DESC
            LIMIT 1
          )
        LIMIT 1
        `,
        [blockId, teacherId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.blockId) {
      throw new NotFoundException('Bloque de taller no disponible para este docente');
    }
  }

  async refreshTeacherWorkshopScheduleBlockLinks(
    teacherId: string,
    blockId: string
  ) {
    await this.assertTeacherCanAccessWorkshopScheduleBlock(teacherId, blockId);
    return this.refreshWorkshopGroupScheduleBlockLinks(blockId);
  }

  async refreshStudentWorkshopScheduleBlockJoinLink(
    studentId: string,
    blockId: string
  ) {
    const row = await this.dataSource
      .query(
        `
        SELECT b.id AS blockId
        FROM workshop_group_schedule_blocks b
        INNER JOIN workshop_groups wg ON wg.id = b.groupId
        INNER JOIN workshop_application_groups wag ON wag.sourceGroupId = wg.id
        INNER JOIN workshop_application_students was ON was.groupId = wag.id
        INNER JOIN workshop_applications wa ON wa.id = wag.applicationId
        WHERE b.id = ?
          AND was.studentId = ?
          AND wa.id = (
            SELECT wa2.id
            FROM workshop_applications wa2
            WHERE wa2.workshopId = wa.workshopId
            ORDER BY wa2.createdAt DESC, wa2.id DESC
            LIMIT 1
          )
        LIMIT 1
        `,
        [blockId, studentId]
      )
      .then((rows) => rows[0] ?? null);
    if (!row?.blockId) {
      throw new NotFoundException('Bloque de taller no disponible para este alumno');
    }
    const links = await this.refreshWorkshopGroupScheduleBlockLinks(blockId);
    return {
      joinUrl: links.joinUrl ?? null,
    };
  }

  private async loadWorkshopGroupStudents(
    applicationId: string,
    applicationGroupId: string,
    periodId: string
  ) {
    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        was.studentId AS id,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        se.careerName AS careerName,
        se.campusName AS campusName
      FROM workshop_application_students was
      INNER JOIN users u ON BINARY u.id = BINARY was.studentId
      LEFT JOIN student_enrollments se
        ON BINARY se.studentId = BINARY was.studentId
       AND BINARY se.periodId = BINARY ?
      WHERE BINARY was.applicationId = BINARY ?
        AND BINARY was.groupId = BINARY ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [periodId, applicationId, applicationGroupId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      dni: row.dni ? String(row.dni) : '',
      codigoAlumno: row.codigoAlumno ? String(row.codigoAlumno) : null,
      fullName: String(row.fullName ?? ''),
      careerName: row.careerName ? String(row.careerName) : null,
      campusName: row.campusName ? String(row.campusName) : null,
    }));
  }

  private async findWorkshopAttendanceSession(
    applicationId: string,
    applicationGroupId: string,
    sessionDate: string
  ) {
    return this.dataSource
      .query(
        `
        SELECT id, sessionDate
        FROM workshop_attendance_sessions
        WHERE applicationId = ?
          AND applicationGroupId = ?
          AND sessionDate = ?
        LIMIT 1
        `,
        [applicationId, applicationGroupId, sessionDate]
      )
      .then((rows) => rows[0] ?? null);
  }

  private isDateAllowedForScheduleBlocks(sessionDate: string, blocks: GroupScheduleBlock[]) {
    const targetDay = this.isoDateDayOfWeek(sessionDate);
    if (!targetDay) return false;
    return blocks.some((block) => {
      if (Number(block.dayOfWeek) !== targetDay) return false;
      if (block.startDate && sessionDate < block.startDate) return false;
      if (block.endDate && sessionDate > block.endDate) return false;
      return true;
    });
  }

  private isoDateDayOfWeek(value: string) {
    const normalized = this.normalizeIsoDateOnly(value);
    if (!normalized) return null;
    const date = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  private normalizeIsoDateOnly(value: unknown) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeExcelDateTime(value: unknown) {
    if (!value) return '';
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return String(value ?? '');
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  private toHHmm(value: string) {
    const normalized = this.normalize(value);
    const match = normalized.match(/^(\d{2}):(\d{2})/);
    if (!match) return normalized;
    return `${match[1]}:${match[2]}`;
  }

  private dayShort(dayOfWeek: number) {
    const labels: Record<number, string> = {
      1: 'Lun',
      2: 'Mar',
      3: 'Mie',
      4: 'Jue',
      5: 'Vie',
      6: 'Sab',
      7: 'Dom',
    };
    return labels[Number(dayOfWeek)] ?? String(dayOfWeek ?? '');
  }

  private buildApplicationGroupScheduleSummary(group: {
    dayOfWeek: number | null;
    startTime: string | null;
    endTime: string | null;
    venueDetails?: string | null;
  }) {
    if (!group.startTime || !group.endTime) return 'Sin horario';
    const base = `${this.dayShort(Number(group.dayOfWeek ?? 0))} ${this.toHHmm(
      String(group.startTime)
    )}-${this.toHHmm(String(group.endTime))}`;
    const venue = String(group.venueDetails ?? '').trim();
    return venue ? `${base} | ${venue}` : base;
  }

  private sanitizeFilePart(value: string) {
    return String(value ?? '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  private buildWorkshopGroupsExportFileName(workshopName: string, appliedDate: string) {
    const workshop = this.sanitizeFilePart(workshopName || 'taller');
    const date = this.sanitizeFilePart(appliedDate || 'aplicacion');
    return `taller_grupos_${workshop}_${date}.xlsx`;
  }

  private toWorksheetName(value: string) {
    const cleaned = String(value ?? '')
      .trim()
      .replace(/[:\\/?*\[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 31);
    return cleaned || 'Hoja';
  }

  private normalizeAttendanceStatus(value: unknown): AttendanceStatus {
    const text = this.normalize(String(value ?? '').toUpperCase());
    return text === AttendanceStatus.ASISTIO
      ? AttendanceStatus.ASISTIO
      : AttendanceStatus.FALTO;
  }

  private async getGroupOrThrow(workshopId: string, groupId: string) {
    const row = await this.dataSource
      .query(
        `
        SELECT id
        FROM workshop_groups
        WHERE id = ? AND workshopId = ?
        LIMIT 1
        `,
        [groupId, workshopId]
      )
      .then((rows) => rows[0]);
    if (!row) throw new NotFoundException('Grupo de taller no encontrado');
    return row;
  }

  private async resolveResponsibleTeacherOrThrow(teacherId: string | null | undefined) {
    const normalizedTeacherId = this.normalize(teacherId);
    if (!normalizedTeacherId) return null;
    const row = await this.dataSource
      .query(
        `
        SELECT id, dni, fullName, role
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [normalizedTeacherId]
      )
      .then((rows) => rows[0]);
    if (!row?.id || String(row.role ?? '').trim() !== Role.DOCENTE) {
      throw new BadRequestException('Responsable de taller no valido');
    }
    return {
      id: String(row.id),
      dni: row.dni ? String(row.dni) : null,
      fullName: String(row.fullName ?? ''),
    } satisfies ResponsibleTeacherSnapshot;
  }

  private mapWorkshop(row: any) {
    const parseJsonArray = (value: any) => {
      if (Array.isArray(value)) {
        return value.map((v) => String(v));
      }
      if (value === null || value === undefined || value === '') {
        return [];
      }
      try {
        const parsed = JSON.parse(value ?? '[]');
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
      } catch {
        return [];
      }
    };
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      mode: (row.mode || 'BY_SIZE') as WorkshopMode,
      groupSize: row.groupSize !== null && row.groupSize !== undefined ? Number(row.groupSize) : null,
      selectionMode: (row.selectionMode || 'ALL') as SelectionMode,
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      careerName: row.careerName ? String(row.careerName) : null,
      facultyGroups: parseJsonArray(row.facultyGroups),
      campusNames: parseJsonArray(row.campusNames),
      careerNames: parseJsonArray(row.careerNames),
      deliveryMode: (row.deliveryMode || 'VIRTUAL') as DeliveryMode,
      venueCampusName: row.venueCampusName ? String(row.venueCampusName) : null,
      responsibleTeacherId: row.responsibleTeacherId
        ? String(row.responsibleTeacherId)
        : null,
      responsibleTeacherDni: row.responsibleTeacherDni
        ? String(row.responsibleTeacherDni)
        : null,
      responsibleTeacherName: row.responsibleTeacherName
        ? String(row.responsibleTeacherName)
        : null,
      selectedStudentsCount: Number(row.selectedStudentsCount ?? 0),
      groupsCount: Number(row.groupsCount ?? 0),
      scheduledGroupsCount: Number(row.scheduledGroupsCount ?? 0),
      lastApplicationId: row.lastApplicationId ? String(row.lastApplicationId) : null,
      lastApplicationAt: row.lastApplicationAt ? String(row.lastApplicationAt) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAuditScheduleBlock(block: Partial<GroupScheduleBlock>) {
    return {
      dayOfWeek: Number(block.dayOfWeek ?? 0),
      startTime: block.startTime ? this.toHHmm(String(block.startTime)) : null,
      endTime: block.endTime ? this.toHHmm(String(block.endTime)) : null,
      startDate: block.startDate ? this.normalizeIsoDateOnly(block.startDate) : null,
      endDate: block.endDate ? this.normalizeIsoDateOnly(block.endDate) : null,
    };
  }

  private toAuditWorkshopSnapshot(workshop: Partial<{
    name: string | null;
    mode: WorkshopMode | null;
    groupSize: number | null;
    selectionMode: SelectionMode | null;
    facultyGroups?: string[] | null;
    campusNames?: string[] | null;
    careerNames?: string[] | null;
    deliveryMode?: DeliveryMode | null;
    venueCampusName?: string | null;
    responsibleTeacherId?: string | null;
    responsibleTeacherName?: string | null;
    selectedStudentsCount?: number | null;
    studentIds?: string[] | null;
  }>) {
    return {
      name: this.normalize(workshop.name ?? null) || null,
      mode: workshop.mode ?? null,
      groupSize:
        workshop.groupSize === null || workshop.groupSize === undefined
          ? null
          : Number(workshop.groupSize),
      selectionMode: workshop.selectionMode ?? null,
      facultyGroups: Array.isArray(workshop.facultyGroups)
        ? workshop.facultyGroups.slice()
        : [],
      campusNames: Array.isArray(workshop.campusNames)
        ? workshop.campusNames.slice()
        : [],
      careerNames: Array.isArray(workshop.careerNames)
        ? workshop.careerNames.slice()
        : [],
      deliveryMode: workshop.deliveryMode ?? null,
      venueCampusName: workshop.venueCampusName ?? null,
      responsibleTeacherId: workshop.responsibleTeacherId ?? null,
      responsibleTeacherName: workshop.responsibleTeacherName ?? null,
      selectedStudentsCount:
        workshop.selectedStudentsCount === null ||
        workshop.selectedStudentsCount === undefined
          ? null
          : Number(workshop.selectedStudentsCount),
      studentIds: Array.isArray(workshop.studentIds) ? workshop.studentIds.slice() : [],
    };
  }

  private toAuditGroupSnapshot(group: Partial<{
    id: string | null;
    code: string | null;
    displayName: string | null;
    capacity: number | null;
    sortOrder: number | null;
    isActive: boolean | null;
    scheduleBlocks?: Array<Partial<GroupScheduleBlock>> | null;
  }>) {
    return {
      id: group.id ?? null,
      code: group.code ?? null,
      displayName: group.displayName ?? null,
      capacity:
        group.capacity === null || group.capacity === undefined
          ? null
          : Number(group.capacity),
      sortOrder:
        group.sortOrder === null || group.sortOrder === undefined
          ? null
          : Number(group.sortOrder),
      isActive: group.isActive ?? null,
      scheduleBlocks: Array.isArray(group.scheduleBlocks)
        ? group.scheduleBlocks.map((block: Partial<GroupScheduleBlock>) =>
            this.toAuditScheduleBlock(block)
          )
        : [],
    };
  }
}
