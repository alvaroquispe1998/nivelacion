import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Role } from '@uai/shared';
import * as XLSX from 'xlsx';
import { DataSource, EntityManager, In } from 'typeorm';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';
import { CreateLevelingManualSectionCourseDto } from './dto/create-leveling-manual-section-course.dto';

type CourseName = string;

const LEGACY_COURSE_BY_COLUMN: Record<number, CourseName> = {
  25: 'COMUNICACION', // Z
  26: 'HABILIDADES COMUNICATIVAS', // AA
  27: 'MATEMATICA', // AB
  28: 'CIENCIA, TECNOLOGIA Y AMBIENTE', // AC
  29: 'CIENCIAS SOCIALES', // AD
};

const PREFERRED_COURSE_ORDER = [
  'COMUNICACION',
  'HABILIDADES COMUNICATIVAS',
  'MATEMATICA',
  'CIENCIA, TECNOLOGIA Y AMBIENTE',
  'CIENCIAS SOCIALES',
] as const;
const FIRST_COURSE_COLUMN_INDEX = 14; // O

const FICA_NAME = 'INGENIERIA, CIENCIAS Y HUMANIDADES';
const SALUD_NAME = 'CIENCIAS DE LA SALUD';
const HOURS_PER_GROUP = 4;
const PRICE_PER_HOUR = 116;

interface ParsedStudent {
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  names: string | null;
  paternalLastName: string | null;
  maternalLastName: string | null;
  email: string | null;
  sex: string | null;
  careerName: string;
  facultyName: string;
  facultyGroup: 'FICA' | 'SALUD';
  campusName: string;
  campusCode: string;
  modality: 'VIRTUAL' | 'PRESENCIAL';
  modalityChar: 'V' | 'P';
  sourceModality: 'VIRTUAL' | 'PRESENCIAL' | 'SIN DATO';
  neededCourses: CourseName[];
}

interface PlannedSection {
  code: string;
  name: string;
  facultyName: string;
  facultyGroup: 'FICA' | 'SALUD';
  campusName: string;
  campusCode: string;
  modality: 'VIRTUAL' | 'PRESENCIAL';
  neededCourses: CourseName[];
  initialCapacity: number;
  maxExtraCapacity: number;
  students: ParsedStudent[];
  studentCoursesByDni: Map<string, Set<CourseName>>;
}

interface FacultyCourseGroupSummary {
  facultyGroup: string;
  rows: Array<{
    label: string;
    campusName: string;
    modality: string;
    courseGroups: Record<CourseName, number>;
    courseGroupSizes: Record<CourseName, number[]>;
    totalGroups: number;
  }>;
  totalGroups: number;
  totalHours: number;
  totalPay4Weeks: number;
}

interface CourseGroupSummaryPayload {
  hoursPerGroup: number;
  pricePerHour: number;
  totalPay4Weeks: number;
  byFaculty: FacultyCourseGroupSummary[];
}

interface CourseGroupUnit {
  id: string;
  facultyGroup: 'FICA' | 'SALUD';
  campusName: string;
  courseName: CourseName;
  size: number;
  modality: 'PRESENCIAL' | 'VIRTUAL';
}

interface GroupPlanPayload {
  byFaculty: Array<{
    facultyGroup: string;
    rows: Array<{
      campusName: string;
      courses: Record<
        CourseName,
        Array<{
          id: string;
          size: number;
          modality: 'PRESENCIAL' | 'VIRTUAL';
        }>
      >;
    }>;
  }>;
}

interface ProgramNeedsPayload {
  campuses: string[];
  modalities: string[];
  rows: Array<{
    careerName: string;
    facultyGroup: 'FICA' | 'SALUD';
    campusName: string;
    sourceModality: 'VIRTUAL' | 'PRESENCIAL' | 'SIN DATO';
    needsByCourse: Record<CourseName, number>;
    totalNeeds: number;
  }>;
}

type LevelingRunStatus = 'STRUCTURED' | 'READY' | 'MATRICULATED' | 'ARCHIVED';

interface ApplyStructureResult {
  runId: string;
  runStatus: LevelingRunStatus;
  sectionsCreated: number;
  sectionsUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  sectionCoursesCreated: number;
  sectionCoursesOmitted: number;
  demandsCreated: number;
  demandsOmitted: number;
}

interface StudentDemandItem {
  studentId: string;
  studentCode: string | null;
  studentName: string;
  courseId: string;
  courseName: string;
  facultyGroup: string | null;
  campusName: string | null;
}

interface ScheduleBlockWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string | null;
  endDate: string | null;
}

interface ExcelColumns {
  orderIdx: number | null;
  paternalLastNameIdx: number | null;
  maternalLastNameIdx: number | null;
  namesIdx: number | null;
  fullNameIdx: number | null;
  emailIdx: number | null;
  sexIdx: number | null;
  studentCodeIdx: number | null;
  dniIdx: number;
  facultyIdx: number | null;
  areaIdx: number | null;
  careerIdx: number;
  campusIdx: number | null;
  modalityIdx: number | null;
  conditionIdx: number | null;
  needsLevelingIdx: number | null;
  programLevelingIdx: number | null;
  examDateIdx: number | null;
  courseColumns: Array<{ idx: number; courseName: CourseName }>;
}

@Injectable()
export class LevelingService {
  constructor(private readonly dataSource: DataSource) { }

  async getConfig() {
    const rows = await this.dataSource.query(
      'SELECT initialCapacity, maxExtraCapacity FROM leveling_config WHERE id = 1 LIMIT 1'
    );
    if (rows.length === 0) {
      return { initialCapacity: 45, maxExtraCapacity: 0 };
    }
    return {
      initialCapacity: Number(rows[0].initialCapacity ?? 45),
      maxExtraCapacity: Number(rows[0].maxExtraCapacity ?? 0),
    };
  }

  /**
   * Dashboard summary: returns active period + latest leveling run metrics
   * in a single call to drive the admin sequential progress panel.
   */
  async getActiveRunSummary() {
    // 1. Active period
    const periodRows: Array<{ id: string; code: string; name: string; kind: string }> =
      await this.dataSource.query(
        `SELECT id, code, name, kind FROM periods WHERE status = 'ACTIVE' LIMIT 1`
      );
    const activePeriod = periodRows[0] ?? null;

    if (!activePeriod) {
      return {
        activePeriod: null,
        run: null,
        metrics: null,
      };
    }

    // 2. Latest leveling run for active period (most recently updated, non-archived)
    const runRows: Array<{ id: string; status: string; periodId: string }> = await this.dataSource.query(
      `
      SELECT id, status, periodId
      FROM leveling_runs
      WHERE periodId = ?
        AND status != 'ARCHIVED'
      ORDER BY updatedAt DESC
      LIMIT 1
      `,
      [activePeriod.id]
    );
    const run = runRows[0] ?? null;

    if (!run) {
      return {
        activePeriod: { id: activePeriod.id, code: activePeriod.code, name: activePeriod.name },
        run: null,
        metrics: null,
      };
    }

    // 3. Metrics: sections, section-courses, schedule coverage, teacher coverage, assigned
    const [
      sectionRows,
      sectionCourseRows,
      scheduledRows,
      teacherRows,
      assignedRows,
      demandRows,
      facultyRows,
    ] =
      await Promise.all([
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM sections WHERE levelingRunId = ?`,
          [run.id]
        ),
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c
         FROM section_courses sc
         INNER JOIN sections s ON s.id = sc.sectionId
         WHERE s.levelingRunId = ?
           AND sc.periodId = ?`,
          [run.id, run.periodId]
        ),
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(DISTINCT sc.id) AS c
         FROM section_courses sc
         INNER JOIN sections s ON s.id = sc.sectionId
         INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
         WHERE s.levelingRunId = ?
           AND sc.periodId = ?`,
          [run.id, run.periodId]
        ),
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(DISTINCT sc.id) AS c
         FROM section_courses sc
         INNER JOIN sections s ON s.id = sc.sectionId
         LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
         WHERE s.levelingRunId = ?
           AND sc.periodId = ?
           AND (s.teacherId IS NOT NULL OR sct.teacherId IS NOT NULL)`,
          [run.id, run.periodId]
        ),
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c
         FROM section_student_courses ssc
         INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
         INNER JOIN sections s ON s.id = sc.sectionId
         WHERE s.levelingRunId = ?
           AND sc.periodId = ?`,
          [run.id, run.periodId]
        ),
        this.dataSource.query<Array<{ c: number }>>(
          `SELECT COUNT(*) AS c FROM leveling_run_student_course_demands WHERE runId = ?`,
          [run.id]
        ),
        this.dataSource.query<
          Array<{
            facultyGroup: string | null;
            totalSectionCourses: number;
            withSchedule: number;
            withTeacher: number;
          }>
        >(
          `
          SELECT
            s.facultyGroup AS facultyGroup,
            COUNT(DISTINCT sc.id) AS totalSectionCourses,
            COUNT(DISTINCT IF(sb.id IS NOT NULL, sc.id, NULL)) AS withSchedule,
            COUNT(
              DISTINCT IF(s.teacherId IS NOT NULL OR sct.teacherId IS NOT NULL, sc.id, NULL)
            ) AS withTeacher
          FROM section_courses sc
          INNER JOIN sections s ON s.id = sc.sectionId
          LEFT JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
          LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
          WHERE s.levelingRunId = ?
            AND sc.periodId = ?
          GROUP BY s.facultyGroup
          `,
          [run.id, run.periodId]
        ),
      ]);

    const totalSectionCourses = Number(sectionCourseRows[0]?.c ?? 0);
    const withSchedule = Number(scheduledRows[0]?.c ?? 0);
    const withTeacher = Number(teacherRows[0]?.c ?? 0);
    const faculties = facultyRows.map((row) => {
      const total = Number(row.totalSectionCourses ?? 0);
      const withScheduleCount = Number(row.withSchedule ?? 0);
      const withTeacherCount = Number(row.withTeacher ?? 0);
      return {
        facultyGroup: String(row.facultyGroup ?? '').trim() || 'SIN_FACULTAD',
        totalSectionCourses: total,
        withSchedule: withScheduleCount,
        withTeacher: withTeacherCount,
        ready:
          total > 0 &&
          withScheduleCount === total &&
          withTeacherCount === total,
      };
    });
    const readyFaculties = faculties.filter((row) => row.ready).length;

    return {
      activePeriod: { id: activePeriod.id, code: activePeriod.code, name: activePeriod.name },
      run: { id: run.id, status: run.status },
      metrics: {
        sections: Number(sectionRows[0]?.c ?? 0),
        sectionCourses: totalSectionCourses,
        demands: Number(demandRows[0]?.c ?? 0),
        assigned: Number(assignedRows[0]?.c ?? 0),
        schedules: {
          withSchedule,
          withoutSchedule: Math.max(0, totalSectionCourses - withSchedule),
          allComplete: totalSectionCourses > 0 && withSchedule === totalSectionCourses,
        },
        teachers: {
          withTeacher,
          withoutTeacher: Math.max(0, totalSectionCourses - withTeacher),
          allComplete: totalSectionCourses > 0 && withTeacher === totalSectionCourses,
        },
        faculties,
        readyFaculties,
      },
    };
  }

  async updateConfig(params: { initialCapacity: number; maxExtraCapacity: number }) {
    await this.dataSource.query(
      `
      INSERT INTO leveling_config (id, initialCapacity, maxExtraCapacity)
      VALUES (1, ?, ?)
      ON DUPLICATE KEY UPDATE
        initialCapacity = VALUES(initialCapacity),
        maxExtraCapacity = VALUES(maxExtraCapacity)
      `,
      [params.initialCapacity, params.maxExtraCapacity]
    );
    return this.getConfig();
  }

  async planFromExcel(params: {
    fileBuffer: Buffer;
    initialCapacity?: number;
    maxExtraCapacity?: number;
    apply?: boolean;
    groupModalityOverrides?: string;
    createdById?: string | null;
  }) {
    const cfg = await this.getConfig();
    const initialCapacity = params.initialCapacity ?? cfg.initialCapacity;
    const maxExtraCapacity = params.maxExtraCapacity ?? cfg.maxExtraCapacity;
    const apply = Boolean(params.apply);

    if (!params.fileBuffer || params.fileBuffer.length === 0) {
      throw new BadRequestException('Excel file is required');
    }
    if (initialCapacity < 1) {
      throw new BadRequestException('initialCapacity must be >= 1');
    }
    if (maxExtraCapacity < 0) {
      throw new BadRequestException('maxExtraCapacity must be >= 0');
    }


    if (apply) {
      const activeSummary = await this.getActiveRunSummary();
      if (activeSummary.run && activeSummary.run.status !== 'ARCHIVED') {
        throw new BadRequestException(
          'Ya existe un proceso de nivelación activo para este periodo. ' +
          'Por seguridad, debes eliminar los datos del periodo desde la pantalla de Periodos antes de volver a procesar.'
        );
      }
    }

    const careerFacultyMap = await this.loadCareerFacultyMap();
    const courseCatalogByKey = await this.loadCourseCatalogByKey();
    const parsed = this.parseExcel(
      params.fileBuffer,
      careerFacultyMap,
      courseCatalogByKey
    );
    if (parsed.courseNames.length === 0) {
      throw new BadRequestException(
        'No se detectaron cursos validos en la plantilla (columnas desde L)'
      );
    }
    const sectionCapacity = initialCapacity + maxExtraCapacity;
    const groupModalityOverrides = this.parseGroupModalityOverrides(
      params.groupModalityOverrides
    );
    const groupUnits = this.buildCourseGroupUnits({
      students: parsed.students,
      courseNames: parsed.courseNames,
      sectionCapacity,
      groupModalityOverrides,
    });
    const plannedSections = this.buildSectionsFromGroupUnits({
      students: parsed.students,
      groupUnits,
      courseNames: parsed.courseNames,
      sectionCapacity,
      initialCapacity,
      maxExtraCapacity,
    });

    let applied: null | ApplyStructureResult = null;

    if (apply) {
      applied = await this.applyPlan({
        sections: plannedSections,
        students: parsed.students,
        configUsed: {
          initialCapacity,
          maxExtraCapacity,
        },
        sourceFileHash: this.hashBuffer(params.fileBuffer),
        createdById: params.createdById ?? null,
      });
    }

    const summaryByCourse = this.initCourseCountMap(parsed.courseNames);
    for (const s of parsed.students) {
      for (const c of s.neededCourses) summaryByCourse[c]++;
    }
    const courseGroupSummary = this.buildCourseGroupSummary({
      groupUnits,
      courseNames: parsed.courseNames,
    });
    const groupPlan = this.buildGroupPlan(groupUnits, parsed.courseNames);
    const programNeeds = this.buildProgramNeeds(parsed.students, parsed.courseNames);

    return {
      configUsed: {
        initialCapacity,
        maxExtraCapacity,
      },
      inputSummary: {
        rowsRead: parsed.rowsRead,
        eligibleStudents: parsed.students.length,
        unknownCareers: parsed.unknownCareers,
      },
      needsByCourse: summaryByCourse,
      programNeeds,
      summary: courseGroupSummary,
      groupPlan,
      sections: plannedSections.map((s) => ({
        code: s.code,
        name: s.name,
        facultyGroup: s.facultyGroup,
        facultyName: s.facultyName,
        campusName: s.campusName,
        modality: s.modality,
        initialCapacity: s.initialCapacity,
        maxExtraCapacity: s.maxExtraCapacity,
        studentCount: s.students.length,
        courses: s.neededCourses,
        students: s.students
          .slice()
          .sort((a, b) => {
            const ca = this.norm(a.careerName || '');
            const cb = this.norm(b.careerName || '');
            if (ca !== cb) return ca.localeCompare(cb);
            const na = this.norm(a.fullName || '');
            const nb = this.norm(b.fullName || '');
            if (na !== nb) return na.localeCompare(nb);
            return a.dni.localeCompare(b.dni);
          })
          .map((x) => ({
            dni: x.dni,
            codigoAlumno: x.codigoAlumno,
            fullName: x.fullName,
            careerName: x.careerName,
            sectionCourses: Array.from(
              s.studentCoursesByDni.get(x.dni) ??
              new Set(
                s.neededCourses.filter((course) => x.neededCourses.includes(course))
              )
            ).sort(),
          })),
      })),
      runId: applied?.runId ?? null,
      runStatus: applied?.runStatus ?? null,
      applied,
    };
  }

  async getRunDetails(runId: string) {
    const run = await this.getRunOrThrow(runId);
    const sectionRows: Array<{ c: number; manualC: number }> = await this.dataSource.query(
      `
      SELECT
        COUNT(*) AS c,
        SUM(CASE WHEN s.isAutoLeveling = 0 THEN 1 ELSE 0 END) AS manualC
      FROM sections s
      WHERE s.levelingRunId = ?
      `,
      [run.id]
    );
    const sectionCourseRows: Array<{ c: number }> = await this.dataSource.query(
      `
      SELECT COUNT(*) AS c
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE s.levelingRunId = ?
        AND sc.periodId = ?
      `,
      [run.id, run.periodId]
    );
    const demandRows: Array<{ c: number; students: number }> = await this.dataSource.query(
      `
      SELECT
        COUNT(*) AS c,
        COUNT(DISTINCT studentId) AS students
      FROM leveling_run_student_course_demands
      WHERE runId = ?
      `,
      [run.id]
    );
    const assignedRows: Array<{ c: number }> = await this.dataSource.query(
      `
      SELECT COUNT(*) AS c
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE s.levelingRunId = ?
        AND sc.periodId = ?
      `,
      [run.id, run.periodId]
    );
    const scheduledRows: Array<{ c: number }> = await this.dataSource.query(
      `
      SELECT COUNT(DISTINCT sc.id) AS c
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      WHERE s.levelingRunId = ?
        AND sc.periodId = ?
      `,
      [run.id, run.periodId]
    );

    const sectionCourses = Number(sectionCourseRows[0]?.c ?? 0);
    const withSchedule = Number(scheduledRows[0]?.c ?? 0);
    return {
      runId: run.id,
      periodId: run.periodId,
      status: run.status as LevelingRunStatus,
      configUsed: run.configUsed,
      sourceFileHash: run.sourceFileHash,
      createdBy: run.createdBy,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      metrics: {
        sections: Number(sectionRows[0]?.c ?? 0),
        sectionCourses,
        manualSections: Number(sectionRows[0]?.manualC ?? 0),
        demands: Number(demandRows[0]?.c ?? 0),
        assigned: Number(assignedRows[0]?.c ?? 0),
        studentsWithDemand: Number(demandRows[0]?.students ?? 0),
        sectionCoursesWithSchedule: withSchedule,
        sectionCoursesWithoutSchedule: Math.max(0, sectionCourses - withSchedule),
      },
    };
  }

  async listRunSections(runId: string) {
    const run = await this.getRunOrThrow(runId);
    const sectionRows: Array<{
      sectionId: string;
      name: string;
      code: string | null;
      facultyGroup: string | null;
      facultyName: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      isAutoLeveling: number;
      levelingRunId: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        s.id AS sectionId,
        s.name AS name,
        s.code AS code,
        s.facultyGroup AS facultyGroup,
        s.facultyName AS facultyName,
        s.campusName AS campusName,
        s.modality AS modality,
        s.initialCapacity AS initialCapacity,
        s.maxExtraCapacity AS maxExtraCapacity,
        s.isAutoLeveling AS isAutoLeveling,
        s.levelingRunId AS levelingRunId
      FROM sections s
      WHERE s.levelingRunId = ?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC
      `,
      [run.id]
    );
    if (sectionRows.length === 0) return [];

    const sectionIds = sectionRows.map((x) => String(x.sectionId));
    const placeholders = sectionIds.map(() => '?').join(', ');
    const sectionCourseRows: Array<{
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      courseName: string;
      hasTeacher: number;
      scheduleBlocksCount: number;
      assignedStudents: number;
    }> = await this.dataSource.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName,
        CASE
          WHEN s.teacherId IS NOT NULL THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM section_course_teachers sct
            WHERE sct.sectionCourseId = sc.id
              AND sct.teacherId IS NOT NULL
          ) THEN 1
          ELSE 0
        END AS hasTeacher,
        COUNT(DISTINCT sb.id) AS scheduleBlocksCount,
        COUNT(DISTINCT ssc.studentId) AS assignedStudents
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
      LEFT JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.sectionId IN (${placeholders})
        AND sc.periodId = ?
      GROUP BY
        sc.id,
        sc.sectionId,
        sc.courseId,
        c.name,
        s.teacherId
      ORDER BY c.name ASC
      `,
      [...sectionIds, run.periodId]
    );

    const coursesBySection = new Map<string, typeof sectionCourseRows>();
    for (const row of sectionCourseRows) {
      const sectionId = String(row.sectionId);
      if (!coursesBySection.has(sectionId)) {
        coursesBySection.set(sectionId, []);
      }
      coursesBySection.get(sectionId)!.push(row);
    }

    return sectionRows.map((row) => ({
      sectionId: String(row.sectionId),
      name: String(row.name ?? ''),
      code: row.code ? String(row.code) : null,
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      facultyName: row.facultyName ? String(row.facultyName) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      modality: row.modality ? String(row.modality) : null,
      initialCapacity: Number(row.initialCapacity ?? 45),
      maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
      isAutoLeveling: Boolean(row.isAutoLeveling),
      levelingRunId: row.levelingRunId ? String(row.levelingRunId) : null,
      sectionCourses: (coursesBySection.get(String(row.sectionId)) ?? []).map((courseRow) => ({
        sectionCourseId: String(courseRow.sectionCourseId),
        courseId: String(courseRow.courseId),
        courseName: String(courseRow.courseName ?? ''),
        hasSchedule: Number(courseRow.scheduleBlocksCount ?? 0) > 0,
        hasTeacher: Number(courseRow.hasTeacher ?? 0) > 0,
        scheduleBlocksCount: Number(courseRow.scheduleBlocksCount ?? 0),
        assignedStudents: Number(courseRow.assignedStudents ?? 0),
      })),
    }));
  }

  async createManualSectionCourse(
    runId: string,
    dto: CreateLevelingManualSectionCourseDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const run = await this.getRunOrThrow(runId, manager);
      if (run.status === 'ARCHIVED') {
        throw new BadRequestException('Cannot mutate an archived leveling run');
      }

      const course = await this.resolveCourseByNameOrThrow(dto.courseName, manager);
      const cfg = run.configUsed;
      const initialCapacity = dto.initialCapacity ?? cfg.initialCapacity ?? 45;
      const maxExtraCapacity = dto.maxExtraCapacity ?? cfg.maxExtraCapacity ?? 0;
      const sectionCode = await this.generateManualSectionCode({
        manager,
        facultyGroup: dto.facultyGroup,
        campusName: dto.campusName,
      });

      const sectionId = randomUUID();
      await manager.query(
        `
        INSERT INTO sections (
          id,
          name,
          code,
          akademicSectionId,
          facultyGroup,
          facultyName,
          campusName,
          modality,
          teacherId,
          initialCapacity,
          maxExtraCapacity,
          isAutoLeveling,
          levelingRunId,
          createdAt,
          updatedAt
        )
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, 0, ?, NOW(6), NOW(6))
        `,
        [
          sectionId,
          sectionCode,
          sectionCode,
          dto.facultyGroup,
          String(dto.facultyName ?? '').trim() || this.defaultFacultyName(dto.facultyGroup),
          dto.campusName,
          dto.modality,
          initialCapacity,
          maxExtraCapacity,
          run.id,
        ]
      );

      const sectionCourseId = randomUUID();
      await manager.query(
        `
        INSERT INTO section_courses (
          id,
          periodId,
          sectionId,
          courseId,
          idakademic,
          createdAt,
          updatedAt
        )
        VALUES (?, ?, ?, ?, NULL, NOW(6), NOW(6))
        `,
        [sectionCourseId, run.periodId, sectionId, course.id]
      );

      return {
        runId: run.id,
        sectionId,
        sectionCourseId,
        sectionCode,
        sectionName: sectionCode,
        courseId: course.id,
        courseName: course.name,
        isAutoLeveling: false,
      };
    });
  }

  async deleteManualSectionCourse(runId: string, sectionCourseId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.getRunOrThrow(runId, manager);
      const rows: Array<{
        sectionCourseId: string;
        sectionId: string;
        isAutoLeveling: number;
      }> = await manager.query(
        `
        SELECT
          sc.id AS sectionCourseId,
          sc.sectionId AS sectionId,
          s.isAutoLeveling AS isAutoLeveling
        FROM section_courses sc
        INNER JOIN sections s ON s.id = sc.sectionId
        WHERE sc.id = ?
          AND s.levelingRunId = ?
        LIMIT 1
        `,
        [sectionCourseId, runId]
      );
      const sectionCourse = rows[0];
      if (!sectionCourse?.sectionCourseId) {
        throw new NotFoundException('Section-course not found in this leveling run');
      }
      if (Number(sectionCourse.isAutoLeveling ?? 0) > 0) {
        throw new BadRequestException(
          'Cannot delete auto-generated section-course from leveling run'
        );
      }

      const assignedRows: Array<{ c: number }> = await manager.query(
        `
        SELECT COUNT(*) AS c
        FROM section_student_courses
        WHERE sectionCourseId = ?
        `,
        [sectionCourseId]
      );
      if (Number(assignedRows[0]?.c ?? 0) > 0) {
        throw new ConflictException(
          'Cannot delete manual section-course with enrolled students'
        );
      }

      await manager.query(
        `
        DELETE FROM section_courses
        WHERE id = ?
        LIMIT 1
        `,
        [sectionCourseId]
      );

      const remainRows: Array<{ c: number }> = await manager.query(
        `
        SELECT COUNT(*) AS c
        FROM section_courses
        WHERE sectionId = ?
        `,
        [sectionCourse.sectionId]
      );
      let sectionDeleted = false;
      if (Number(remainRows[0]?.c ?? 0) === 0) {
        await manager.query(
          `
          DELETE FROM sections
          WHERE id = ?
            AND levelingRunId = ?
            AND isAutoLeveling = 0
          LIMIT 1
          `,
          [sectionCourse.sectionId, runId]
        );
        sectionDeleted = true;
      }

      return {
        ok: true,
        runId,
        sectionCourseId,
        sectionDeleted,
      };
    });
  }

  async matriculateRun(runId: string, facultyGroup?: string) {
    return this.dataSource.transaction(async (manager) => {
      const run = await this.getRunOrThrow(runId, manager);
      if (run.status === 'ARCHIVED') {
        throw new BadRequestException('No se puede matricular una corrida archivada');
      }

      const targetFaculty = facultyGroup ? String(facultyGroup).trim() : null;
      const hasPlannedCapacityTable = await this.tableExists(
        manager,
        'leveling_run_section_course_capacities'
      );
      const capacityInitialExpr = hasPlannedCapacityTable
        ? `
          CASE
            WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN s.initialCapacity
            WHEN lrscc.plannedCapacity IS NOT NULL THEN lrscc.plannedCapacity
            ELSE s.initialCapacity
          END
        `
        : `s.initialCapacity`;
      const capacityExtraExpr = hasPlannedCapacityTable
        ? `
          CASE
            WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN s.maxExtraCapacity
            WHEN lrscc.plannedCapacity IS NOT NULL THEN 0
            ELSE s.maxExtraCapacity
          END
        `
        : `s.maxExtraCapacity`;
      const plannedCapacityJoin = hasPlannedCapacityTable
        ? `
        LEFT JOIN leveling_run_section_course_capacities lrscc
          ON lrscc.runId = ?
         AND lrscc.sectionCourseId = sc.id
        `
        : '';

      const sectionCourseRows: Array<{
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        facultyGroup: string | null;
        campusName: string | null;
        modality: string | null;
        initialCapacity: number;
        maxExtraCapacity: number;
        hasTeacher: number;
      }> = await manager.query(
        `
        SELECT
          sc.id AS sectionCourseId,
          sc.sectionId AS sectionId,
          s.code AS sectionCode,
          s.name AS sectionName,
          sc.courseId AS courseId,
          c.name AS courseName,
          s.facultyGroup AS facultyGroup,
          s.campusName AS campusName,
          s.modality AS modality,
          ${capacityInitialExpr} AS initialCapacity,
          ${capacityExtraExpr} AS maxExtraCapacity,
          CASE
            WHEN s.teacherId IS NOT NULL THEN 1
            WHEN EXISTS (
              SELECT 1
              FROM section_course_teachers sct
              WHERE sct.sectionCourseId = sc.id
                AND sct.teacherId IS NOT NULL
            ) THEN 1
            ELSE 0
          END AS hasTeacher
        FROM section_courses sc
        INNER JOIN sections s ON s.id = sc.sectionId
        INNER JOIN courses c ON c.id = sc.courseId
        ${plannedCapacityJoin}
        WHERE s.levelingRunId = ?
          AND sc.periodId = ?
          ${targetFaculty ? 'AND s.facultyGroup = ?' : ''}
        ORDER BY
          s.code ASC,
          s.name ASC,
          c.name ASC
        `,
        [
          ...(hasPlannedCapacityTable ? [run.id] : []),
          run.id,
          run.periodId,
          ...(targetFaculty ? [targetFaculty] : []),
        ]
      );
      if (sectionCourseRows.length === 0) {
        throw new BadRequestException(
          targetFaculty
            ? `No hay secciones-curso para la facultad ${targetFaculty}`
            : 'No hay secciones-curso para ejecutar matrícula'
        );
      }

      const sectionCourseIds = sectionCourseRows.map((x) => String(x.sectionCourseId));
      const placeholders = sectionCourseIds.map(() => '?').join(', ');
      const blockRows: Array<{
        sectionCourseId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      }> = await manager.query(
        `
        SELECT
          sb.sectionCourseId AS sectionCourseId,
          sb.dayOfWeek AS dayOfWeek,
          sb.startTime AS startTime,
          sb.endTime AS endTime,
          sb.startDate AS startDate,
          sb.endDate AS endDate
        FROM schedule_blocks sb
        WHERE sb.sectionCourseId IN (${placeholders})
        ORDER BY sb.dayOfWeek ASC, sb.startTime ASC
        `,
        sectionCourseIds
      );

      const blocksBySectionCourse = new Map<string, ScheduleBlockWindow[]>();
      for (const row of blockRows) {
        const key = String(row.sectionCourseId);
        if (!blocksBySectionCourse.has(key)) {
          blocksBySectionCourse.set(key, []);
        }
        blocksBySectionCourse.get(key)!.push({
          dayOfWeek: Number(row.dayOfWeek ?? 0),
          startTime: String(row.startTime ?? ''),
          endTime: String(row.endTime ?? ''),
          startDate: this.toIsoDateOnly(row.startDate),
          endDate: this.toIsoDateOnly(row.endDate),
        });
      }

      const withoutSchedule = sectionCourseRows.filter(
        (row) => (blocksBySectionCourse.get(String(row.sectionCourseId)) ?? []).length === 0
      );
      if (withoutSchedule.length > 0) {
        throw new BadRequestException(
          `Cada sección-curso requiere al menos 1 bloque horario antes de matricular. Faltan: ${withoutSchedule
            .map((x) => `${x.sectionCode ?? x.sectionName} - ${x.courseName}`)
            .join(', ')}`
        );
      }

      const withoutTeacher = sectionCourseRows.filter(
        (row) => Number(row.hasTeacher ?? 0) === 0
      );
      if (withoutTeacher.length > 0) {
        throw new BadRequestException(
          `Cada sección-curso requiere docente asignado antes de matricular. Faltan: ${withoutTeacher
            .map((x) => `${x.sectionCode ?? x.sectionName} - ${x.courseName}`)
            .join(', ')}`
        );
      }

      const demands: StudentDemandItem[] = await manager.query(
        `
        SELECT
          d.studentId AS studentId,
          u.codigoAlumno AS studentCode,
          u.fullName AS studentName,
          d.courseId AS courseId,
          c.name AS courseName,
          d.facultyGroup AS facultyGroup,
          d.campusName AS campusName
        FROM leveling_run_student_course_demands d
        INNER JOIN users u ON u.id = d.studentId
        INNER JOIN courses c ON c.id = d.courseId
        WHERE d.runId = ?
          AND d.required = 1
          ${targetFaculty ? 'AND d.facultyGroup = ?' : ''}
        ORDER BY u.fullName ASC, c.name ASC
        `,
        [run.id, ...(targetFaculty ? [targetFaculty] : [])]
      );
      if (demands.length === 0) {
        throw new BadRequestException(
          targetFaculty
            ? `No hay demandas pendientes alumno-curso para la facultad ${targetFaculty}`
            : 'No hay demandas pendientes alumno-curso para matricular'
        );
      }

      await this.deleteSectionStudentCoursesBySectionCourseIds(manager, sectionCourseIds);

      type Candidate = {
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        facultyGroup: string | null;
        campusName: string | null;
        modality: string | null;
        initialCapacity: number;
        maxExtraCapacity: number;
        assignedCount: number;
        blocks: ScheduleBlockWindow[];
      };

      const candidatesByCourse = new Map<string, Candidate[]>();
      for (const row of sectionCourseRows) {
        const key = String(row.courseId);
        if (!candidatesByCourse.has(key)) {
          candidatesByCourse.set(key, []);
        }
        candidatesByCourse.get(key)!.push({
          sectionCourseId: String(row.sectionCourseId),
          sectionId: String(row.sectionId),
          sectionCode: row.sectionCode ? String(row.sectionCode) : null,
          sectionName: String(row.sectionName ?? ''),
          courseId: String(row.courseId),
          courseName: String(row.courseName ?? ''),
          facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
          campusName: row.campusName ? String(row.campusName) : null,
          modality: row.modality ? String(row.modality).toUpperCase().trim() : null,
          initialCapacity: Number(row.initialCapacity ?? 45),
          maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
          assignedCount: 0,
          blocks: blocksBySectionCourse.get(String(row.sectionCourseId)) ?? [],
        });
      }

      const demandWithCandidates = demands.map((demand) => {
        const allCourseCandidates = candidatesByCourse.get(String(demand.courseId)) ?? [];
        const sameFaculty = allCourseCandidates.filter(
          (candidate) =>
            this.scopeKey(candidate.facultyGroup) === this.scopeKey(demand.facultyGroup)
        );
        const sameScope = sameFaculty.filter(
          (candidate) =>
            this.scopeKey(candidate.campusName) === this.scopeKey(demand.campusName)
        );
        const virtualFacultyFallback = sameFaculty.filter((candidate) =>
          this.isVirtualModality(candidate.modality)
        );

        // Keep same-scope candidates first, but always allow virtual sections in the
        // same faculty as fallback (virtual has no hard cap by design).
        const prioritized =
          sameScope.length > 0
            ? [...sameScope, ...virtualFacultyFallback]
            : allCourseCandidates;
        const dedup = new Map<string, Candidate>();
        for (const candidate of prioritized) {
          dedup.set(candidate.sectionCourseId, candidate);
        }

        return {
          ...demand,
          candidates: [...dedup.values()],
        };
      });

      demandWithCandidates.sort((a, b) => {
        if (a.candidates.length !== b.candidates.length) {
          return a.candidates.length - b.candidates.length;
        }
        const sa = this.scopeKey(a.facultyGroup) + this.scopeKey(a.campusName);
        const sb = this.scopeKey(b.facultyGroup) + this.scopeKey(b.campusName);
        if (sa !== sb) return sa.localeCompare(sb);
        const na = this.scopeKey(a.studentName);
        const nb = this.scopeKey(b.studentName);
        if (na !== nb) return na.localeCompare(nb);
        return this.scopeKey(a.courseName).localeCompare(this.scopeKey(b.courseName));
      });

      const assignedBlocksByStudent = new Map<string, ScheduleBlockWindow[]>();
      const rowsToInsert: Array<{
        id: string;
        sectionCourseId: string;
        sectionId: string;
        courseId: string;
        studentId: string;
      }> = [];
      const unassigned: Array<{
        studentId: string;
        studentCode: string | null;
        studentName: string;
        courseId: string;
        courseName: string;
        facultyGroup: string | null;
        campusName: string | null;
        reason: string;
      }> = [];

      const getStudentBlocks = (studentId: string) => {
        if (!assignedBlocksByStudent.has(studentId)) {
          assignedBlocksByStudent.set(studentId, []);
        }
        return assignedBlocksByStudent.get(studentId)!;
      };

      for (const demand of demandWithCandidates) {
        if (demand.candidates.length === 0) {
          unassigned.push({
            studentId: String(demand.studentId),
            studentCode: demand.studentCode ? String(demand.studentCode) : null,
            studentName: String(demand.studentName ?? ''),
            courseId: String(demand.courseId),
            courseName: String(demand.courseName ?? ''),
            facultyGroup: demand.facultyGroup ? String(demand.facultyGroup) : null,
            campusName: demand.campusName ? String(demand.campusName) : null,
            reason: 'No se encontró sección-curso candidata para este curso',
          });
          continue;
        }

        const studentId = String(demand.studentId);
        const studentBlocks = getStudentBlocks(studentId);

        // Filter candidates: capacity OK + no schedule conflict
        const available = demand.candidates.filter((candidate) => {
          if (this.isCapacityBlocked(candidate)) return false;
          if (this.hasScheduleOverlap(studentBlocks, candidate.blocks)) return false;
          return true;
        });

        if (available.length === 0) {
          const blockedByCapacity =
            demand.candidates.every((candidate) => this.isCapacityBlocked(candidate)) &&
            demand.candidates.length > 0;
          unassigned.push({
            studentId: String(demand.studentId),
            studentCode: demand.studentCode ? String(demand.studentCode) : null,
            studentName: String(demand.studentName ?? ''),
            courseId: String(demand.courseId),
            courseName: String(demand.courseName ?? ''),
            facultyGroup: demand.facultyGroup ? String(demand.facultyGroup) : null,
            campusName: demand.campusName ? String(demand.campusName) : null,
            reason: blockedByCapacity
              ? 'No hay capacidad disponible en las secciones-curso candidatas'
              : 'Cruce de horario con cursos ya asignados',
          });
          continue;
        }

        this.sortCandidatesForAssignment(available);
        const selected = available[0];

        rowsToInsert.push({
          id: randomUUID(),
          sectionCourseId: selected.sectionCourseId,
          sectionId: selected.sectionId,
          courseId: selected.courseId,
          studentId: String(demand.studentId),
        });
        selected.assignedCount += 1;
        studentBlocks.push(...selected.blocks);

      }

      await this.bulkInsertSectionStudentCoursesIgnore(manager, rowsToInsert);

      const conflictsRows: Array<{ c: number }> = await manager.query(
        `
        SELECT COUNT(*) AS c
        FROM (
          SELECT 1
          FROM section_student_courses ssc1
          INNER JOIN section_student_courses ssc2
            ON ssc2.studentId = ssc1.studentId
           AND ssc2.sectionCourseId > ssc1.sectionCourseId
          INNER JOIN section_courses sc1 ON sc1.id = ssc1.sectionCourseId
          INNER JOIN section_courses sc2 ON sc2.id = ssc2.sectionCourseId
          INNER JOIN sections s1 ON s1.id = sc1.sectionId
          INNER JOIN sections s2 ON s2.id = sc2.sectionId
          INNER JOIN schedule_blocks b1 ON b1.sectionCourseId = sc1.id
          INNER JOIN schedule_blocks b2
            ON b2.sectionCourseId = sc2.id
           AND b1.dayOfWeek = b2.dayOfWeek
           AND b1.startTime < b2.endTime
           AND b1.endTime > b2.startTime
           AND COALESCE(b1.startDate, '1000-01-01') <= COALESCE(b2.endDate, '9999-12-31')
           AND COALESCE(b2.startDate, '1000-01-01') <= COALESCE(b1.endDate, '9999-12-31')
          WHERE s1.levelingRunId = ?
            AND s2.levelingRunId = ?
            AND sc1.periodId = ?
            AND sc2.periodId = ?
          LIMIT 1
        ) z
        `,
        [run.id, run.id, run.periodId, run.periodId]
      );
      const conflictsFoundAfterAssign = Number(conflictsRows[0]?.c ?? 0);
      const nextStatus: LevelingRunStatus =
        unassigned.length === 0 ? 'MATRICULATED' : 'READY';

      await manager.query(
        `
        UPDATE leveling_runs
        SET
          status = ?,
          updatedAt = NOW(6)
        WHERE id = ?
        `,
        [nextStatus, run.id]
      );

      return {
        runId: run.id,
        status: nextStatus,
        assignedCount: rowsToInsert.length,
        unassigned,
        summaryBySectionCourse: sectionCourseRows.map((row) => {
          const candidate = (candidatesByCourse.get(String(row.courseId)) ?? []).find(
            (x) => x.sectionCourseId === String(row.sectionCourseId)
          );
          return {
            sectionCourseId: String(row.sectionCourseId),
            sectionId: String(row.sectionId),
            sectionCode: row.sectionCode ? String(row.sectionCode) : null,
            sectionName: String(row.sectionName ?? ''),
            courseId: String(row.courseId),
            courseName: String(row.courseName ?? ''),
            assignedCount: Number(candidate?.assignedCount ?? 0),
            initialCapacity: Number(row.initialCapacity ?? 45),
            maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
          };
        }),
        conflictsFoundAfterAssign,
      };
    });
  }

  async getRunMatriculationPreview(runId: string, facultyGroup?: string) {
    const run = await this.getRunOrThrow(runId);
    const targetFaculty = String(facultyGroup ?? '').trim() || null;

    const { sectionCourseRows, blocksBySectionCourse } =
      await this.loadMatriculationPreviewContext({
        runId: run.id,
        periodId: run.periodId,
      });
    if (sectionCourseRows.length === 0) {
      throw new BadRequestException('No hay secciones-curso configuradas para esta corrida');
    }

    const faculties = this.buildMatriculationFacultyStatuses(
      sectionCourseRows,
      blocksBySectionCourse
    );
    const readyFacultyGroups = faculties
      .filter((row) => row.ready)
      .map((row) => row.facultyGroup);

    if (!targetFaculty) {
      return {
        runId: run.id,
        status: run.status as LevelingRunStatus,
        selectedFacultyGroup: null,
        faculties,
        readyFacultyGroups,
        canMatriculateSelectedFaculty: false,
        assignedCount: 0,
        sections: [],
        summaryBySectionCourse: [],
        unassigned: [],
        conflicts: [],
      };
    }

    const scopedRows = sectionCourseRows.filter(
      (row) => this.scopeKey(row.facultyGroup) === this.scopeKey(targetFaculty)
    );
    if (scopedRows.length === 0) {
      throw new BadRequestException(
        `No hay secciones-curso para la facultad ${targetFaculty}`
      );
    }

    const canMatriculateSelectedFaculty = readyFacultyGroups.some(
      (item) => this.scopeKey(item) === this.scopeKey(targetFaculty)
    );

    let assignedCount = 0;
    let summaryBySectionCourse = scopedRows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      sectionName: String(row.sectionName ?? ''),
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
      assignedCount: 0,
      initialCapacity: Number(row.initialCapacity ?? 45),
      maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
    }));
    let unassigned: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      reason: string;
    }> = [];
    let conflicts: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      dayOfWeek: number;
      blockA: {
        blockId: string;
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      };
      blockB: {
        blockId: string;
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      };
    }> = [];
    const studentsBySectionCourse = new Map<
      string,
      Array<{ studentId: string; studentCode: string | null; studentName: string }>
    >();

    if (canMatriculateSelectedFaculty) {
      const simulation = await this.simulateMatriculationAssignments({
        runId: run.id,
        facultyGroup: targetFaculty,
        sectionCourseRows: scopedRows,
        blocksBySectionCourse,
      });
      assignedCount = simulation.assignedCount;
      summaryBySectionCourse = simulation.summaryBySectionCourse;
      unassigned = simulation.unassigned;
      conflicts = simulation.conflicts;
      for (const [key, value] of simulation.studentsBySectionCourse.entries()) {
        studentsBySectionCourse.set(key, value.slice());
      }
    }

    const summaryBySectionCourseId = new Map(
      summaryBySectionCourse.map((row) => [String(row.sectionCourseId), row])
    );

    const sectionsById = new Map<string, any>();
    for (const row of scopedRows) {
      const sectionId = String(row.sectionId);
      if (!sectionsById.has(sectionId)) {
        sectionsById.set(sectionId, {
          sectionId,
          sectionCode: row.sectionCode ? String(row.sectionCode) : null,
          sectionName: String(row.sectionName ?? ''),
          facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
          facultyName: row.facultyName ? String(row.facultyName) : null,
          campusName: row.campusName ? String(row.campusName) : null,
          modality: row.modality ? String(row.modality) : null,
          initialCapacity: Number(row.initialCapacity ?? 45),
          maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
          teacherId: row.teacherId ? String(row.teacherId) : null,
          teacherName: row.teacherName ? String(row.teacherName) : null,
          sectionCourses: [],
        });
      }

      const summary = summaryBySectionCourseId.get(String(row.sectionCourseId));
      const students = (
        studentsBySectionCourse.get(String(row.sectionCourseId)) ?? []
      ).slice();
      students.sort((a, b) => {
        const nameCmp = this.scopeKey(a.studentName).localeCompare(
          this.scopeKey(b.studentName)
        );
        if (nameCmp !== 0) return nameCmp;
        return this.scopeKey(a.studentCode).localeCompare(this.scopeKey(b.studentCode));
      });

      sectionsById.get(sectionId).sectionCourses.push({
        sectionCourseId: String(row.sectionCourseId),
        sectionId,
        sectionCode: row.sectionCode ? String(row.sectionCode) : null,
        sectionName: String(row.sectionName ?? ''),
        courseId: String(row.courseId),
        courseName: String(row.courseName ?? ''),
        teacherId: row.teacherId ? String(row.teacherId) : null,
        teacherName: row.teacherName ? String(row.teacherName) : null,
        initialCapacity: Number(row.initialCapacity ?? 45),
        maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
        hasSchedule:
          (blocksBySectionCourse.get(String(row.sectionCourseId)) ?? []).length > 0,
        hasTeacher: Number(row.hasTeacher ?? 0) > 0,
        assignedCount: Number(summary?.assignedCount ?? 0),
        students,
      });
    }

    const sections = Array.from(sectionsById.values())
      .map((section) => ({
        ...section,
        sectionCourses: section.sectionCourses.sort((a: any, b: any) =>
          this.scopeKey(a.courseName).localeCompare(this.scopeKey(b.courseName))
        ),
      }))
      .sort((a, b) => {
        const codeCmp = this.scopeKey(a.sectionCode ?? a.sectionName).localeCompare(
          this.scopeKey(b.sectionCode ?? b.sectionName)
        );
        if (codeCmp !== 0) return codeCmp;
        return this.scopeKey(a.sectionName).localeCompare(this.scopeKey(b.sectionName));
      });

    return {
      runId: run.id,
      status: run.status as LevelingRunStatus,
      selectedFacultyGroup: targetFaculty,
      faculties,
      readyFacultyGroups,
      canMatriculateSelectedFaculty,
      assignedCount,
      sections,
      summaryBySectionCourse,
      unassigned,
      conflicts,
    };
  }

  async listRunScheduleConflicts(params: {
    runId: string;
    facultyGroup?: string;
    campusName?: string;
  }) {
    const run = await this.getRunOrThrow(params.runId);
    const facultyGroup = String(params.facultyGroup ?? '').trim();
    const campusName = String(params.campusName ?? '').trim();

    const rows: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      dayOfWeek: number;
      blockIdA: string;
      sectionCourseIdA: string;
      sectionIdA: string;
      sectionCodeA: string | null;
      sectionNameA: string;
      courseIdA: string;
      courseNameA: string;
      startTimeA: string;
      endTimeA: string;
      startDateA: string | null;
      endDateA: string | null;
      blockIdB: string;
      sectionCourseIdB: string;
      sectionIdB: string;
      sectionCodeB: string | null;
      sectionNameB: string;
      courseIdB: string;
      courseNameB: string;
      startTimeB: string;
      endTimeB: string;
      startDateB: string | null;
      endDateB: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        u.id AS studentId,
        u.codigoAlumno AS studentCode,
        u.fullName AS studentName,
        b1.dayOfWeek AS dayOfWeek,
        b1.id AS blockIdA,
        sc1.id AS sectionCourseIdA,
        s1.id AS sectionIdA,
        s1.code AS sectionCodeA,
        s1.name AS sectionNameA,
        c1.id AS courseIdA,
        c1.name AS courseNameA,
        b1.startTime AS startTimeA,
        b1.endTime AS endTimeA,
        b1.startDate AS startDateA,
        b1.endDate AS endDateA,
        b2.id AS blockIdB,
        sc2.id AS sectionCourseIdB,
        s2.id AS sectionIdB,
        s2.code AS sectionCodeB,
        s2.name AS sectionNameB,
        c2.id AS courseIdB,
        c2.name AS courseNameB,
        b2.startTime AS startTimeB,
        b2.endTime AS endTimeB,
        b2.startDate AS startDateB,
        b2.endDate AS endDateB
      FROM section_student_courses ssc1
      INNER JOIN section_student_courses ssc2
        ON ssc2.studentId = ssc1.studentId
       AND ssc2.sectionCourseId > ssc1.sectionCourseId
      INNER JOIN section_courses sc1
        ON sc1.id = ssc1.sectionCourseId
       AND sc1.periodId = ?
      INNER JOIN section_courses sc2
        ON sc2.id = ssc2.sectionCourseId
       AND sc2.periodId = ?
      INNER JOIN sections s1 ON s1.id = sc1.sectionId
      INNER JOIN sections s2 ON s2.id = sc2.sectionId
      INNER JOIN schedule_blocks b1 ON b1.sectionCourseId = sc1.id
      INNER JOIN schedule_blocks b2
        ON b2.sectionCourseId = sc2.id
       AND b1.dayOfWeek = b2.dayOfWeek
       AND b1.startTime < b2.endTime
       AND b1.endTime > b2.startTime
       AND COALESCE(b1.startDate, '1000-01-01') <= COALESCE(b2.endDate, '9999-12-31')
       AND COALESCE(b2.startDate, '1000-01-01') <= COALESCE(b1.endDate, '9999-12-31')
      INNER JOIN courses c1 ON c1.id = sc1.courseId
      INNER JOIN courses c2 ON c2.id = sc2.courseId
      INNER JOIN users u ON u.id = ssc1.studentId
      WHERE s1.levelingRunId = ?
        AND s2.levelingRunId = ?
        AND (? = '' OR s1.facultyGroup = ? OR s2.facultyGroup = ?)
        AND (? = '' OR s1.campusName = ? OR s2.campusName = ?)
      ORDER BY
        u.fullName ASC,
        u.codigoAlumno ASC,
        b1.dayOfWeek ASC,
        b1.startTime ASC
      `,
      [
        run.periodId,
        run.periodId,
        run.id,
        run.id,
        facultyGroup,
        facultyGroup,
        facultyGroup,
        campusName,
        campusName,
        campusName,
      ]
    );

    return rows.map((row) => ({
      studentId: String(row.studentId),
      studentCode: row.studentCode ? String(row.studentCode) : null,
      studentName: String(row.studentName ?? ''),
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      blockA: {
        blockId: String(row.blockIdA),
        sectionCourseId: String(row.sectionCourseIdA),
        sectionId: String(row.sectionIdA),
        sectionCode: row.sectionCodeA ? String(row.sectionCodeA) : null,
        sectionName: String(row.sectionNameA ?? ''),
        courseId: String(row.courseIdA),
        courseName: String(row.courseNameA ?? ''),
        startTime: String(row.startTimeA ?? ''),
        endTime: String(row.endTimeA ?? ''),
        startDate: this.toIsoDateOnly(row.startDateA),
        endDate: this.toIsoDateOnly(row.endDateA),
      },
      blockB: {
        blockId: String(row.blockIdB),
        sectionCourseId: String(row.sectionCourseIdB),
        sectionId: String(row.sectionIdB),
        sectionCode: row.sectionCodeB ? String(row.sectionCodeB) : null,
        sectionName: String(row.sectionNameB ?? ''),
        courseId: String(row.courseIdB),
        courseName: String(row.courseNameB ?? ''),
        startTime: String(row.startTimeB ?? ''),
        endTime: String(row.endTimeB ?? ''),
        startDate: this.toIsoDateOnly(row.startDateB),
        endDate: this.toIsoDateOnly(row.endDateB),
      },
    }));
  }

  private parseExcel(
    buffer: Buffer,
    careerFacultyMap: Map<string, string>,
    courseCatalogByKey: Map<string, { id: string; name: string }>
  ): {
    rowsRead: number;
    students: ParsedStudent[];
    unknownCareers: string[];
    courseNames: CourseName[];
  } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Excel file has no sheets');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    const headerRowIdx = this.findHeaderRowIndex(rows);
    const headerRow = headerRowIdx >= 0 ? rows[headerRowIdx] ?? [] : [];
    const columns = this.resolveExcelColumns(headerRow, courseCatalogByKey);
    if (headerRowIdx < 0) {
      columns.orderIdx = 0;
      columns.studentCodeIdx = 3;
      columns.campusIdx = 10;
      columns.modalityIdx = 11;
      columns.emailIdx = 8;
      columns.sexIdx = 9;
      columns.conditionIdx = 23;
      columns.needsLevelingIdx = 24;
    }
    const hasIngresoFilter =
      columns.conditionIdx !== null && columns.needsLevelingIdx !== null;
    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 5;

    let rowsRead = 0;
    const rowsToProcess: (string | number | null)[][] = [];

    // Deduplication logic: explicit user request to keep only the latest exam date per student
    if (columns.dniIdx !== null && columns.examDateIdx !== null) {
      const byDni = new Map<string, (string | number | null)[][]>();
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i] ?? [];
        if (row.every((value) => !String(value ?? '').trim())) continue;
        rowsRead++; // Count every valid row read from file
        const dni = this.normalizeDni(this.cell(row, columns.dniIdx));
        if (!dni) continue; // Skip rows without valid DNI during deduplication mapping
        if (!byDni.has(dni)) byDni.set(dni, []);
        byDni.get(dni)!.push(row);
      }

      for (const group of byDni.values()) {
        if (group.length === 1) {
          rowsToProcess.push(group[0]);
          continue;
        }
        // Descending sort by date
        group.sort((a, b) => {
          // Note: cell() helper is instance method
          const da = this.parseSmartDate(this.cell(a, columns.examDateIdx!));
          const db = this.parseSmartDate(this.cell(b, columns.examDateIdx!));
          return db - da;
        });
        rowsToProcess.push(group[0]);
      }
    } else {
      // Fallback: process all valid rows
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i] ?? [];
        if (row.every((value) => !String(value ?? '').trim())) continue;
        rowsRead++;
        rowsToProcess.push(row);
      }
    }

    const studentByDni = new Map<string, ParsedStudent>();
    const unknownCareerSet = new Set<string>();
    const activeCourseNames = new Set<CourseName>();

    for (const row of rowsToProcess) {
      if (columns.orderIdx !== null) {
        const orderNumber = this.cell(row, columns.orderIdx);
        if (!orderNumber || !/^\d+$/.test(orderNumber)) continue;
      }
      // rowsRead is already counted above

      // 1. Existing legacy filter (Ingreso + Needs Leveling)
      if (hasIngresoFilter) {
        const condition = this.norm(this.cell(row, columns.conditionIdx!));
        const needsLeveling = this.norm(this.cell(row, columns.needsLevelingIdx!));
        if (condition !== 'INGRESO') continue;
        if (needsLeveling !== 'SI') continue;
      }

      // 2. New filter: PROGRAMA DE NIVELACIÓN (must be SI)
      // Applied AFTER date deduplication (since we are iterating rowsToProcess)
      if (columns.programLevelingIdx !== null) {
        const programVal = this.norm(this.cell(row, columns.programLevelingIdx));
        if (programVal !== 'SI') continue;
      }

      const dni = this.normalizeDni(this.cell(row, columns.dniIdx));
      if (!dni) continue;

      const apellidoPaternoRaw =
        columns.paternalLastNameIdx !== null
          ? this.cell(row, columns.paternalLastNameIdx)
          : '';
      const apellidoMaternoRaw =
        columns.maternalLastNameIdx !== null
          ? this.cell(row, columns.maternalLastNameIdx)
          : '';
      const nombresRaw = columns.namesIdx !== null ? this.cell(row, columns.namesIdx) : '';
      const fullNameRaw =
        columns.fullNameIdx !== null
          ? this.cell(row, columns.fullNameIdx)
          : `${apellidoPaternoRaw} ${apellidoMaternoRaw} ${nombresRaw}`.trim();
      const fullNameParts = this.splitFullName(fullNameRaw);
      const apellidoPaterno = apellidoPaternoRaw || fullNameParts.paternalLastName;
      const apellidoMaterno = apellidoMaternoRaw || fullNameParts.maternalLastName;
      const nombres = nombresRaw || fullNameParts.names;
      const emailRaw = columns.emailIdx !== null ? this.cell(row, columns.emailIdx) : '';
      const sexRaw = columns.sexIdx !== null ? this.cell(row, columns.sexIdx) : '';

      const codigoAlumno =
        columns.studentCodeIdx !== null ? this.cell(row, columns.studentCodeIdx) || null : null;
      const fullName =
        fullNameRaw || `${apellidoPaterno} ${apellidoMaterno} ${nombres}`.trim() || `Alumno ${dni}`;
      const email = this.normalizeEmail(emailRaw);
      const sex = this.normalizeSex(sexRaw);
      const careerName = this.cell(row, columns.careerIdx);
      const area =
        columns.areaIdx !== null ? this.cell(row, columns.areaIdx) : this.cell(row, 5);
      const campusRaw = columns.campusIdx !== null ? this.cell(row, columns.campusIdx) : '';
      const modalityRaw =
        columns.modalityIdx !== null ? this.cell(row, columns.modalityIdx) : '';
      const facultyRaw =
        columns.facultyIdx !== null ? this.cell(row, columns.facultyIdx) : '';
      const neededCourses = this.extractNeededCourses(row, columns.courseColumns);
      if (neededCourses.length === 0) continue;
      for (const courseName of neededCourses) activeCourseNames.add(courseName);

      const mappedFaculty = careerFacultyMap.get(this.norm(careerName));
      const facultyName = facultyRaw || mappedFaculty || this.fallbackFaculty(area);
      if (!mappedFaculty && careerName) {
        unknownCareerSet.add(careerName);
      }

      const facultyGroup = this.facultyGroupOf(facultyName);
      const { campusName, campusCode } = this.normalizeCampus(campusRaw);
      // Business rule: exam modality from Excel is not used for section distribution.
      // All generated sections start as PRESENCIAL; admins can later switch specific sections.
      const modality: 'PRESENCIAL' = 'PRESENCIAL';
      const modalityChar: 'P' = 'P';
      const sourceModality = this.normalizeSourceModality(modalityRaw);

      const existing = studentByDni.get(dni);
      if (existing) {
        existing.neededCourses = this.uniqueCourses([
          ...existing.neededCourses,
          ...neededCourses,
        ]);
        if (!existing.codigoAlumno && codigoAlumno) existing.codigoAlumno = codigoAlumno;
        if (!existing.paternalLastName && apellidoPaterno) {
          existing.paternalLastName = apellidoPaterno;
        }
        if (!existing.maternalLastName && apellidoMaterno) {
          existing.maternalLastName = apellidoMaterno;
        }
        if (!existing.names && nombres) existing.names = nombres;
        if (!existing.email && email) existing.email = email;
        if (!existing.sex && sex) existing.sex = sex;
        if ((!existing.fullName || existing.fullName.startsWith('Alumno ')) && fullName) {
          existing.fullName = fullName;
        }
        continue;
      }

      studentByDni.set(dni, {
        dni,
        codigoAlumno,
        fullName,
        names: nombres || null,
        paternalLastName: apellidoPaterno || null,
        maternalLastName: apellidoMaterno || null,
        email,
        sex,
        careerName,
        facultyName,
        facultyGroup,
        campusName,
        campusCode,
        modality,
        modalityChar,
        sourceModality,
        neededCourses,
      });
    }

    return {
      rowsRead,
      students: Array.from(studentByDni.values()),
      unknownCareers: Array.from(unknownCareerSet).sort((a, b) =>
        a.localeCompare(b)
      ),
      courseNames: this.sortCourseNames(Array.from(activeCourseNames)),
    };
  }

  private buildCourseGroupUnits(params: {
    students: ParsedStudent[];
    courseNames: CourseName[];
    sectionCapacity: number;
    groupModalityOverrides: Map<string, 'PRESENCIAL' | 'VIRTUAL'>;
  }) {
    const countsByRow = new Map<
      string,
      {
        facultyGroup: 'FICA' | 'SALUD';
        campusName: string;
        courseCounts: Record<CourseName, number>;
      }
    >();

    for (const student of params.students) {
      const campusName = this.shortCampus(student.campusName);
      const rowKey = `${student.facultyGroup}::${campusName}`;
      if (!countsByRow.has(rowKey)) {
        countsByRow.set(rowKey, {
          facultyGroup: student.facultyGroup,
          campusName,
          courseCounts: this.initCourseCountMap(params.courseNames),
        });
      }
      const row = countsByRow.get(rowKey)!;
      for (const course of student.neededCourses) {
        row.courseCounts[course] += 1;
      }
    }

    const out: CourseGroupUnit[] = [];
    const divisor = Math.max(1, params.sectionCapacity);

    for (const row of countsByRow.values()) {
      for (const courseName of params.courseNames) {
        const chunks = this.splitCourseGroups(
          row.courseCounts[courseName],
          divisor,
          'PRESENCIAL'
        );
        for (let i = 0; i < chunks.length; i++) {
          const id = `${row.facultyGroup}|${row.campusName}|${courseName}|${i + 1}`;
          const modality =
            params.groupModalityOverrides.get(id) ?? ('PRESENCIAL' as const);
          out.push({
            id,
            facultyGroup: row.facultyGroup,
            campusName: row.campusName,
            courseName,
            size: chunks[i],
            modality,
          });
        }
      }
    }

    const validIds = new Set(out.map((x) => x.id));
    for (const id of params.groupModalityOverrides.keys()) {
      if (!validIds.has(id)) {
        throw new BadRequestException(
          `groupModalityOverrides references unknown group id: ${id}`
        );
      }
    }

    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  private buildProgramNeeds(
    students: ParsedStudent[],
    courseNames: CourseName[]
  ): ProgramNeedsPayload {
    const rowsByKey = new Map<
      string,
      {
        careerName: string;
        facultyGroup: 'FICA' | 'SALUD';
        campusName: string;
        sourceModality: 'VIRTUAL' | 'PRESENCIAL' | 'SIN DATO';
        needsByCourse: Record<CourseName, number>;
      }
    >();
    const campuses = new Set<string>();
    const modalities = new Set<string>();

    for (const student of students) {
      const key = `${this.norm(student.careerName)}|${this.norm(
        student.campusName
      )}|${student.sourceModality}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          careerName: student.careerName,
          facultyGroup: student.facultyGroup,
          campusName: student.campusName,
          sourceModality: student.sourceModality,
          needsByCourse: this.initCourseCountMap(courseNames),
        });
      }
      const row = rowsByKey.get(key)!;
      for (const course of student.neededCourses) {
        row.needsByCourse[course] += 1;
      }
      campuses.add(student.campusName);
      modalities.add(student.sourceModality);
    }

    const rows = Array.from(rowsByKey.values())
      .map((x) => ({
        ...x,
        totalNeeds: this.sumCourseCountMap(x.needsByCourse, courseNames),
      }))
      .sort((a, b) => {
        const ca = this.norm(a.careerName);
        const cb = this.norm(b.careerName);
        if (ca !== cb) return ca.localeCompare(cb);
        const sa = this.campusSort(a.campusName);
        const sb = this.campusSort(b.campusName);
        if (sa !== sb) return sa - sb;
        return this.modalitySort(a.sourceModality) - this.modalitySort(b.sourceModality);
      });

    const orderedCampuses = Array.from(campuses).sort(
      (a, b) => this.campusSort(a) - this.campusSort(b)
    );
    const orderedModalities = ['PRESENCIAL', 'VIRTUAL', 'SIN DATO'].filter((m) =>
      modalities.has(m)
    );

    return {
      campuses: orderedCampuses,
      modalities: orderedModalities,
      rows,
    };
  }

  private buildSectionsFromGroupUnits(params: {
    students: ParsedStudent[];
    groupUnits: CourseGroupUnit[];
    courseNames: CourseName[];
    sectionCapacity: number;
    initialCapacity: number;
    maxExtraCapacity: number;
  }) {
    type RowGroups = {
      facultyGroup: 'FICA' | 'SALUD';
      facultyName: string;
      campusShort: string;
      groupsByCourse: Record<CourseName, number>;
    };

    const virtualCoursesByFaculty = new Map<string, Set<CourseName>>();
    const virtualQuotaByRow = new Map<string, Record<CourseName, number>>();
    const presencialByRow = new Map<string, RowGroups>();
    const rowStudentCounts = new Map<string, number>();

    for (const student of params.students) {
      const rowKey = `${student.facultyGroup}|${this.shortCampus(student.campusName)}`;
      rowStudentCounts.set(rowKey, (rowStudentCounts.get(rowKey) ?? 0) + 1);
    }

    for (const unit of params.groupUnits) {
      const rowKey = `${unit.facultyGroup}|${unit.campusName}`;
      if (unit.modality === 'VIRTUAL') {
        if (!virtualCoursesByFaculty.has(unit.facultyGroup)) {
          virtualCoursesByFaculty.set(unit.facultyGroup, new Set<CourseName>());
        }
        virtualCoursesByFaculty.get(unit.facultyGroup)!.add(unit.courseName);
        if (!virtualQuotaByRow.has(rowKey)) {
          virtualQuotaByRow.set(
            rowKey,
            this.initCourseCountMap(params.courseNames)
          );
        }
        virtualQuotaByRow.get(rowKey)![unit.courseName] += unit.size;
        continue;
      }

      if (!presencialByRow.has(rowKey)) {
        presencialByRow.set(rowKey, {
          facultyGroup: unit.facultyGroup,
          facultyName: unit.facultyGroup === 'SALUD' ? SALUD_NAME : FICA_NAME,
          campusShort: unit.campusName,
          groupsByCourse: this.initCourseCountMap(params.courseNames),
        });
      }
      const row = presencialByRow.get(rowKey)!;
      row.groupsByCourse[unit.courseName] += 1;
    }

    const sections: PlannedSection[] = [];

    for (const row of presencialByRow.values()) {
      const maxCourseGroups = params.courseNames.reduce(
        (max, course) => Math.max(max, row.groupsByCourse[course] ?? 0),
        0
      );
      if (maxCourseGroups <= 0) continue;

      const rowKey = `${row.facultyGroup}|${row.campusShort}`;
      const requiredByStudents = Math.ceil(
        (rowStudentCounts.get(rowKey) ?? 0) / Math.max(1, params.sectionCapacity)
      );
      const sectionCount = Math.max(maxCourseGroups, requiredByStudents);

      const fallbackCourses = params.courseNames.filter(
        (course) => row.groupsByCourse[course] >= maxCourseGroups
      ) as CourseName[];

      const campusFull = this.fullCampusFromShort(row.campusShort);
      for (let i = 1; i <= sectionCount; i++) {
        let neededCourses = params.courseNames.filter(
          (course) => row.groupsByCourse[course] >= i
        ) as CourseName[];
        if (neededCourses.length === 0) {
          neededCourses = fallbackCourses.slice();
        }
        if (neededCourses.length === 0) continue;
        sections.push({
          code: '',
          name: '',
          facultyGroup: row.facultyGroup,
          facultyName: row.facultyName,
          campusName: campusFull.name,
          campusCode: campusFull.code,
          modality: 'PRESENCIAL',
          neededCourses,
          initialCapacity: params.initialCapacity,
          maxExtraCapacity: params.maxExtraCapacity,
          students: [],
          studentCoursesByDni: new Map<string, Set<CourseName>>(),
        });
      }
    }

    for (const [facultyGroup, courses] of virtualCoursesByFaculty.entries()) {
      const neededCourses = Array.from(courses).sort() as CourseName[];
      if (neededCourses.length === 0) continue;
      sections.push({
        code: '',
        name: '',
        facultyGroup: facultyGroup as 'FICA' | 'SALUD',
        facultyName: facultyGroup === 'SALUD' ? SALUD_NAME : FICA_NAME,
        campusName: 'SEDE CHINCHA',
        campusCode: 'CH',
        modality: 'VIRTUAL',
        neededCourses,
        initialCapacity: params.initialCapacity,
        maxExtraCapacity: params.maxExtraCapacity,
        students: [],
        studentCoursesByDni: new Map<string, Set<CourseName>>(),
      });
    }

    const presencialSectionsByRow = new Map<string, PlannedSection[]>();
    const virtualSectionByFaculty = new Map<string, PlannedSection>();
    for (const section of sections) {
      if (section.modality === 'VIRTUAL') {
        virtualSectionByFaculty.set(section.facultyGroup, section);
      } else {
        const rowKey = `${section.facultyGroup}|${this.shortCampus(section.campusName)}`;
        if (!presencialSectionsByRow.has(rowKey)) presencialSectionsByRow.set(rowKey, []);
        presencialSectionsByRow.get(rowKey)!.push(section);
      }
    }

    const virtualAssignedCoursesByDni = new Map<string, Set<CourseName>>();
    const studentsByRow = new Map<string, ParsedStudent[]>();
    for (const student of params.students) {
      const rowKey = `${student.facultyGroup}|${this.shortCampus(student.campusName)}`;
      if (!studentsByRow.has(rowKey)) studentsByRow.set(rowKey, []);
      studentsByRow.get(rowKey)!.push(student);
    }

    for (const [rowKey, rowStudents] of studentsByRow.entries()) {
      const remaining = virtualQuotaByRow.get(rowKey);
      if (!remaining || rowStudents.length === 0) continue;

      const facultyGroup = rowStudents[0].facultyGroup;
      const virtualSection = virtualSectionByFaculty.get(facultyGroup);
      if (!virtualSection) continue;

      const virtualNeedCount = (student: ParsedStudent) =>
        student.neededCourses.reduce(
          (acc, course) => acc + ((remaining[course] ?? 0) > 0 ? 1 : 0),
          0
        );

      const sorted = rowStudents.slice().sort((a, b) => {
        const vb = virtualNeedCount(b);
        const va = virtualNeedCount(a);
        if (vb !== va) return vb - va;
        return b.neededCourses.length - a.neededCourses.length;
      });

      for (const student of sorted) {
        const matchedCourses = student.neededCourses.filter(
          (course) => (remaining[course] ?? 0) > 0
        );
        if (matchedCourses.length === 0) continue;

        if (!virtualSection.students.some((s) => s.dni === student.dni)) {
          virtualSection.students.push(student);
        }
        if (!virtualAssignedCoursesByDni.has(student.dni)) {
          virtualAssignedCoursesByDni.set(student.dni, new Set<CourseName>());
        }
        const assignedCourses = virtualAssignedCoursesByDni.get(student.dni)!;
        if (!virtualSection.studentCoursesByDni.has(student.dni)) {
          virtualSection.studentCoursesByDni.set(student.dni, new Set<CourseName>());
        }
        const sectionCourses = virtualSection.studentCoursesByDni.get(student.dni)!;
        for (const course of matchedCourses) {
          assignedCourses.add(course);
          sectionCourses.add(course);
          remaining[course] = Math.max(0, (remaining[course] ?? 0) - 1);
        }
      }
    }

    for (const [rowKey, rowStudents] of studentsByRow.entries()) {
      const options = presencialSectionsByRow.get(rowKey) ?? [];
      const pendingStudents = rowStudents
        .map((student) => {
          const assignedVirtual = virtualAssignedCoursesByDni.get(student.dni);
          const neededCourses = student.neededCourses.filter(
            (course) => !assignedVirtual?.has(course)
          );
          return { student, neededCourses };
        })
        .filter((x) => x.neededCourses.length > 0);

      if (pendingStudents.length === 0) continue;

      if (options.length === 0) {
        const facultyGroup = rowStudents[0]?.facultyGroup;
        const fallback = facultyGroup
          ? virtualSectionByFaculty.get(facultyGroup)
          : null;
        if (!fallback) {
          throw new BadRequestException(
            `No section available for ${rowStudents[0]?.facultyGroup ?? 'UNKNOWN'}-${rowKey}`
          );
        }
        for (const item of pendingStudents) {
          if (!fallback.students.some((s) => s.dni === item.student.dni)) {
            fallback.students.push(item.student);
          }
          if (!fallback.studentCoursesByDni.has(item.student.dni)) {
            fallback.studentCoursesByDni.set(item.student.dni, new Set<CourseName>());
          }
          const sectionCourses = fallback.studentCoursesByDni.get(item.student.dni)!;
          for (const course of item.neededCourses) {
            sectionCourses.add(course);
          }
        }
        continue;
      }

      const assigned = this.assignRowStudentCourses({
        rowStudents: pendingStudents,
        sections: options,
        courseNames: params.courseNames,
        sectionCapacity: params.sectionCapacity,
      });
      if (!assigned.ok) {
        const blockedCourse = assigned.blocked.course;
        const demandForBlocked = pendingStudents.filter((x) =>
          x.neededCourses.includes(blockedCourse)
        ).length;
        const capacityForBlocked = options.reduce((acc, section) => {
          if (!section.neededCourses.includes(blockedCourse)) return acc;
          return acc + params.sectionCapacity;
        }, 0);
        const totalSeatCapacity = options.length * params.sectionCapacity;
        throw new BadRequestException(
          `Could not assign ${assigned.blocked.student.dni} (${blockedCourse}) in ${rowStudents[0].facultyGroup}-${this.shortCampus(rowStudents[0].campusName)} without creating extra sections. demand(${blockedCourse})=${demandForBlocked}, capacity(${blockedCourse})=${capacityForBlocked}, students=${pendingStudents.length}, totalSeats=${totalSeatCapacity}`
        );
      }
    }

    const filtered = sections.filter((section) => section.students.length > 0);
    this.resequenceSectionCodes(filtered);
    return filtered;
  }

  private assignRowStudentCourses(params: {
    rowStudents: Array<{ student: ParsedStudent; neededCourses: CourseName[] }>;
    sections: PlannedSection[];
    courseNames: CourseName[];
    sectionCapacity: number;
  }): { ok: true } | { ok: false; blocked: { student: ParsedStudent; course: CourseName } } {
    const courses = params.courseNames.slice();

    type RowItem = {
      student: ParsedStudent;
      neededCourses: CourseName[];
      careerKey: string;
    };
    const byDni = new Map<string, RowItem>();
    for (const item of params.rowStudents) {
      const key = item.student.dni;
      const careerKey = this.norm(item.student.careerName || 'SIN CARRERA');
      const existing = byDni.get(key);
      if (!existing) {
        byDni.set(key, {
          student: item.student,
          neededCourses: this.uniqueCourses(item.neededCourses),
          careerKey,
        });
        continue;
      }
      existing.neededCourses = this.uniqueCourses([
        ...existing.neededCourses,
        ...item.neededCourses,
      ]);
    }
    const items = Array.from(byDni.values());
    if (items.length === 0) return { ok: true };

    const sectionCourseSets = params.sections.map(
      (s) => new Set<CourseName>(s.neededCourses)
    );
    const courseToSectionIdx = new Map<CourseName, number[]>();
    for (const course of courses) courseToSectionIdx.set(course, []);
    for (let i = 0; i < params.sections.length; i++) {
      for (const course of params.sections[i].neededCourses) {
        courseToSectionIdx.get(course)!.push(i);
      }
    }

    for (const course of courses) {
      const hasAnySection = (courseToSectionIdx.get(course)?.length ?? 0) > 0;
      if (hasAnySection) continue;
      const blocked = items.find((x) => x.neededCourses.includes(course));
      if (blocked) return { ok: false, blocked: { student: blocked.student, course } };
    }

    const sectionStudents = params.sections.map((s) => s.students.slice());
    const sectionDnis = sectionStudents.map((arr) => new Set(arr.map((s) => s.dni)));
    const sectionStudentCourses = params.sections.map((s) => {
      const m = new Map<string, Set<CourseName>>();
      for (const [dni, set] of s.studentCoursesByDni.entries()) {
        m.set(dni, new Set(set));
      }
      return m;
    });
    const itemByDni = new Map(items.map((x) => [x.student.dni, x] as const));
    const sectionCourseCount = params.sections.map(() =>
      this.initCourseCountMap(courses)
    );
    const coveredByDni = new Map<string, Set<CourseName>>();

    const getCovered = (dni: string) => {
      let set = coveredByDni.get(dni);
      if (!set) {
        set = new Set<CourseName>();
        coveredByDni.set(dni, set);
      }
      return set;
    };

    for (let sidx = 0; sidx < params.sections.length; sidx++) {
      if (sectionStudentCourses[sidx].size === 0) {
        for (const student of sectionStudents[sidx]) {
          const item = itemByDni.get(student.dni);
          if (!item) continue;
          const mapped = item.neededCourses.filter((c) => sectionCourseSets[sidx].has(c));
          if (mapped.length === 0) continue;
          sectionStudentCourses[sidx].set(student.dni, new Set(mapped));
        }
      }

      for (const [dni, assignedCourses] of sectionStudentCourses[sidx].entries()) {
        const item = itemByDni.get(dni);
        if (!item) continue;
        const covered = getCovered(dni);
        for (const course of assignedCourses) {
          if (!item.neededCourses.includes(course)) continue;
          if (!sectionCourseSets[sidx].has(course)) continue;
          covered.add(course);
          sectionCourseCount[sidx][course] += 1;
        }
      }
    }

    const canAssignCourse = (sectionIdx: number, item: RowItem, course: CourseName) => {
      if (!sectionCourseSets[sectionIdx].has(course)) return false;
      if (getCovered(item.student.dni).has(course)) return true;
      return sectionCourseCount[sectionIdx][course] < params.sectionCapacity;
    };

    const assignCourseToSection = (sectionIdx: number, item: RowItem, course: CourseName) => {
      if (!canAssignCourse(sectionIdx, item, course)) return false;

      const dni = item.student.dni;
      if (!sectionDnis[sectionIdx].has(dni)) {
        sectionStudents[sectionIdx].push(item.student);
        sectionDnis[sectionIdx].add(dni);
      }

      if (!sectionStudentCourses[sectionIdx].has(dni)) {
        sectionStudentCourses[sectionIdx].set(dni, new Set<CourseName>());
      }
      const sectionCourses = sectionStudentCourses[sectionIdx].get(dni)!;
      if (sectionCourses.has(course)) {
        getCovered(dni).add(course);
        return true;
      }

      if (sectionCourseCount[sectionIdx][course] >= params.sectionCapacity) {
        return false;
      }

      sectionCourses.add(course);
      sectionCourseCount[sectionIdx][course] += 1;
      getCovered(dni).add(course);
      return true;
    };

    const orderedCourses = courses.slice().sort((a, b) => {
      const sa = courseToSectionIdx.get(a)?.length ?? 0;
      const sb = courseToSectionIdx.get(b)?.length ?? 0;
      if (sa !== sb) return sa - sb;
      const da = items.filter((x) => x.neededCourses.includes(a)).length;
      const db = items.filter((x) => x.neededCourses.includes(b)).length;
      return db - da;
    });

    for (const course of orderedCourses) {
      const candidates = (courseToSectionIdx.get(course) ?? []).slice();
      if (candidates.length === 0) {
        const blocked = items.find((x) => x.neededCourses.includes(course));
        if (blocked) return { ok: false, blocked: { student: blocked.student, course } };
        continue;
      }

      const groupsByCareer = new Map<string, RowItem[]>();
      for (const item of items) {
        if (!item.neededCourses.includes(course)) continue;
        if (getCovered(item.student.dni).has(course)) continue;
        if (!groupsByCareer.has(item.careerKey)) groupsByCareer.set(item.careerKey, []);
        groupsByCareer.get(item.careerKey)!.push(item);
      }

      const orderedGroups = Array.from(groupsByCareer.entries()).sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length;
        return a[0].localeCompare(b[0]);
      });

      const orderedItemsForCourse: RowItem[] = [];
      for (const [, group] of orderedGroups) {
        group.sort((a, b) => a.student.dni.localeCompare(b.student.dni));
        orderedItemsForCourse.push(...group);
      }

      let sectionCursor = 0;
      const advanceCursor = () => {
        while (
          sectionCursor < candidates.length &&
          sectionCourseCount[candidates[sectionCursor]][course] >= params.sectionCapacity
        ) {
          sectionCursor++;
        }
      };

      for (const item of orderedItemsForCourse) {
        if (getCovered(item.student.dni).has(course)) continue;
        advanceCursor();
        if (sectionCursor >= candidates.length) {
          return { ok: false, blocked: { student: item.student, course } };
        }

        const chosen = candidates[sectionCursor];
        if (!assignCourseToSection(chosen, item, course)) {
          return { ok: false, blocked: { student: item.student, course } };
        }
      }
    }

    for (const item of items) {
      for (const course of item.neededCourses) {
        if (!getCovered(item.student.dni).has(course)) {
          return { ok: false, blocked: { student: item.student, course } };
        }
      }
    }

    for (let i = 0; i < params.sections.length; i++) {
      params.sections[i].students = sectionStudents[i];
      params.sections[i].studentCoursesByDni = sectionStudentCourses[i];
    }
    return { ok: true };
  }

  private buildCourseGroupSummary(params: {
    groupUnits: CourseGroupUnit[];
    courseNames: CourseName[];
  }): CourseGroupSummaryPayload {
    type RowAccumulator = {
      facultyGroup: string;
      campusName: string;
      modality: 'PRESENCIAL' | 'VIRTUAL';
      sizesByCourse: Record<CourseName, number[]>;
    };

    const presencialRows = new Map<string, RowAccumulator>();
    const virtualSumByFaculty = new Map<string, Record<CourseName, number>>();

    for (const unit of params.groupUnits) {
      if (unit.modality === 'VIRTUAL') {
        if (!virtualSumByFaculty.has(unit.facultyGroup)) {
          virtualSumByFaculty.set(
            unit.facultyGroup,
            this.initCourseCountMap(params.courseNames)
          );
        }
        virtualSumByFaculty.get(unit.facultyGroup)![unit.courseName] += unit.size;
        continue;
      }

      const key = `${unit.facultyGroup}::${unit.campusName}`;
      if (!presencialRows.has(key)) {
        presencialRows.set(key, {
          facultyGroup: unit.facultyGroup,
          campusName: unit.campusName,
          modality: 'PRESENCIAL',
          sizesByCourse: this.initCourseGroupSizesMap(params.courseNames),
        });
      }
      presencialRows.get(key)!.sizesByCourse[unit.courseName].push(unit.size);
    }

    const groupedByFaculty = new Map<string, FacultyCourseGroupSummary>();
    const ensureFaculty = (facultyGroup: string) => {
      if (!groupedByFaculty.has(facultyGroup)) {
        groupedByFaculty.set(facultyGroup, {
          facultyGroup,
          rows: [],
          totalGroups: 0,
          totalHours: 0,
          totalPay4Weeks: 0,
        });
      }
      return groupedByFaculty.get(facultyGroup)!;
    };

    for (const row of presencialRows.values()) {
      const faculty = ensureFaculty(row.facultyGroup);
      const courseGroupSizes = this.initCourseGroupSizesMap(params.courseNames);
      const courseGroups = this.initCourseCountMap(params.courseNames);
      for (const courseName of params.courseNames) {
        courseGroupSizes[courseName] = (row.sizesByCourse[courseName] ?? []).slice();
        courseGroups[courseName] = courseGroupSizes[courseName].length;
      }
      const totalGroups = this.sumCourseCountMap(courseGroups, params.courseNames);

      faculty.rows.push({
        label: `${row.campusName} - PRESENCIAL`,
        campusName: row.campusName,
        modality: 'PRESENCIAL',
        courseGroups,
        courseGroupSizes,
        totalGroups,
      });
      faculty.totalGroups += totalGroups;
    }

    for (const [facultyGroup, sums] of virtualSumByFaculty.entries()) {
      const hasAny = Object.values(sums).some((x) => x > 0);
      if (!hasAny) continue;
      const faculty = ensureFaculty(facultyGroup);
      const courseGroupSizes = this.initCourseGroupSizesMap(params.courseNames);
      const courseGroups = this.initCourseCountMap(params.courseNames);
      for (const courseName of params.courseNames) {
        const size = Number(sums[courseName] ?? 0);
        courseGroupSizes[courseName] = size > 0 ? [size] : [];
        courseGroups[courseName] = courseGroupSizes[courseName].length;
      }
      const totalGroups = this.sumCourseCountMap(courseGroups, params.courseNames);

      faculty.rows.push({
        label: 'VIRTUAL',
        campusName: 'VIRTUAL',
        modality: 'VIRTUAL',
        courseGroups,
        courseGroupSizes,
        totalGroups,
      });
      faculty.totalGroups += totalGroups;
    }

    const byFaculty = Array.from(groupedByFaculty.values())
      .map((faculty) => {
        faculty.rows.sort((a, b) => {
          const ma = this.modalitySort(a.modality);
          const mb = this.modalitySort(b.modality);
          if (ma !== mb) return ma - mb;
          const ca = this.campusSort(a.campusName);
          const cb = this.campusSort(b.campusName);
          if (ca !== cb) return ca - cb;
          return a.label.localeCompare(b.label);
        });
        faculty.totalHours = faculty.totalGroups * HOURS_PER_GROUP;
        faculty.totalPay4Weeks = faculty.totalHours * PRICE_PER_HOUR;
        return faculty;
      })
      .sort((a, b) => {
        if (a.facultyGroup === b.facultyGroup) return 0;
        if (a.facultyGroup === 'FICA') return -1;
        if (b.facultyGroup === 'FICA') return 1;
        return a.facultyGroup.localeCompare(b.facultyGroup);
      });

    const totalPay4Weeks = byFaculty.reduce(
      (acc, item) => acc + item.totalPay4Weeks,
      0
    );

    return {
      hoursPerGroup: HOURS_PER_GROUP,
      pricePerHour: PRICE_PER_HOUR,
      totalPay4Weeks,
      byFaculty,
    };
  }

  private buildGroupPlan(
    groupUnits: CourseGroupUnit[],
    courseNames: CourseName[]
  ): GroupPlanPayload {
    const byFaculty = new Map<
      string,
      Map<
        string,
        {
          campusName: string;
          courses: Record<
            CourseName,
            Array<{ id: string; size: number; modality: 'PRESENCIAL' | 'VIRTUAL' }>
          >;
        }
      >
    >();

    const emptyCourses = (): Record<
      CourseName,
      Array<{ id: string; size: number; modality: 'PRESENCIAL' | 'VIRTUAL' }>
    > => this.initGroupItemsMap(courseNames);

    for (const unit of groupUnits) {
      if (!byFaculty.has(unit.facultyGroup)) {
        byFaculty.set(unit.facultyGroup, new Map());
      }
      const byCampus = byFaculty.get(unit.facultyGroup)!;
      if (!byCampus.has(unit.campusName)) {
        byCampus.set(unit.campusName, {
          campusName: unit.campusName,
          courses: emptyCourses(),
        });
      }
      byCampus.get(unit.campusName)!.courses[unit.courseName].push({
        id: unit.id,
        size: unit.size,
        modality: unit.modality,
      });
    }

    return {
      byFaculty: Array.from(byFaculty.entries())
        .map(([facultyGroup, campuses]) => ({
          facultyGroup,
          rows: Array.from(campuses.values())
            .sort((a, b) => this.campusSort(a.campusName) - this.campusSort(b.campusName))
            .map((row) => {
              for (const course of courseNames) {
                row.courses[course].sort((a, b) => a.id.localeCompare(b.id));
              }
              return row;
            }),
        }))
        .sort((a, b) => {
          if (a.facultyGroup === b.facultyGroup) return 0;
          if (a.facultyGroup === 'FICA') return -1;
          if (b.facultyGroup === 'FICA') return 1;
          return a.facultyGroup.localeCompare(b.facultyGroup);
        }),
    };
  }

  private parseGroupModalityOverrides(raw?: string) {
    if (!raw || !raw.trim()) return new Map<string, 'PRESENCIAL' | 'VIRTUAL'>();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException(
        'groupModalityOverrides must be a valid JSON object'
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException(
        'groupModalityOverrides must be a JSON object'
      );
    }

    const out = new Map<string, 'PRESENCIAL' | 'VIRTUAL'>();
    for (const [idRaw, modalityRaw] of Object.entries(parsed)) {
      const id = String(idRaw || '').trim();
      if (!id) continue;
      const modalityNorm = this.norm(String(modalityRaw ?? ''));
      if (modalityNorm !== 'PRESENCIAL' && modalityNorm !== 'VIRTUAL') {
        throw new BadRequestException(
          `Invalid modality override for group ${id}: ${String(modalityRaw)}`
        );
      }
      out.set(id, modalityNorm as 'PRESENCIAL' | 'VIRTUAL');
    }
    return out;
  }

  private resequenceSectionCodes(sections: PlannedSection[]) {
    sections.sort((a, b) => {
      const fa = a.facultyGroup.localeCompare(b.facultyGroup);
      if (fa !== 0) return fa;
      const ma = this.modalitySort(a.modality) - this.modalitySort(b.modality);
      if (ma !== 0) return ma;
      const ca = this.campusSort(a.campusName) - this.campusSort(b.campusName);
      if (ca !== 0) return ca;
      return a.code.localeCompare(b.code);
    });

    const idxByPrefix = new Map<string, number>();
    for (const s of sections) {
      if (s.modality === 'VIRTUAL') {
        s.campusName = 'SEDE CHINCHA';
        s.campusCode = 'CH';
      }
      const modalityChar = s.modality === 'VIRTUAL' ? 'V' : 'P';
      const prefix = `${s.facultyGroup}|${s.modality}|${s.campusCode}`;
      const next = (idxByPrefix.get(prefix) ?? 0) + 1;
      idxByPrefix.set(prefix, next);
      const code = `${this.alphaCode(next)}${modalityChar}${this.facultyChar(
        s.facultyGroup
      )}-${s.campusCode}`;
      s.code = code;
      s.name = code;
    }
  }


  private async applyPlan(params: {
    sections: PlannedSection[];
    students?: ParsedStudent[];
    configUsed?: { initialCapacity: number; maxExtraCapacity: number };
    sourceFileHash?: string;
    createdById?: string | null;
  }): Promise<ApplyStructureResult> {
    return this.dataSource.transaction(async (manager) => {
      const usersRepo = manager.getRepository(UserEntity);
      const sectionsRepo = manager.getRepository(SectionEntity);
      const courseIdByName = await this.loadCourseIdByCanonicalName(manager);
      const activePeriodId = await this.loadActivePeriodIdOrThrow(manager);
      const runId = randomUUID();
      const createdById = String(params.createdById ?? '').trim() || null;
      const configUsed = params.configUsed ?? {
        initialCapacity: 45,
        maxExtraCapacity: 0,
      };
      const sourceFileHash = String(params.sourceFileHash ?? '').trim() || null;
      const sourceStudents =
        params.students && params.students.length > 0
          ? params.students
          : params.sections.flatMap((section) => section.students);

      if (createdById) {
        const rows: Array<{ id: string }> = await manager.query(
          `
          SELECT id
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [createdById]
        );
        if (!rows[0]?.id) {
          throw new BadRequestException('createdBy user does not exist');
        }
      }

      await manager.query(
        `
        UPDATE leveling_runs
        SET
          status = 'ARCHIVED',
          updatedAt = NOW(6)
        WHERE periodId = ?
          AND status <> 'ARCHIVED'
        `,
        [activePeriodId]
      );

      await manager.query(
        `
        INSERT INTO leveling_runs (
          id,
          periodId,
          status,
          configJson,
          sourceFileHash,
          createdBy,
          createdAt,
          updatedAt
        )
        VALUES (?, ?, 'STRUCTURED', ?, ?, ?, NOW(6), NOW(6))
        `,
        [
          runId,
          activePeriodId,
          JSON.stringify(configUsed),
          sourceFileHash,
          createdById,
        ]
      );

      const uniqueByDni = new Map<string, ParsedStudent>();
      for (const student of sourceStudents) {
        uniqueByDni.set(student.dni, student);
      }

      const dnis = Array.from(uniqueByDni.keys());
      const existingUsers = dnis.length
        ? await usersRepo.find({ where: { dni: In(dnis) } })
        : [];
      const existingUserByDni = new Map(existingUsers.map((u) => [u.dni, u]));

      let studentsCreated = 0;
      let studentsUpdated = 0;
      const studentByDni = new Map<string, UserEntity>();

      for (const s of uniqueByDni.values()) {
        const existing = existingUserByDni.get(s.dni);
        if (!existing) {
          const created = usersRepo.create({
            dni: s.dni,
            codigoAlumno: s.codigoAlumno,
            fullName: s.fullName || `Alumno ${s.dni}`,
            names: s.names,
            paternalLastName: s.paternalLastName,
            maternalLastName: s.maternalLastName,
            email: s.email,
            sex: s.sex,
            role: Role.ALUMNO,
            passwordHash: null,
          });
          const saved = await usersRepo.save(created);
          studentByDni.set(s.dni, saved);
          studentsCreated++;
          continue;
        }

        if (existing.role !== Role.ALUMNO) {
          throw new BadRequestException(
            `DNI ${s.dni} belongs to a non-student user`
          );
        }

        let dirty = false;
        if (s.codigoAlumno && existing.codigoAlumno !== s.codigoAlumno) {
          existing.codigoAlumno = s.codigoAlumno;
          dirty = true;
        }
        if (s.fullName && existing.fullName !== s.fullName) {
          existing.fullName = s.fullName;
          dirty = true;
        }
        if (s.names && existing.names !== s.names) {
          existing.names = s.names;
          dirty = true;
        }
        if (s.paternalLastName && existing.paternalLastName !== s.paternalLastName) {
          existing.paternalLastName = s.paternalLastName;
          dirty = true;
        }
        if (s.maternalLastName && existing.maternalLastName !== s.maternalLastName) {
          existing.maternalLastName = s.maternalLastName;
          dirty = true;
        }
        if (s.email && existing.email !== s.email) {
          existing.email = s.email;
          dirty = true;
        }
        if (s.sex && existing.sex !== s.sex) {
          existing.sex = s.sex;
          dirty = true;
        }

        const saved = dirty ? await usersRepo.save(existing) : existing;
        if (dirty) studentsUpdated++;
        studentByDni.set(s.dni, saved);
      }

      const codes = Array.from(new Set(params.sections.map((s) => s.code)));
      const existingSections = codes.length
        ? await sectionsRepo.find({ where: { code: In(codes) } })
        : [];
      const existingSectionByCode = new Map(
        existingSections.map((s) => [s.code, s] as const)
      );

      const sectionByCode = new Map<string, SectionEntity>();
      let sectionsCreated = 0;
      let sectionsUpdated = 0;

      for (const s of params.sections) {
        const existing = existingSectionByCode.get(s.code);
        if (!existing) {
          const created = sectionsRepo.create({
            name: s.name,
            code: s.code,
            akademicSectionId: null,
            facultyGroup: s.facultyGroup,
            facultyName: s.facultyName,
            campusName: s.campusName,
            modality: s.modality,
            initialCapacity: s.initialCapacity,
            maxExtraCapacity: s.maxExtraCapacity,
            isAutoLeveling: true,
            levelingRunId: runId,
          });
          const saved = await sectionsRepo.save(created);
          sectionByCode.set(s.code, saved);
          sectionsCreated++;
          continue;
        }

        existing.name = s.name;
        existing.facultyGroup = s.facultyGroup;
        existing.facultyName = s.facultyName;
        existing.campusName = s.campusName;
        existing.modality = s.modality;
        existing.initialCapacity = s.initialCapacity;
        existing.maxExtraCapacity = s.maxExtraCapacity;
        existing.isAutoLeveling = true;
        existing.levelingRunId = runId;
        const saved = await sectionsRepo.save(existing);
        sectionByCode.set(s.code, saved);
        sectionsUpdated++;
      }

      const sectionCourseCandidates = new Map<
        string,
        {
          id: string;
          periodId: string;
          sectionId: string;
          courseId: string;
          idakademic: null;
        }
      >();

      for (const sec of params.sections) {
        const section = sectionByCode.get(sec.code);
        if (!section) continue;
        const uniqueCourses = new Set<CourseName>(sec.neededCourses);
        for (const courseName of uniqueCourses) {
          const courseId = courseIdByName.get(this.courseKey(courseName));
          if (!courseId) {
            throw new BadRequestException(`Course not found in catalog: ${courseName}`);
          }
          const key = `${activePeriodId}:${section.id}:${courseId}`;
          if (!sectionCourseCandidates.has(key)) {
            sectionCourseCandidates.set(key, {
              id: randomUUID(),
              periodId: activePeriodId,
              sectionId: section.id,
              courseId,
              idakademic: null,
            });
          }
        }
      }

      const sectionIds = Array.from(sectionByCode.values()).map((s) => s.id);
      const existingSectionCourseKeys = await this.loadExistingSectionCourseKeys(
        manager,
        sectionIds,
        activePeriodId
      );
      const sectionCourseRowsToInsert = Array.from(sectionCourseCandidates.entries())
        .filter(([key]) => !existingSectionCourseKeys.has(key))
        .map(([, row]) => row);
      await this.bulkInsertSectionCoursesIgnore(manager, sectionCourseRowsToInsert);

      const sectionCourseRows = await this.loadSectionCoursesBySectionsAndPeriod(
        manager,
        sectionIds,
        activePeriodId
      );
      const sectionCourseIdByKey = new Map<string, string>();
      for (const row of sectionCourseRows) {
        sectionCourseIdByKey.set(`${row.sectionId}:${row.courseId}`, row.id);
      }

      const runSectionCourseCapacityById = new Map<
        string,
        { id: string; runId: string; sectionCourseId: string; plannedCapacity: number }
      >();
      for (const sec of params.sections) {
        const section = sectionByCode.get(sec.code);
        if (!section) continue;
        const uniqueCourses = new Set<CourseName>(sec.neededCourses);
        for (const courseName of uniqueCourses) {
          const courseId = courseIdByName.get(this.courseKey(courseName));
          if (!courseId) continue;
          const sectionCourseId = sectionCourseIdByKey.get(`${section.id}:${courseId}`);
          if (!sectionCourseId) continue;
          let plannedCapacity = 0;
          for (const assignedCourses of sec.studentCoursesByDni.values()) {
            if (assignedCourses.has(courseName)) {
              plannedCapacity += 1;
            }
          }
          runSectionCourseCapacityById.set(sectionCourseId, {
            id: randomUUID(),
            runId,
            sectionCourseId,
            plannedCapacity,
          });
        }
      }
      const hasPlannedCapacityTable = await this.tableExists(
        manager,
        'leveling_run_section_course_capacities'
      );
      if (hasPlannedCapacityTable) {
        await this.bulkUpsertLevelingRunSectionCourseCapacities(
          manager,
          Array.from(runSectionCourseCapacityById.values())
        );
      }

      const sectionCourseIds = Array.from(sectionCourseIdByKey.values());
      await this.deleteSectionStudentCoursesBySectionCourseIds(manager, sectionCourseIds);

      const demandCandidates = new Map<
        string,
        {
          id: string;
          runId: string;
          studentId: string;
          courseId: string;
          facultyGroup: string | null;
          campusName: string | null;
          required: number;
        }
      >();
      for (const student of sourceStudents) {
        const savedStudent = studentByDni.get(student.dni);
        if (!savedStudent) continue;
        for (const courseName of student.neededCourses) {
          const courseId = courseIdByName.get(this.courseKey(courseName));
          if (!courseId) continue;
          const key = `${runId}:${savedStudent.id}:${courseId}`;
          if (demandCandidates.has(key)) continue;
          demandCandidates.set(key, {
            id: randomUUID(),
            runId,
            studentId: savedStudent.id,
            courseId,
            facultyGroup: student.facultyGroup,
            campusName: student.campusName,
            required: 1,
          });
        }
      }

      const existingDemandKeys = await this.loadExistingRunDemandKeys(manager, runId);
      const demandRowsToInsert = Array.from(demandCandidates.entries())
        .filter(([key]) => !existingDemandKeys.has(key))
        .map(([, row]) => row);
      await this.bulkInsertLevelingRunDemandsIgnore(manager, demandRowsToInsert);

      return {
        runId,
        runStatus: 'STRUCTURED',
        sectionsCreated,
        sectionsUpdated,
        studentsCreated,
        studentsUpdated,
        sectionCoursesCreated: sectionCourseRowsToInsert.length,
        sectionCoursesOmitted:
          sectionCourseCandidates.size - sectionCourseRowsToInsert.length,
        demandsCreated: demandRowsToInsert.length,
        demandsOmitted: demandCandidates.size - demandRowsToInsert.length,
      };
    });
  }

  private async loadCourseIdByCanonicalName(manager: EntityManager) {
    const rows: Array<{ id: string; name: string }> = await manager.query(`
      SELECT id, name
      FROM courses
    `);
    const out = new Map<CourseName, string>();
    for (const row of rows) {
      const key = this.courseKey(row.name);
      if (!key) continue;
      if (!out.has(key)) out.set(key, String(row.id));
    }
    return out;
  }

  private async loadExistingSectionCourseKeys(
    manager: EntityManager,
    sectionIds: string[],
    periodId: string
  ) {
    if (sectionIds.length === 0) return new Set<string>();
    const placeholders = sectionIds.map(() => '?').join(', ');
    const rows: Array<{ periodId: string; sectionId: string; courseId: string }> =
      await manager.query(
        `
      SELECT periodId, sectionId, courseId
      FROM section_courses
      WHERE sectionId IN (${placeholders})
        AND periodId = ?
      `,
        [...sectionIds, periodId]
      );
    return new Set(
      rows.map((x) => `${x.periodId}:${x.sectionId}:${String(x.courseId)}`)
    );
  }

  private async loadSectionCoursesBySectionsAndPeriod(
    manager: EntityManager,
    sectionIds: string[],
    periodId: string
  ) {
    if (sectionIds.length === 0) {
      return [] as Array<{ id: string; sectionId: string; courseId: string }>;
    }
    const placeholders = sectionIds.map(() => '?').join(', ');
    const rows: Array<{ id: string; sectionId: string; courseId: string }> =
      await manager.query(
        `
        SELECT id, sectionId, courseId
        FROM section_courses
        WHERE sectionId IN (${placeholders})
          AND periodId = ?
        `,
        [...sectionIds, periodId]
      );
    return rows.map((row) => ({
      id: String(row.id),
      sectionId: String(row.sectionId),
      courseId: String(row.courseId),
    }));
  }

  private async bulkInsertSectionCoursesIgnore(
    manager: EntityManager,
    rows: Array<{
      id: string;
      periodId: string;
      sectionId: string;
      courseId: string;
      idakademic: string | null;
    }>
  ) {
    if (rows.length === 0) return;
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map(() => '(?, ?, ?, ?, ?, NOW(6), NOW(6))')
        .join(', ');
      const params: Array<string | null> = [];
      for (const row of batch) {
        params.push(
          row.id,
          row.periodId,
          row.sectionId,
          row.courseId,
          row.idakademic
        );
      }
      await manager.query(
        `
        INSERT IGNORE INTO section_courses (id, periodId, sectionId, courseId, idakademic, createdAt, updatedAt)
        VALUES ${placeholders}
        `,
        params
      );
    }
  }

  private async bulkInsertSectionStudentCoursesIgnore(
    manager: EntityManager,
    rows: Array<{
      id: string;
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      studentId: string;
    }>
  ) {
    if (rows.length === 0) return;
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map(() => '(?, ?, ?, ?, ?, NOW(6), NOW(6))')
        .join(', ');
      const params: Array<string> = [];
      for (const row of batch) {
        params.push(
          row.id,
          row.sectionCourseId,
          row.sectionId,
          row.courseId,
          row.studentId
        );
      }
      await manager.query(
        `
        INSERT IGNORE INTO section_student_courses (id, sectionCourseId, sectionId, courseId, studentId, createdAt, updatedAt)
        VALUES ${placeholders}
        `,
        params
      );
    }
  }

  private async deleteSectionStudentCoursesBySectionCourseIds(
    manager: EntityManager,
    sectionCourseIds: string[]
  ) {
    const ids = Array.from(
      new Set(sectionCourseIds.map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await manager.query(
      `
      DELETE FROM section_student_courses
      WHERE sectionCourseId IN (${placeholders})
      `,
      ids
    );
  }

  private async loadExistingRunDemandKeys(manager: EntityManager, runId: string) {
    const rows: Array<{ runId: string; studentId: string; courseId: string }> =
      await manager.query(
        `
        SELECT runId, studentId, courseId
        FROM leveling_run_student_course_demands
        WHERE runId = ?
        `,
        [runId]
      );
    return new Set(rows.map((x) => `${x.runId}:${x.studentId}:${x.courseId}`));
  }

  private async bulkInsertLevelingRunDemandsIgnore(
    manager: EntityManager,
    rows: Array<{
      id: string;
      runId: string;
      studentId: string;
      courseId: string;
      facultyGroup: string | null;
      campusName: string | null;
      required: number;
    }>
  ) {
    if (rows.length === 0) return;
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map(() => '(?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))')
        .join(', ');
      const params: Array<string | number | null> = [];
      for (const row of batch) {
        params.push(
          row.id,
          row.runId,
          row.studentId,
          row.courseId,
          row.facultyGroup,
          row.campusName,
          row.required
        );
      }
      await manager.query(
        `
        INSERT IGNORE INTO leveling_run_student_course_demands (
          id,
          runId,
          studentId,
          courseId,
          facultyGroup,
          campusName,
          required,
          createdAt,
          updatedAt
        )
        VALUES ${placeholders}
        `,
        params
      );
    }
  }

  private async bulkUpsertLevelingRunSectionCourseCapacities(
    manager: EntityManager,
    rows: Array<{
      id: string;
      runId: string;
      sectionCourseId: string;
      plannedCapacity: number;
    }>
  ) {
    if (rows.length === 0) return;
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map(() => '(?, ?, ?, ?, NOW(6), NOW(6))')
        .join(', ');
      const params: Array<string | number> = [];
      for (const row of batch) {
        params.push(
          row.id,
          row.runId,
          row.sectionCourseId,
          Math.max(0, Number(row.plannedCapacity ?? 0))
        );
      }
      await manager.query(
        `
        INSERT INTO leveling_run_section_course_capacities (
          id,
          runId,
          sectionCourseId,
          plannedCapacity,
          createdAt,
          updatedAt
        )
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          plannedCapacity = VALUES(plannedCapacity),
          updatedAt = NOW(6)
        `,
        params
      );
    }
  }

  private async getRunOrThrow(runId: string, manager?: EntityManager) {
    const db = manager ?? this.dataSource;
    const rows: Array<{
      id: string;
      periodId: string;
      status: string;
      configJson: unknown;
      sourceFileHash: string | null;
      createdBy: string | null;
      createdAt: Date | string;
      updatedAt: Date | string;
    }> = await db.query(
      `
      SELECT
        id,
        periodId,
        status,
        configJson,
        sourceFileHash,
        createdBy,
        createdAt,
        updatedAt
      FROM leveling_runs
      WHERE id = ?
      LIMIT 1
      `,
      [runId]
    );
    const row = rows[0];
    if (!row?.id) {
      throw new NotFoundException('Leveling run not found');
    }
    const configUsed = this.parseRunConfig(row.configJson);
    return {
      id: String(row.id),
      periodId: String(row.periodId),
      status: String(row.status || 'STRUCTURED') as LevelingRunStatus,
      configUsed,
      sourceFileHash: row.sourceFileHash ? String(row.sourceFileHash) : null,
      createdBy: row.createdBy ? String(row.createdBy) : null,
      createdAt: this.toIsoDateTime(row.createdAt),
      updatedAt: this.toIsoDateTime(row.updatedAt),
    };
  }

  private async tableExists(db: EntityManager | DataSource, tableName: string) {
    const rows: Array<{ c: number }> = await db.query(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private parseRunConfig(value: unknown) {
    const raw =
      typeof value === 'string'
        ? this.safeJsonParse(value)
        : (value as Record<string, unknown> | null);
    const initialCapacity = Number(raw?.initialCapacity ?? 45);
    const maxExtraCapacity = Number(raw?.maxExtraCapacity ?? 0);
    return {
      initialCapacity: Number.isFinite(initialCapacity) && initialCapacity > 0 ? initialCapacity : 45,
      maxExtraCapacity:
        Number.isFinite(maxExtraCapacity) && maxExtraCapacity >= 0 ? maxExtraCapacity : 0,
    };
  }

  private safeJsonParse(value: string) {
    try {
      const out = JSON.parse(value);
      if (out && typeof out === 'object') {
        return out as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async resolveCourseByNameOrThrow(courseName: string, manager: EntityManager) {
    const rows: Array<{ id: string; name: string }> = await manager.query(
      `
      SELECT id, name
      FROM courses
      `
    );
    const targetKey = this.courseKey(courseName);
    for (const row of rows) {
      const candidateName = String(row.name ?? '').trim();
      if (!candidateName) continue;
      if (this.courseKey(candidateName) === targetKey) {
        return {
          id: String(row.id),
          name: candidateName,
        };
      }
    }
    throw new BadRequestException(`Course not found: ${courseName}`);
  }

  private async generateManualSectionCode(params: {
    manager: EntityManager;
    facultyGroup: string;
    campusName: string;
  }) {
    const facultyChar = this.facultyChar(params.facultyGroup);
    const campus = this.normalizeCampus(params.campusName);
    const base = `M${facultyChar}-${campus.campusCode}`;
    for (let i = 1; i <= 999; i++) {
      const candidate = `${base}-${String(i).padStart(3, '0')}`;
      const rows: Array<{ c: number }> = await params.manager.query(
        `
        SELECT COUNT(*) AS c
        FROM sections
        WHERE code = ?
        `,
        [candidate]
      );
      if (Number(rows[0]?.c ?? 0) === 0) {
        return candidate;
      }
    }
    return `${base}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async loadMatriculationPreviewContext(params: {
    runId: string;
    periodId: string;
  }) {
    const hasPlannedCapacityTable = await this.tableExists(
      this.dataSource,
      'leveling_run_section_course_capacities'
    );
    const capacityInitialExpr = hasPlannedCapacityTable
      ? `
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN s.initialCapacity
          WHEN lrscc.plannedCapacity IS NOT NULL THEN lrscc.plannedCapacity
          ELSE s.initialCapacity
        END
      `
      : `s.initialCapacity`;
    const capacityExtraExpr = hasPlannedCapacityTable
      ? `
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN s.maxExtraCapacity
          WHEN lrscc.plannedCapacity IS NOT NULL THEN 0
          ELSE s.maxExtraCapacity
        END
      `
      : `s.maxExtraCapacity`;
    const plannedCapacityJoin = hasPlannedCapacityTable
      ? `
      LEFT JOIN leveling_run_section_course_capacities lrscc
        ON lrscc.runId = ?
       AND lrscc.sectionCourseId = sc.id
      `
      : '';

    const sectionCourseRows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionCode: string | null;
      sectionName: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      facultyName: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      teacherId: string | null;
      teacherName: string | null;
      hasTeacher: number;
    }> = await this.dataSource.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        sc.sectionId AS sectionId,
        s.code AS sectionCode,
        s.name AS sectionName,
        sc.courseId AS courseId,
        c.name AS courseName,
        s.facultyGroup AS facultyGroup,
        s.facultyName AS facultyName,
        s.campusName AS campusName,
        s.modality AS modality,
        ${capacityInitialExpr} AS initialCapacity,
        ${capacityExtraExpr} AS maxExtraCapacity,
        COALESCE(tc.id, ts.id) AS teacherId,
        COALESCE(tc.fullName, ts.fullName) AS teacherName,
        CASE
          WHEN COALESCE(tc.id, ts.id) IS NOT NULL THEN 1
          ELSE 0
        END AS hasTeacher
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      ${plannedCapacityJoin}
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      LEFT JOIN users tc ON tc.id = sct.teacherId
      LEFT JOIN users ts ON ts.id = s.teacherId
      WHERE s.levelingRunId = ?
        AND sc.periodId = ?
      ORDER BY
        s.code ASC,
        s.name ASC,
        c.name ASC
      `,
      [
        ...(hasPlannedCapacityTable ? [params.runId] : []),
        params.runId,
        params.periodId,
      ]
    );

    const sectionCourseIds = sectionCourseRows.map((x) => String(x.sectionCourseId));
    const blocksBySectionCourse = new Map<string, ScheduleBlockWindow[]>();
    if (sectionCourseIds.length > 0) {
      const placeholders = sectionCourseIds.map(() => '?').join(', ');
      const blockRows: Array<{
        sectionCourseId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      }> = await this.dataSource.query(
        `
        SELECT
          sb.sectionCourseId AS sectionCourseId,
          sb.dayOfWeek AS dayOfWeek,
          sb.startTime AS startTime,
          sb.endTime AS endTime,
          sb.startDate AS startDate,
          sb.endDate AS endDate
        FROM schedule_blocks sb
        WHERE sb.sectionCourseId IN (${placeholders})
        ORDER BY sb.dayOfWeek ASC, sb.startTime ASC
        `,
        sectionCourseIds
      );
      for (const row of blockRows) {
        const key = String(row.sectionCourseId);
        if (!blocksBySectionCourse.has(key)) {
          blocksBySectionCourse.set(key, []);
        }
        blocksBySectionCourse.get(key)!.push({
          dayOfWeek: Number(row.dayOfWeek ?? 0),
          startTime: String(row.startTime ?? ''),
          endTime: String(row.endTime ?? ''),
          startDate: this.toIsoDateOnly(row.startDate),
          endDate: this.toIsoDateOnly(row.endDate),
        });
      }
    }

    return {
      sectionCourseRows,
      blocksBySectionCourse,
    };
  }

  private buildMatriculationFacultyStatuses(
    sectionCourseRows: Array<{
      sectionCourseId: string;
      facultyGroup: string | null;
      hasTeacher: number;
    }>,
    blocksBySectionCourse: Map<string, ScheduleBlockWindow[]>
  ) {
    const byFaculty = new Map<
      string,
      { facultyGroup: string; totalSectionCourses: number; withSchedule: number; withTeacher: number }
    >();

    for (const row of sectionCourseRows) {
      const facultyGroup = this.scopeKey(row.facultyGroup) || 'SIN_FACULTAD';
      if (!byFaculty.has(facultyGroup)) {
        byFaculty.set(facultyGroup, {
          facultyGroup,
          totalSectionCourses: 0,
          withSchedule: 0,
          withTeacher: 0,
        });
      }
      const acc = byFaculty.get(facultyGroup)!;
      acc.totalSectionCourses += 1;
      if ((blocksBySectionCourse.get(String(row.sectionCourseId)) ?? []).length > 0) {
        acc.withSchedule += 1;
      }
      if (Number(row.hasTeacher ?? 0) > 0) {
        acc.withTeacher += 1;
      }
    }

    return Array.from(byFaculty.values())
      .map((item) => ({
        ...item,
        ready:
          item.totalSectionCourses > 0 &&
          item.withSchedule === item.totalSectionCourses &&
          item.withTeacher === item.totalSectionCourses,
      }))
      .sort((a, b) => a.facultyGroup.localeCompare(b.facultyGroup));
  }

  private async simulateMatriculationAssignments(params: {
    runId: string;
    facultyGroup: string | null;
    sectionCourseRows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionCode: string | null;
      sectionName: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
    }>;
    blocksBySectionCourse: Map<string, ScheduleBlockWindow[]>;
  }) {
    const demands: StudentDemandItem[] = await this.dataSource.query(
      `
      SELECT
        d.studentId AS studentId,
        u.codigoAlumno AS studentCode,
        u.fullName AS studentName,
        d.courseId AS courseId,
        c.name AS courseName,
        d.facultyGroup AS facultyGroup,
        d.campusName AS campusName
      FROM leveling_run_student_course_demands d
      INNER JOIN users u ON u.id = d.studentId
      INNER JOIN courses c ON c.id = d.courseId
      WHERE d.runId = ?
        AND d.required = 1
        ${params.facultyGroup ? 'AND d.facultyGroup = ?' : ''}
      ORDER BY u.fullName ASC, c.name ASC
      `,
      [params.runId, ...(params.facultyGroup ? [params.facultyGroup] : [])]
    );

    if (demands.length === 0) {
      throw new BadRequestException(
        params.facultyGroup
          ? `No hay demandas pendientes alumno-curso para la facultad ${params.facultyGroup}`
          : 'No hay demandas pendientes alumno-curso para matricular'
      );
    }

    type Candidate = {
      sectionCourseId: string;
      sectionId: string;
      sectionCode: string | null;
      sectionName: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      assignedCount: number;
      blocks: ScheduleBlockWindow[];
    };

    const candidatesByCourse = new Map<string, Candidate[]>();
    for (const row of params.sectionCourseRows) {
      const key = String(row.courseId);
      if (!candidatesByCourse.has(key)) {
        candidatesByCourse.set(key, []);
      }
      candidatesByCourse.get(key)!.push({
        sectionCourseId: String(row.sectionCourseId),
        sectionId: String(row.sectionId),
        sectionCode: row.sectionCode ? String(row.sectionCode) : null,
        sectionName: String(row.sectionName ?? ''),
        courseId: String(row.courseId),
        courseName: String(row.courseName ?? ''),
        facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
        campusName: row.campusName ? String(row.campusName) : null,
        modality: row.modality ? String(row.modality).toUpperCase().trim() : null,
        initialCapacity: Number(row.initialCapacity ?? 45),
        maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
        assignedCount: 0,
        blocks: params.blocksBySectionCourse.get(String(row.sectionCourseId)) ?? [],
      });
    }

    const demandWithCandidates = demands.map((demand) => {
      const allCourseCandidates = candidatesByCourse.get(String(demand.courseId)) ?? [];
      const sameFaculty = allCourseCandidates.filter(
        (candidate) =>
          this.scopeKey(candidate.facultyGroup) === this.scopeKey(demand.facultyGroup)
      );
      const sameScope = sameFaculty.filter(
        (candidate) =>
          this.scopeKey(candidate.campusName) === this.scopeKey(demand.campusName)
      );
      const virtualFacultyFallback = sameFaculty.filter((candidate) =>
        this.isVirtualModality(candidate.modality)
      );

      // Keep same-scope candidates first, but always allow virtual sections in the
      // same faculty as fallback (virtual has no hard cap by design).
      const prioritized =
        sameScope.length > 0
          ? [...sameScope, ...virtualFacultyFallback]
          : allCourseCandidates;
      const dedup = new Map<string, Candidate>();
      for (const candidate of prioritized) {
        dedup.set(candidate.sectionCourseId, candidate);
      }

      return {
        ...demand,
        candidates: [...dedup.values()],
      };
    });

    demandWithCandidates.sort((a, b) => {
      if (a.candidates.length !== b.candidates.length) {
        return a.candidates.length - b.candidates.length;
      }
      const sa = this.scopeKey(a.facultyGroup) + this.scopeKey(a.campusName);
      const sb = this.scopeKey(b.facultyGroup) + this.scopeKey(b.campusName);
      if (sa !== sb) return sa.localeCompare(sb);
      const na = this.scopeKey(a.studentName);
      const nb = this.scopeKey(b.studentName);
      if (na !== nb) return na.localeCompare(nb);
      return this.scopeKey(a.courseName).localeCompare(this.scopeKey(b.courseName));
    });

    const assignedBlocksByStudent = new Map<string, ScheduleBlockWindow[]>();
    const rowsToInsert: Array<{
      id: string;
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      studentId: string;
    }> = [];
    const unassigned: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      reason: string;
    }> = [];

    const studentDirectory = new Map<
      string,
      { studentId: string; studentCode: string | null; studentName: string }
    >();
    const studentsBySectionCourse = new Map<
      string,
      Array<{ studentId: string; studentCode: string | null; studentName: string }>
    >();

    const getStudentBlocks = (studentId: string) => {
      if (!assignedBlocksByStudent.has(studentId)) {
        assignedBlocksByStudent.set(studentId, []);
      }
      return assignedBlocksByStudent.get(studentId)!;
    };

    for (const demand of demandWithCandidates) {
      const studentId = String(demand.studentId);
      if (!studentDirectory.has(studentId)) {
        studentDirectory.set(studentId, {
          studentId,
          studentCode: demand.studentCode ? String(demand.studentCode) : null,
          studentName: String(demand.studentName ?? ''),
        });
      }

      if (demand.candidates.length === 0) {
        unassigned.push({
          studentId,
          studentCode: demand.studentCode ? String(demand.studentCode) : null,
          studentName: String(demand.studentName ?? ''),
          courseId: String(demand.courseId),
          courseName: String(demand.courseName ?? ''),
          facultyGroup: demand.facultyGroup ? String(demand.facultyGroup) : null,
          campusName: demand.campusName ? String(demand.campusName) : null,
          reason: 'No se encontró sección-curso candidata para este curso',
        });
        continue;
      }

      const studentBlocks = getStudentBlocks(studentId);

      // Filter candidates: capacity OK + no schedule conflict
      const available = demand.candidates.filter((candidate) => {
        if (this.isCapacityBlocked(candidate)) return false;
        if (this.hasScheduleOverlap(studentBlocks, candidate.blocks)) return false;
        return true;
      });

      if (available.length === 0) {
        const blockedByCapacity =
          demand.candidates.every((candidate) => this.isCapacityBlocked(candidate)) &&
          demand.candidates.length > 0;
        unassigned.push({
          studentId,
          studentCode: demand.studentCode ? String(demand.studentCode) : null,
          studentName: String(demand.studentName ?? ''),
          courseId: String(demand.courseId),
          courseName: String(demand.courseName ?? ''),
          facultyGroup: demand.facultyGroup ? String(demand.facultyGroup) : null,
          campusName: demand.campusName ? String(demand.campusName) : null,
          reason: blockedByCapacity
            ? 'No hay capacidad disponible en las secciones-curso candidatas'
            : 'Cruce de horario con cursos ya asignados',
        });
        continue;
      }

      this.sortCandidatesForAssignment(available);
      const selected = available[0];

      rowsToInsert.push({
        id: randomUUID(),
        sectionCourseId: selected.sectionCourseId,
        sectionId: selected.sectionId,
        courseId: selected.courseId,
        studentId,
      });
      selected.assignedCount += 1;
      studentBlocks.push(...selected.blocks);

      if (!studentsBySectionCourse.has(selected.sectionCourseId)) {
        studentsBySectionCourse.set(selected.sectionCourseId, []);
      }
      studentsBySectionCourse.get(selected.sectionCourseId)!.push({
        studentId,
        studentCode: demand.studentCode ? String(demand.studentCode) : null,
        studentName: String(demand.studentName ?? ''),
      });
    }

    for (const rows of studentsBySectionCourse.values()) {
      rows.sort((a, b) => {
        const nameCmp = this.scopeKey(a.studentName).localeCompare(
          this.scopeKey(b.studentName)
        );
        if (nameCmp !== 0) return nameCmp;
        return this.scopeKey(a.studentCode).localeCompare(this.scopeKey(b.studentCode));
      });
    }

    const summaryBySectionCourse = params.sectionCourseRows.map((row) => {
      const candidate = (candidatesByCourse.get(String(row.courseId)) ?? []).find(
        (x) => x.sectionCourseId === String(row.sectionCourseId)
      );
      return {
        sectionCourseId: String(row.sectionCourseId),
        sectionId: String(row.sectionId),
        sectionCode: row.sectionCode ? String(row.sectionCode) : null,
        sectionName: String(row.sectionName ?? ''),
        courseId: String(row.courseId),
        courseName: String(row.courseName ?? ''),
        assignedCount: Number(candidate?.assignedCount ?? 0),
        initialCapacity: Number(row.initialCapacity ?? 45),
        maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
      };
    });

    return {
      assignedCount: rowsToInsert.length,
      rowsToInsert,
      unassigned,
      summaryBySectionCourse,
      studentsBySectionCourse,
      conflicts: this.buildSimulatedMatriculationConflicts({
        rowsToInsert,
        sectionCourseRows: params.sectionCourseRows,
        blocksBySectionCourse: params.blocksBySectionCourse,
        studentDirectory,
      }),
    };
  }

  private buildSimulatedMatriculationConflicts(params: {
    rowsToInsert: Array<{
      sectionCourseId: string;
      studentId: string;
    }>;
    sectionCourseRows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionCode: string | null;
      sectionName: string;
      courseId: string;
      courseName: string;
    }>;
    blocksBySectionCourse: Map<string, ScheduleBlockWindow[]>;
    studentDirectory: Map<
      string,
      { studentId: string; studentCode: string | null; studentName: string }
    >;
  }) {
    const sectionCourseById = new Map(
      params.sectionCourseRows.map((row) => [String(row.sectionCourseId), row])
    );
    const assignedByStudent = new Map<string, string[]>();
    for (const row of params.rowsToInsert) {
      const studentId = String(row.studentId);
      if (!assignedByStudent.has(studentId)) {
        assignedByStudent.set(studentId, []);
      }
      assignedByStudent.get(studentId)!.push(String(row.sectionCourseId));
    }

    const seen = new Set<string>();
    const conflicts: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      dayOfWeek: number;
      blockA: {
        blockId: string;
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      };
      blockB: {
        blockId: string;
        sectionCourseId: string;
        sectionId: string;
        sectionCode: string | null;
        sectionName: string;
        courseId: string;
        courseName: string;
        startTime: string;
        endTime: string;
        startDate: string | null;
        endDate: string | null;
      };
    }> = [];

    for (const [studentId, sectionCourseIds] of assignedByStudent.entries()) {
      if (sectionCourseIds.length < 2) continue;
      for (let i = 0; i < sectionCourseIds.length; i += 1) {
        for (let j = i + 1; j < sectionCourseIds.length; j += 1) {
          const aId = String(sectionCourseIds[i]);
          const bId = String(sectionCourseIds[j]);
          const metaA = sectionCourseById.get(aId);
          const metaB = sectionCourseById.get(bId);
          if (!metaA || !metaB) continue;

          const blocksA = params.blocksBySectionCourse.get(aId) ?? [];
          const blocksB = params.blocksBySectionCourse.get(bId) ?? [];
          for (const blockA of blocksA) {
            for (const blockB of blocksB) {
              if (!this.blocksOverlap(blockA, blockB)) continue;
              const key =
                `${studentId}|${aId}|${bId}|${blockA.dayOfWeek}|${blockA.startTime}|${blockA.endTime}|` +
                `${blockA.startDate ?? ''}|${blockA.endDate ?? ''}|${blockB.startTime}|${blockB.endTime}|` +
                `${blockB.startDate ?? ''}|${blockB.endDate ?? ''}`;
              if (seen.has(key)) continue;
              seen.add(key);

              const student = params.studentDirectory.get(studentId) ?? {
                studentId,
                studentCode: null,
                studentName: '',
              };
              conflicts.push({
                studentId,
                studentCode: student.studentCode,
                studentName: student.studentName,
                dayOfWeek: Number(blockA.dayOfWeek ?? 0),
                blockA: {
                  blockId: `${aId}:${blockA.dayOfWeek}:${blockA.startTime}:${blockA.endTime}:${blockA.startDate ?? ''}:${blockA.endDate ?? ''
                    }`,
                  sectionCourseId: aId,
                  sectionId: String(metaA.sectionId),
                  sectionCode: metaA.sectionCode ? String(metaA.sectionCode) : null,
                  sectionName: String(metaA.sectionName ?? ''),
                  courseId: String(metaA.courseId),
                  courseName: String(metaA.courseName ?? ''),
                  startTime: String(blockA.startTime ?? ''),
                  endTime: String(blockA.endTime ?? ''),
                  startDate: blockA.startDate,
                  endDate: blockA.endDate,
                },
                blockB: {
                  blockId: `${bId}:${blockB.dayOfWeek}:${blockB.startTime}:${blockB.endTime}:${blockB.startDate ?? ''}:${blockB.endDate ?? ''
                    }`,
                  sectionCourseId: bId,
                  sectionId: String(metaB.sectionId),
                  sectionCode: metaB.sectionCode ? String(metaB.sectionCode) : null,
                  sectionName: String(metaB.sectionName ?? ''),
                  courseId: String(metaB.courseId),
                  courseName: String(metaB.courseName ?? ''),
                  startTime: String(blockB.startTime ?? ''),
                  endTime: String(blockB.endTime ?? ''),
                  startDate: blockB.startDate,
                  endDate: blockB.endDate,
                },
              });
            }
          }
        }
      }
    }

    return conflicts.sort((a, b) => {
      const studentCmp = this.scopeKey(a.studentName).localeCompare(
        this.scopeKey(b.studentName)
      );
      if (studentCmp !== 0) return studentCmp;
      const codeCmp = this.scopeKey(a.studentCode).localeCompare(this.scopeKey(b.studentCode));
      if (codeCmp !== 0) return codeCmp;
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return this.scopeKey(a.blockA.startTime).localeCompare(this.scopeKey(b.blockA.startTime));
    });
  }

  private defaultFacultyName(facultyGroup: string) {
    return this.norm(facultyGroup) === 'SALUD' ? SALUD_NAME : FICA_NAME;
  }

  private scopeKey(value: string | null | undefined) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private isCapacityBlocked(params: {
    assignedCount: number;
    initialCapacity: number;
    maxExtraCapacity: number;
    modality?: string | null;
  }) {
    if (this.isVirtualModality(params.modality)) {
      return false;
    }
    const assigned = Math.max(0, Number(params.assignedCount ?? 0));
    const initial = Math.max(0, Number(params.initialCapacity ?? 0));
    const maxExtra = Math.max(0, Number(params.maxExtraCapacity ?? 0));
    // Hard cap is always initialCapacity + maxExtraCapacity.
    // When maxExtraCapacity = 0, the cap is initialCapacity alone.
    const hardCap = initial + maxExtra;
    if (hardCap <= 0) return false; // Unlimited (no capacity configured)
    return assigned >= hardCap;
  }

  private capacityRatio(params: {
    assignedCount: number;
    initialCapacity: number;
    maxExtraCapacity: number;
  }) {
    const assigned = Math.max(0, Number(params.assignedCount ?? 0));
    const initial = Math.max(1, Number(params.initialCapacity ?? 1));
    const maxExtra = Math.max(0, Number(params.maxExtraCapacity ?? 0));
    if (maxExtra <= 0) {
      return assigned / Math.max(initial, 1);
    }
    return assigned / Math.max(initial + maxExtra, 1);
  }

  private modalityPriority(modality: string | null | undefined) {
    const value = this.scopeKey(modality);
    if (value.includes('PRESENCIAL')) return 0;
    if (value.includes('VIRTUAL')) return 1;
    return 2;
  }

  private isVirtualModality(modality: string | null | undefined) {
    return this.modalityPriority(modality) === 1;
  }

  private sortCandidatesForAssignment<
    T extends {
      modality: string | null;
      assignedCount: number;
      initialCapacity: number;
      maxExtraCapacity: number;
      sectionCode: string | null;
      sectionName: string;
      courseName: string;
    }
  >(candidates: T[]) {
    candidates.sort((a, b) => {
      const modalityDiff = this.modalityPriority(a.modality) - this.modalityPriority(b.modality);
      // Always prioritize PRESENCIAL candidates, fallback to VIRTUAL.
      if (modalityDiff !== 0) return modalityDiff;

      // Fill-first inside same modality.
      const ratioA = this.capacityRatio(a);
      const ratioB = this.capacityRatio(b);
      if (Math.abs(ratioA - ratioB) > 0.001) return ratioB - ratioA;

      const codeA = this.scopeKey(a.sectionCode ?? a.sectionName);
      const codeB = this.scopeKey(b.sectionCode ?? b.sectionName);
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return this.scopeKey(a.courseName).localeCompare(this.scopeKey(b.courseName));
    });
  }

  private hasScheduleOverlap(existing: ScheduleBlockWindow[], next: ScheduleBlockWindow[]) {
    if (existing.length === 0 || next.length === 0) return false;
    for (const a of existing) {
      for (const b of next) {
        if (this.blocksOverlap(a, b)) {
          return true;
        }
      }
    }
    return false;
  }

  private blocksOverlap(a: ScheduleBlockWindow, b: ScheduleBlockWindow) {
    if (a.dayOfWeek !== b.dayOfWeek) return false;
    if (!(a.startTime < b.endTime && a.endTime > b.startTime)) return false;
    return this.dateRangesOverlap(
      a.startDate,
      a.endDate,
      b.startDate,
      b.endDate
    );
  }

  private dateRangesOverlap(
    startA: string | null,
    endA: string | null,
    startB: string | null,
    endB: string | null
  ) {
    const aStart = startA || '1000-01-01';
    const aEnd = endA || '9999-12-31';
    const bStart = startB || '1000-01-01';
    const bEnd = endB || '9999-12-31';
    return aStart <= bEnd && bStart <= aEnd;
  }

  private hashBuffer(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private toIsoDateOnly(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return null;
      const directDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
      if (directDate) return directDate[1];
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString().slice(0, 10);
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString().slice(0, 10);
    }
    return null;
  }

  private toIsoDateTime(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(String(value ?? ''));
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  private async loadActivePeriodIdOrThrow(manager: EntityManager) {
    const rows: Array<{ id: string }> = await manager.query(
      `
      SELECT id
      FROM periods
      WHERE status = 'ACTIVE'
      ORDER BY updatedAt DESC, createdAt DESC
      LIMIT 1
      `
    );
    const id = String(rows[0]?.id ?? '').trim();
    if (!id) {
      throw new BadRequestException('No active period configured');
    }
    return id;
  }

  private async loadCourseCatalogByKey() {
    const rows: Array<{ id: string; name: string }> = await this.dataSource.query(`
      SELECT id, name
      FROM courses
    `);
    const out = new Map<string, { id: string; name: string }>();
    for (const row of rows) {
      const name = String(row.name ?? '').trim();
      const key = this.courseKey(name);
      if (!name || !key) continue;
      if (!out.has(key)) {
        out.set(key, {
          id: String(row.id),
          name,
        });
      }
    }
    return out;
  }

  private async loadCareerFacultyMap() {
    const rows: Array<{ careerName: string; facultyName: string }> =
      await this.dataSource.query(`
      SELECT c.name AS careerName, f.name AS facultyName
      FROM careers c
      INNER JOIN faculties f ON f.id = c.facultyId
    `);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(this.norm(row.careerName), row.facultyName);
    }
    return map;
  }

  private extractNeededCourses(
    row: (string | number | null)[],
    columns: Array<{ idx: number; courseName: CourseName }>
  ) {
    const out: CourseName[] = [];
    for (const { idx, courseName } of columns) {
      if (this.hasCourseNeed(this.cell(row, idx))) {
        out.push(courseName);
      }
    }
    return out;
  }

  private findHeaderRowIndex(rows: (string | number | null)[][]) {
    const max = Math.min(rows.length, 25);
    for (let i = 0; i < max; i++) {
      const row = rows[i] ?? [];
      const normalized = row.map((x) => this.norm(String(x ?? '')));
      const hasDni = normalized.includes('DNI');
      const hasCareer = normalized.some((x) => x.includes('CARRERA'));
      if (hasDni && hasCareer) return i;
    }
    return -1;
  }

  private resolveExcelColumns(
    headerRow: (string | number | null)[],
    courseCatalogByKey: Map<string, { id: string; name: string }>
  ): ExcelColumns {
    const byNorm = new Map<string, number[]>();
    for (let i = 0; i < headerRow.length; i++) {
      const key = this.norm(String(headerRow[i] ?? ''));
      if (!key) continue;
      if (!byNorm.has(key)) byNorm.set(key, []);
      byNorm.get(key)!.push(i);
    }

    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const idx = byNorm.get(this.norm(key))?.[0];
        if (idx !== undefined) return idx;
      }
      return null;
    };

    const courseColumns: Array<{ idx: number; courseName: CourseName }> = [];
    for (let idx = FIRST_COURSE_COLUMN_INDEX; idx < headerRow.length; idx++) {
      const rawHeader = this.cell(headerRow, idx);
      if (!rawHeader) continue;
      const mapped = courseCatalogByKey.get(this.courseKey(rawHeader));
      if (!mapped?.name) continue;
      courseColumns.push({ idx, courseName: mapped.name });
    }

    if (courseColumns.length === 0) {
      for (const [idxRaw, legacyName] of Object.entries(LEGACY_COURSE_BY_COLUMN)) {
        const idx = Number(idxRaw);
        const mapped = courseCatalogByKey.get(this.courseKey(legacyName));
        if (!mapped?.name) continue;
        courseColumns.push({ idx, courseName: mapped.name });
      }
    }

    return {
      orderIdx: pick('NRO', 'NRO.', 'NUMERO', 'ITEM'),
      paternalLastNameIdx: pick('APELLIDOPATERNO', 'APELLIDO PATERNO'),
      maternalLastNameIdx: pick('APELLIDOMATERNO', 'APELLIDO MATERNO'),
      namesIdx: pick('NOMBRES'),
      fullNameIdx: pick('APELLIDOS Y NOMBRES', 'APELLIDOSYNOMBRES', 'NOMBRE COMPLETO'),
      emailIdx: pick('CORREO', 'EMAIL', 'E-MAIL', 'CORREOINSTITUCIONAL', 'CORREO INSTITUCIONAL'),
      sexIdx: pick('SEXO', 'GENERO'),
      studentCodeIdx: pick('CODIGOESTUDIANTE', 'CODIGO ALUMNO', 'CODIGO'),
      dniIdx: pick('DNI') ?? 4,
      facultyIdx: pick('FACULTAD'),
      areaIdx: pick('AREA'),
      careerIdx: pick('CARRERA', 'PROGRAMA ACADEMICO') ?? 6,
      campusIdx: pick('SEDE', 'SEDE DE EVALUACION', 'SEDE EVALUACION', 'SEDE EXAMEN', 'LUGAR DE EXAMEN', 'FILIAL', 'CAMPUS'),
      modalityIdx: pick('MODALIDAD'),
      conditionIdx: pick('CONDICION'),
      needsLevelingIdx: pick('REQUERIMIENTO DE NIVELACION', 'NIVELACION'),
      programLevelingIdx: pick('PROGRAMA DE NIVELACIÓN', 'PROGRAMA DE NIVELACION', 'PROGRAMA NIVELACION'),
      examDateIdx: pick('FECHA EXAMEN', 'FECHA DE EXAMEN', 'FECHAEXAMEN'),
      courseColumns: this.sortCourseColumns(courseColumns),
    };
  }

  private sortCourseColumns(columns: Array<{ idx: number; courseName: CourseName }>) {
    const uniqueByName = new Map<string, { idx: number; courseName: CourseName }>();
    for (const col of columns) {
      const key = this.courseKey(col.courseName);
      if (!key) continue;
      if (!uniqueByName.has(key)) uniqueByName.set(key, col);
    }
    return Array.from(uniqueByName.values()).sort((a, b) => a.idx - b.idx);
  }

  private sortCourseNames(courseNames: CourseName[]) {
    const preferred = new Map<string, number>();
    for (let i = 0; i < PREFERRED_COURSE_ORDER.length; i++) {
      preferred.set(this.courseKey(PREFERRED_COURSE_ORDER[i]), i);
    }
    return Array.from(new Set(courseNames))
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .sort((a, b) => {
        const ia = preferred.get(this.courseKey(a));
        const ib = preferred.get(this.courseKey(b));
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return a.localeCompare(b);
      });
  }

  private initCourseCountMap(courseNames: CourseName[]) {
    const map: Record<CourseName, number> = {};
    for (const course of courseNames) {
      map[course] = 0;
    }
    return map;
  }

  private initCourseGroupSizesMap(courseNames: CourseName[]) {
    const map: Record<CourseName, number[]> = {};
    for (const course of courseNames) {
      map[course] = [];
    }
    return map;
  }

  private initGroupItemsMap(courseNames: CourseName[]) {
    const map: Record<
      CourseName,
      Array<{ id: string; size: number; modality: 'PRESENCIAL' | 'VIRTUAL' }>
    > = {};
    for (const course of courseNames) {
      map[course] = [];
    }
    return map;
  }

  private sumCourseCountMap(
    counts: Record<CourseName, number>,
    courseNames: CourseName[]
  ) {
    return courseNames.reduce((acc, course) => acc + Number(counts[course] ?? 0), 0);
  }

  private hasCourseNeed(raw: string) {
    const n = this.norm(raw);
    if (!n) return false;
    if (n === '0' || n === '-' || n === 'NO' || n === 'N') return false;
    if (n === 'FALSE' || n === 'N/A' || n === 'NA') return false;
    return true;
  }

  private uniqueCourses(courses: CourseName[]) {
    return Array.from(new Set(courses)).sort() as CourseName[];
  }

  private fallbackFaculty(area: string) {
    const n = this.norm(area);
    if (n === 'B') return SALUD_NAME;
    if (n.includes('SALUD')) return SALUD_NAME;
    return FICA_NAME;
  }

  private facultyGroupOf(facultyName: string): 'FICA' | 'SALUD' {
    const n = this.norm(facultyName);
    if (n === this.norm(SALUD_NAME)) return 'SALUD';
    return 'FICA';
  }

  private facultyChar(group: string) {
    return group === 'SALUD' ? 'S' : 'F';
  }

  private normalizeCampus(raw: string) {
    const n = this.norm(raw);
    if (n.includes('CHINCHA')) return { campusName: 'SEDE CHINCHA', campusCode: 'CH' };
    if (n.includes('ICA')) return { campusName: 'FILIAL ICA', campusCode: 'IC' };
    if (n.includes('HUAURA') || n.includes('HUACHO')) {
      return { campusName: 'FILIAL HUAURA', campusCode: 'HU' };
    }

    const words = raw
      .split(/\s+/g)
      .map((x) => x.trim())
      .filter(Boolean);
    const code =
      words.length >= 2
        ? `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
        : (raw.slice(0, 2) || 'XX').toUpperCase();
    return {
      campusName: raw || 'SEDE',
      campusCode: code,
    };
  }

  private shortCampus(campusName: string) {
    const n = this.norm(campusName);
    if (n.includes('CHINCHA')) return 'CHINCHA';
    if (n.includes('ICA')) return 'ICA';
    if (n.includes('HUAURA') || n.includes('HUACHO')) return 'HUAURA';
    return (campusName || 'SEDE').trim().toUpperCase();
  }

  private fullCampusFromShort(campusShort: string) {
    const n = this.norm(campusShort);
    if (n === 'CHINCHA') return { name: 'SEDE CHINCHA', code: 'CH' };
    if (n === 'ICA') return { name: 'FILIAL ICA', code: 'IC' };
    if (n === 'HUAURA') return { name: 'FILIAL HUAURA', code: 'HU' };
    return { name: campusShort || 'SEDE', code: (campusShort || 'SE').slice(0, 2).toUpperCase() };
  }

  private campusSort(campusName: string) {
    const short = this.shortCampus(campusName);
    if (short === 'CHINCHA') return 0;
    if (short === 'ICA') return 1;
    if (short === 'HUAURA') return 2;
    return 10;
  }

  private modalitySort(modality: string) {
    const n = this.norm(modality);
    if (n.includes('PRESENCIAL')) return 0;
    if (n.includes('VIRTUAL')) return 1;
    return 2;
  }

  private alphaCode(idx: number) {
    let n = idx;
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out || 'A';
  }

  private cell(row: (string | number | null)[], idx: number) {
    const v = row[idx];
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  private normalizeDni(raw: string) {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    return digits;
  }

  private normalizeEmail(raw: string) {
    const value = String(raw || '').trim();
    if (!value) return null;
    return value.toLowerCase();
  }

  private normalizeSex(raw: string) {
    const value = this.norm(String(raw || ''));
    if (!value) return null;
    if (value.startsWith('MASC')) return 'M';
    if (value.startsWith('FEM')) return 'F';
    if (value === 'M' || value === 'F') return value;
    return String(raw || '').trim().toUpperCase();
  }

  private splitFullName(fullNameRaw: string) {
    const fullName = String(fullNameRaw || '').trim();
    if (!fullName) {
      return {
        paternalLastName: '',
        maternalLastName: '',
        names: '',
      };
    }

    const commaIdx = fullName.indexOf(',');
    if (commaIdx >= 0) {
      const left = fullName.slice(0, commaIdx).trim();
      const right = fullName.slice(commaIdx + 1).trim();
      const surnameParts = left.split(/\s+/g).filter(Boolean);
      return {
        paternalLastName: surnameParts[0] ?? '',
        maternalLastName: surnameParts.slice(1).join(' '),
        names: right,
      };
    }

    const tokens = fullName.split(/\s+/g).filter(Boolean);
    if (tokens.length <= 2) {
      return {
        paternalLastName: tokens[0] ?? '',
        maternalLastName: '',
        names: tokens.slice(1).join(' '),
      };
    }
    return {
      paternalLastName: tokens[0] ?? '',
      maternalLastName: tokens[1] ?? '',
      names: tokens.slice(2).join(' '),
    };
  }

  private norm(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private courseKey(value: string) {
    return this.norm(value).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  }

  private normalizeSourceModality(raw: string): 'VIRTUAL' | 'PRESENCIAL' | 'SIN DATO' {
    const n = this.norm(raw);
    if (!n) return 'SIN DATO';
    if (n.includes('VIRTUAL')) return 'VIRTUAL';
    if (n.includes('PRESENCIAL')) return 'PRESENCIAL';
    return 'SIN DATO';
  }

  private splitCourseGroups(count: number, capacity: number, modality: string) {
    if (count <= 0) return [];
    if (this.norm(modality) === 'VIRTUAL') {
      // Virtual has no seat cap; merge into one group per course.
      return [count];
    }

    const out: number[] = [];
    let remaining = count;
    const cap = Math.max(1, capacity);
    while (remaining > 0) {
      const chunk = Math.min(cap, remaining);
      out.push(chunk);
      remaining -= chunk;
    }
    return out;
  }

  private parseSmartDate(raw: string): number {
    if (!raw) return 0;
    // Try DD/MM/YYYY
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) {
      return new Date(
        Number(dmy[3]),
        Number(dmy[2]) - 1,
        Number(dmy[1])
      ).getTime();
    }
    // Try standard
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
    return 0;
  }
}
