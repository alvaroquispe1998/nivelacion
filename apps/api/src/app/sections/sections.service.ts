import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
import * as XLSX from 'xlsx';
import { Repository } from 'typeorm';
import { ClassroomEntity } from '../classrooms/classroom.entity';
import { SectionCourseTeacherEntity } from './section-course-teacher.entity';
import { SectionEntity } from './section.entity';
import { UserEntity } from '../users/user.entity';
import { PeriodsService } from '../periods/periods.service';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(SectionEntity)
    private readonly sectionsRepo: Repository<SectionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomsRepo: Repository<ClassroomEntity>,
    @InjectRepository(SectionCourseTeacherEntity)
    private readonly sectionCourseTeachersRepo: Repository<SectionCourseTeacherEntity>,
    private readonly periodsService: PeriodsService
  ) { }

  async list(): Promise<Array<{ section: SectionEntity; studentCount: number }>> {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const sections = await this.sectionsRepo.find({
      relations: { teacher: true },
      order: { createdAt: 'DESC' },
    });

    if (sections.length === 0) return [];

    const ids = sections.map((s) => s.id);
    const placeholders = ids.map(() => '?').join(', ');
    const rows: Array<{ sectionId: string; c: number }> =
      await this.sectionsRepo.manager.query(
        `
      SELECT
        sc.sectionId AS sectionId,
        COUNT(DISTINCT ssc.studentId) AS c
      FROM section_courses sc
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.sectionId IN (${placeholders})
        AND sc.periodId = ?
      GROUP BY sc.sectionId
      `,
        [...ids, activePeriodId]
      );
    const countBySectionId = new Map<string, number>();
    for (const row of rows) {
      countBySectionId.set(String(row.sectionId), Number(row.c || 0));
    }

    return sections.map((section) => ({
      section,
      studentCount: countBySectionId.get(section.id) ?? 0,
    }));
  }

  async listByCourseFilter(params: {
    facultyGroup: string;
    campusName: string;
    courseName: string;
  }): Promise<
    Array<{
      section: SectionEntity;
      studentCount: number;
      scheduleSummary: string | null;
      hasSchedule: boolean;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      classroomPavilionCode: string | null;
      classroomPavilionName: string | null;
      classroomLevelName: string | null;
      capacitySource: string | null;
      planningStatus: 'OK' | 'FALTA_AULA' | 'CRUCE_AULA' | 'CRUCE_DOCENTE';
      planningStatusLabel: string;
      hasClassroomConflict: boolean;
      hasTeacherConflict: boolean;
      availableSeats: number | null;
      isMotherSection: boolean;
    }>
  > {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const facultyGroup = params.facultyGroup.trim();
    const campusName = params.campusName.trim();
    const courseName = params.courseName.trim();

    if (!facultyGroup || !campusName || !courseName) {
      return [];
    }
    const isVirtualCampus = this.isVirtualCampusFilter(campusName);

    const course = await this.resolveCourseByName(courseName);
    if (!course) return [];

    const rows: Array<{
      id: string;
      name: string;
      code: string | null;
      akademicSectionId: string | null;
      facultyGroup: string | null;
      facultyName: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      isAutoLeveling: number;
      createdAt: Date;
      updatedAt: Date;
      teacherId: string | null;
      teacherDni: string | null;
      teacherName: string | null;
      studentCount: number;
      scheduleSummary: string | null;
      scheduleBlocksCount: number;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      classroomPavilionCode: string | null;
      classroomPavilionName: string | null;
      classroomLevelName: string | null;
      capacitySource: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA';
      hasClassroomConflict: number;
      hasTeacherConflict: number;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        s.id AS id,
        s.name AS name,
        s.code AS code,
        s.akademicSectionId AS akademicSectionId,
        s.facultyGroup AS facultyGroup,
        s.facultyName AS facultyName,
        s.campusName AS campusName,
        s.modality AS modality,
        COALESCE(scf.initialCapacity, s.initialCapacity) AS initialCapacity,
        COALESCE(scf.maxExtraCapacity, s.maxExtraCapacity) AS maxExtraCapacity,
        s.isAutoLeveling AS isAutoLeveling,
        s.createdAt AS createdAt,
        s.updatedAt AS updatedAt,
        COALESCE(tc.id, ts.id) AS teacherId,
        COALESCE(tc.dni, ts.dni) AS teacherDni,
        COALESCE(tc.fullName, ts.fullName) AS teacherName,
        scf.classroomId AS classroomId,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        cl.capacity AS classroomCapacity,
        p.code AS classroomPavilionCode,
        p.name AS classroomPavilionName,
        cl.levelName AS classroomLevelName,
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 'VIRTUAL'
          WHEN scf.classroomId IS NULL THEN 'SIN_AULA'
          WHEN cl.id IS NULL THEN 'AULA_INACTIVA'
          ELSE 'AULA'
        END AS capacitySource,
        CASE
          WHEN scf.classroomId IS NULL THEN 0
          ELSE EXISTS (
            SELECT 1
            FROM section_courses scx
            INNER JOIN schedule_blocks sbx
              ON sbx.sectionCourseId = scx.id
            INNER JOIN schedule_blocks sbo
              ON sbo.sectionCourseId = scf.id
            WHERE scx.periodId = scf.periodId
              AND scx.id <> scf.id
              AND scx.classroomId = scf.classroomId
              AND sbx.dayOfWeek = sbo.dayOfWeek
              AND sbx.startTime < sbo.endTime
              AND sbx.endTime > sbo.startTime
              AND COALESCE(sbx.startDate, '1000-01-01') <= COALESCE(sbo.endDate, '9999-12-31')
              AND COALESCE(sbo.startDate, '1000-01-01') <= COALESCE(sbx.endDate, '9999-12-31')
            LIMIT 1
          )
        END AS hasClassroomConflict,
        CASE
          WHEN COALESCE(sct.teacherId, s.teacherId) IS NULL THEN 0
          ELSE EXISTS (
            SELECT 1
            FROM section_courses scx
            INNER JOIN sections sx ON sx.id = scx.sectionId
            LEFT JOIN section_course_teachers sctx
              ON sctx.sectionCourseId = scx.id
            INNER JOIN schedule_blocks sbx
              ON sbx.sectionCourseId = scx.id
            INNER JOIN schedule_blocks sbo
              ON sbo.sectionCourseId = scf.id
            WHERE scx.periodId = scf.periodId
              AND scx.id <> scf.id
              AND COALESCE(sctx.teacherId, sx.teacherId) = COALESCE(sct.teacherId, s.teacherId)
              AND sbx.dayOfWeek = sbo.dayOfWeek
              AND sbx.startTime < sbo.endTime
              AND sbx.endTime > sbo.startTime
              AND COALESCE(sbx.startDate, '1000-01-01') <= COALESCE(sbo.endDate, '9999-12-31')
              AND COALESCE(sbo.startDate, '1000-01-01') <= COALESCE(sbx.endDate, '9999-12-31')
            LIMIT 1
          )
        END AS hasTeacherConflict,
        COUNT(DISTINCT ssc.studentId) AS studentCount,
        COUNT(DISTINCT sb.id) AS scheduleBlocksCount,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            CASE sb.dayOfWeek
              WHEN 1 THEN 'Lun '
              WHEN 2 THEN 'Mar '
              WHEN 3 THEN 'Mie '
              WHEN 4 THEN 'Jue '
              WHEN 5 THEN 'Vie '
              WHEN 6 THEN 'Sab '
              WHEN 7 THEN 'Dom '
              ELSE ''
            END,
            LEFT(COALESCE(sb.startTime, ''), 5),
            '-',
            LEFT(COALESCE(sb.endTime, ''), 5)
          )
          ORDER BY sb.dayOfWeek ASC, sb.startTime ASC
          SEPARATOR ' | '
        ) AS scheduleSummary
      FROM sections s
      INNER JOIN section_courses scf
        ON scf.sectionId = s.id
       AND scf.courseId = ?
       AND scf.periodId = ?
      LEFT JOIN section_course_teachers sct
        ON sct.sectionCourseId = scf.id
      LEFT JOIN users tc
        ON tc.id = sct.teacherId
      LEFT JOIN users ts
        ON ts.id = s.teacherId
      LEFT JOIN classrooms cl
        ON cl.id = scf.classroomId
       AND cl.status = 'ACTIVA'
      LEFT JOIN pavilions p
        ON p.id = cl.pavilionId
      LEFT JOIN schedule_blocks sb
        ON sb.sectionCourseId = scf.id
      LEFT JOIN section_student_courses ssc
        ON ssc.sectionCourseId = scf.id
      WHERE s.facultyGroup = ?
        AND (
          (? = 1 AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%')
          OR (
            ? = 0
            AND s.campusName = ?
            AND UPPER(COALESCE(s.modality, '')) NOT LIKE '%VIRTUAL%'
          )
        )
      GROUP BY
        s.id,
        s.name,
        s.code,
        s.akademicSectionId,
        s.facultyGroup,
        s.facultyName,
        s.campusName,
        s.modality,
        scf.initialCapacity,
        scf.maxExtraCapacity,
        s.initialCapacity,
        s.maxExtraCapacity,
        s.isAutoLeveling,
        s.createdAt,
        s.updatedAt,
        tc.id,
        tc.dni,
        tc.fullName,
        ts.id,
        ts.dni,
        ts.fullName,
        scf.classroomId,
        cl.id,
        cl.code,
        cl.name,
        cl.capacity,
        p.code,
        p.name,
        cl.levelName
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC
      `,
      [
        course.id,
        activePeriodId,
        facultyGroup,
        isVirtualCampus ? 1 : 0,
        isVirtualCampus ? 1 : 0,
        campusName,
      ]
    );

    const motherSectionId = String(rows[0]?.id ?? '').trim() || null;

    return rows.map((row) => {
      const section = this.sectionsRepo.create({
        id: row.id,
        name: row.name,
        code: row.code,
        akademicSectionId: row.akademicSectionId,
        facultyGroup: row.facultyGroup,
        facultyName: row.facultyName,
        campusName: row.campusName,
        modality: row.modality,
        initialCapacity: Number(row.initialCapacity ?? 45),
        maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
        isAutoLeveling: Boolean(row.isAutoLeveling),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        teacher: row.teacherId
          ? this.usersRepo.create({
            id: row.teacherId,
            dni: row.teacherDni ?? '',
            fullName: row.teacherName ?? '',
            role: Role.DOCENTE,
            codigoAlumno: null,
            passwordHash: null,
          })
          : null,
      });
      return {
        section,
        studentCount: Number(row.studentCount || 0),
        scheduleSummary: row.scheduleSummary ? String(row.scheduleSummary) : null,
        hasSchedule: Number(row.scheduleBlocksCount ?? 0) > 0,
        classroomId: row.classroomId ? String(row.classroomId) : null,
        classroomCode: row.classroomCode ? String(row.classroomCode) : null,
        classroomName: row.classroomName ? String(row.classroomName) : null,
        classroomCapacity:
          row.classroomCapacity !== null && row.classroomCapacity !== undefined
            ? Number(row.classroomCapacity)
            : null,
        classroomPavilionCode: row.classroomPavilionCode
          ? String(row.classroomPavilionCode)
          : null,
        classroomPavilionName: row.classroomPavilionName
          ? String(row.classroomPavilionName)
          : null,
        classroomLevelName: row.classroomLevelName
          ? String(row.classroomLevelName)
          : null,
        capacitySource: String(row.capacitySource ?? '').trim() || null,
        ...this.buildPlanningStatusAndAvailability({
          modality: row.modality ? String(row.modality) : null,
          capacitySource: String(row.capacitySource ?? '').trim() || null,
          classroomCapacity:
            row.classroomCapacity !== null && row.classroomCapacity !== undefined
              ? Number(row.classroomCapacity)
              : null,
          studentCount: Number(row.studentCount || 0),
          hasClassroomConflict: Number(row.hasClassroomConflict ?? 0) > 0,
          hasTeacherConflict: Number(row.hasTeacherConflict ?? 0) > 0,
        }),
        isMotherSection:
          motherSectionId !== null &&
          String(row.id ?? '').trim() === motherSectionId,
      };
    });
  }

  async getCourseScopeProgress(params: {
    facultyGroup: string;
    campusName: string;
    courseName: string;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const facultyGroup = String(params.facultyGroup ?? '').trim();
    const campusName = String(params.campusName ?? '').trim();
    const courseName = String(params.courseName ?? '').trim();
    if (!facultyGroup || !campusName || !courseName) {
      throw new BadRequestException(
        'facultyGroup, campusName y courseName son requeridos'
      );
    }

    const course = await this.resolveCourseByName(courseName);
    if (!course) {
      return {
        facultyGroup,
        campusName,
        courseName,
        demandaTotal: 0,
        matriculados: 0,
        porMatricular: 0,
        capacidadPlanificada: 0,
        brecha: 0,
        exceso: 0,
        capacidadSuficiente: true,
      };
    }

    const isVirtualCampus = this.isVirtualCampusFilter(campusName);

    const assignedRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(DISTINCT ssc.studentId) AS c
      FROM sections s
      INNER JOIN section_courses sc
        ON sc.sectionId = s.id
       AND sc.periodId = ?
       AND sc.courseId = ?
      INNER JOIN section_student_courses ssc
        ON ssc.sectionCourseId = sc.id
      WHERE s.facultyGroup = ?
        AND (
          (? = 1 AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%')
          OR (
            ? = 0
            AND s.campusName = ?
            AND UPPER(COALESCE(s.modality, '')) NOT LIKE '%VIRTUAL%'
          )
        )
      `,
      [
        activePeriodId,
        course.id,
        facultyGroup,
        isVirtualCampus ? 1 : 0,
        isVirtualCampus ? 1 : 0,
        campusName,
      ]
    );
    const matriculados = Number(assignedRows[0]?.c ?? 0);

    const runRows: Array<{ id: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT id
      FROM leveling_runs
      WHERE periodId = ?
        AND status <> 'ARCHIVED'
      ORDER BY updatedAt DESC
      LIMIT 1
      `,
      [activePeriodId]
    );
    const runId = String(runRows[0]?.id ?? '').trim();
    if (!runId) {
      const sections = await this.listByCourseFilter({
        facultyGroup,
        campusName,
        courseName,
      });
      const capacidadPlanificadaFisica = sections.reduce((acc, row) => {
        if (this.isVirtualModality(row.section.modality)) return acc;
        if (row.planningStatus !== 'OK') return acc;
        const cap = Math.max(0, Number(row.classroomCapacity ?? 0));
        return acc + cap;
      }, 0);
      const demandaTotal = Math.max(0, matriculados);
      const capacidadPlanificada = isVirtualCampus
        ? demandaTotal
        : capacidadPlanificadaFisica;
      const brecha = isVirtualCampus ? 0 : demandaTotal - capacidadPlanificada;
      const exceso = isVirtualCampus
        ? 0
        : Math.max(0, capacidadPlanificada - demandaTotal);
      return {
        facultyGroup,
        campusName,
        courseName: course.name,
        demandaTotal,
        matriculados,
        porMatricular: 0,
        capacidadPlanificada,
        brecha,
        exceso,
        capacidadSuficiente: isVirtualCampus ? true : brecha <= 0,
      };
    }

    const demandFilterSql = isVirtualCampus
      ? `COALESCE(NULLIF(TRIM(d.sourceModality), ''), 'SIN DATO') = 'VIRTUAL'`
      : `d.campusName = ? AND COALESCE(NULLIF(TRIM(d.sourceModality), ''), 'SIN DATO') <> 'VIRTUAL'`;
    const demandFilterParams = isVirtualCampus ? [] : [campusName];

    const demandRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM leveling_run_student_course_demands d
      WHERE d.runId = ?
        AND d.courseId = ?
        AND d.facultyGroup = ?
        AND ${demandFilterSql}
      `,
      [runId, course.id, facultyGroup, ...demandFilterParams]
    );
    const assignedDemandRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM leveling_run_student_course_demands d
      WHERE d.runId = ?
        AND d.courseId = ?
        AND d.facultyGroup = ?
        AND ${demandFilterSql}
        AND EXISTS (
          SELECT 1
          FROM section_student_courses ssc
          INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
          WHERE sc.periodId = ?
            AND sc.courseId = d.courseId
            AND ssc.studentId = d.studentId
        )
      `,
      [runId, course.id, facultyGroup, ...demandFilterParams, activePeriodId]
    );

    const demands = Number(demandRows[0]?.c ?? 0);
    const demandsAssigned = Number(assignedDemandRows[0]?.c ?? 0);
    const porMatricular = Math.max(0, demands - demandsAssigned);
    const demandaTotal = Math.max(demands, matriculados + porMatricular);
    const sections = await this.listByCourseFilter({
      facultyGroup,
      campusName,
      courseName,
    });
    const capacidadPlanificadaFisica = sections.reduce((acc, row) => {
      if (this.isVirtualModality(row.section.modality)) return acc;
      if (row.planningStatus !== 'OK') return acc;
      const cap = Math.max(0, Number(row.classroomCapacity ?? 0));
      return acc + cap;
    }, 0);
    const capacidadPlanificada = isVirtualCampus
      ? demandaTotal
      : capacidadPlanificadaFisica;
    const brecha = isVirtualCampus ? 0 : demandaTotal - capacidadPlanificada;
    const exceso = isVirtualCampus
      ? 0
      : Math.max(0, capacidadPlanificada - demandaTotal);

    return {
      facultyGroup,
      campusName,
      courseName: course.name,
      demandaTotal,
      matriculados,
      porMatricular,
      capacidadPlanificada,
      brecha,
      exceso,
      capacidadSuficiente: isVirtualCampus ? true : brecha <= 0,
    };
  }

  async listFacultyFiltersDetailed() {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{ facultyGroup: string; facultyName: string | null }> =
      await this.sectionsRepo.manager.query(
        `
      SELECT
        s.facultyGroup AS facultyGroup,
        MAX(s.facultyName) AS facultyName
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      WHERE sc.periodId = ?
        AND s.facultyGroup IS NOT NULL
        AND s.facultyGroup <> ''
      GROUP BY s.facultyGroup
      ORDER BY s.facultyGroup ASC
      `,
        [activePeriodId]
      );
    return rows.map((row) => ({
      facultyGroup: String(row.facultyGroup || '').trim(),
      facultyName: String(row.facultyName || '').trim() || String(row.facultyGroup || '').trim(),
    }));
  }

  async listScheduleConflicts(params?: {
    facultyGroup?: string;
    campusName?: string;
    courseName?: string;
    studentCode?: string;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const facultyGroup = String(params?.facultyGroup ?? '').trim();
    const campusName = String(params?.campusName ?? '').trim();
    const courseName = String(params?.courseName ?? '').trim();
    const studentCode = String(params?.studentCode ?? '').trim();

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
    }> = await this.sectionsRepo.manager.query(
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
      INNER JOIN schedule_blocks b1
        ON b1.sectionCourseId = sc1.id
      INNER JOIN schedule_blocks b2
        ON b2.sectionCourseId = sc2.id
       AND b1.dayOfWeek = b2.dayOfWeek
       AND b1.startTime < b2.endTime
       AND b1.endTime > b2.startTime
       AND COALESCE(b1.startDate, '1000-01-01') <= COALESCE(b2.endDate, '9999-12-31')
       AND COALESCE(b2.startDate, '1000-01-01') <= COALESCE(b1.endDate, '9999-12-31')
      INNER JOIN sections s1 ON s1.id = sc1.sectionId
      INNER JOIN sections s2 ON s2.id = sc2.sectionId
      INNER JOIN courses c1 ON c1.id = sc1.courseId
      INNER JOIN courses c2 ON c2.id = sc2.courseId
      INNER JOIN users u ON u.id = ssc1.studentId
      WHERE (? = '' OR s1.facultyGroup = ? OR s2.facultyGroup = ?)
        AND (? = '' OR s1.campusName = ? OR s2.campusName = ?)
        AND (? = '' OR c1.name = ? OR c2.name = ?)
        AND (? = '' OR UPPER(COALESCE(u.codigoAlumno, '')) LIKE ?)
      ORDER BY
        u.fullName ASC,
        u.codigoAlumno ASC,
        b1.dayOfWeek ASC,
        b1.startTime ASC,
        s1.code ASC,
        s2.code ASC
      `,
      [
        activePeriodId,
        activePeriodId,
        facultyGroup,
        facultyGroup,
        facultyGroup,
        campusName,
        campusName,
        campusName,
        courseName,
        courseName,
        courseName,
        studentCode,
        `%${studentCode.toUpperCase()}%`,
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

  async listReassignmentOptions(params: {
    studentId: string;
    fromSectionCourseId: string;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const fromMembership = await this.loadStudentMembershipBySectionCourseOrThrow({
      studentId: params.studentId,
      sectionCourseId: params.fromSectionCourseId,
      periodId: activePeriodId,
    });

    const rows: Array<{
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
      currentStudents: number;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      classroomPavilionCode: string | null;
      classroomPavilionName: string | null;
      classroomLevelName: string | null;
      capacitySource: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA';
    }> = await this.sectionsRepo.manager.query(
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
        COALESCE(sc.initialCapacity, s.initialCapacity) AS initialCapacity,
        COALESCE(sc.maxExtraCapacity, s.maxExtraCapacity) AS maxExtraCapacity,
        sc.classroomId AS classroomId,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        cl.capacity AS classroomCapacity,
        p.code AS classroomPavilionCode,
        p.name AS classroomPavilionName,
        cl.levelName AS classroomLevelName,
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 'VIRTUAL'
          WHEN sc.classroomId IS NULL THEN 'SIN_AULA'
          WHEN cl.id IS NULL THEN 'AULA_INACTIVA'
          ELSE 'AULA'
        END AS capacitySource,
        COUNT(DISTINCT ssc.studentId) AS currentStudents
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      LEFT JOIN classrooms cl
        ON cl.id = sc.classroomId
       AND cl.status = 'ACTIVA'
      LEFT JOIN pavilions p
        ON p.id = cl.pavilionId
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND sc.courseId = ?
        AND sc.id <> ?
        AND sc.sectionId <> ?
        AND COALESCE(s.facultyGroup, '') = COALESCE(?, '')
        AND COALESCE(s.campusName, '') = COALESCE(?, '')
        AND (
          UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%'
          OR (sc.classroomId IS NOT NULL AND cl.id IS NOT NULL)
        )
      GROUP BY
        sc.id,
        sc.sectionId,
        s.code,
        s.name,
        sc.courseId,
        c.name,
        s.facultyGroup,
        s.campusName,
        s.modality,
        sc.initialCapacity,
        sc.maxExtraCapacity,
        s.initialCapacity,
        s.maxExtraCapacity,
        sc.classroomId,
        cl.id,
        cl.code,
        cl.name,
        cl.capacity,
        p.code,
        p.name,
        cl.levelName
      ORDER BY s.code ASC, s.name ASC
      `,
      [
        activePeriodId,
        fromMembership.courseId,
        fromMembership.sectionCourseId,
        fromMembership.sectionId,
        fromMembership.facultyGroup,
        fromMembership.campusName,
      ]
    );

    const candidateIds = rows.map((row) => String(row.sectionCourseId)).filter(Boolean);
    const conflictingCandidateIds = await this.findConflictingCandidateIds({
      studentId: params.studentId,
      excludeSectionCourseId: fromMembership.sectionCourseId,
      candidateSectionCourseIds: candidateIds,
      periodId: activePeriodId,
    });

    return rows.map((row) => {
      const currentStudents = Number(row.currentStudents ?? 0);
      const projectedStudents = currentStudents + 1;
      const initialCapacity = Number(row.initialCapacity ?? 45);
      const maxExtraCapacity = Number(row.maxExtraCapacity ?? 0);
      const classroomCapacity =
        row.classroomCapacity !== null && row.classroomCapacity !== undefined
          ? Number(row.classroomCapacity)
          : null;
      const overCapacity = this.isOverPhysicalCapacity({
        modality: row.modality ? String(row.modality) : null,
        classroomCapacity,
        initialCapacity,
        maxExtraCapacity,
        projectedStudents,
      });
      return {
        sectionCourseId: String(row.sectionCourseId),
        sectionId: String(row.sectionId),
        sectionCode: row.sectionCode ? String(row.sectionCode) : null,
        sectionName: String(row.sectionName ?? ''),
        courseId: String(row.courseId ?? ''),
        courseName: String(row.courseName ?? ''),
        facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
        campusName: row.campusName ? String(row.campusName) : null,
        modality: row.modality ? String(row.modality) : null,
        currentStudents,
        projectedStudents,
        initialCapacity,
        maxExtraCapacity,
        classroomId: row.classroomId ? String(row.classroomId) : null,
        classroomCode: row.classroomCode ? String(row.classroomCode) : null,
        classroomName: row.classroomName ? String(row.classroomName) : null,
        classroomCapacity,
        classroomPavilionCode: row.classroomPavilionCode
          ? String(row.classroomPavilionCode)
          : null,
        classroomPavilionName: row.classroomPavilionName
          ? String(row.classroomPavilionName)
          : null,
        classroomLevelName: row.classroomLevelName
          ? String(row.classroomLevelName)
          : null,
        capacitySource: String(row.capacitySource ?? '').trim() || null,
        createsConflict: conflictingCandidateIds.has(String(row.sectionCourseId)),
        overCapacity,
      };
    });
  }

  async reassignStudentSectionCourse(params: {
    studentId: string;
    fromSectionCourseId: string;
    toSectionCourseId: string;
    confirmOverCapacity?: boolean;
    reason?: string | null;
    changedBy?: string | null;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const fromMembership = await this.loadStudentMembershipBySectionCourseOrThrow({
      studentId: params.studentId,
      sectionCourseId: params.fromSectionCourseId,
      periodId: activePeriodId,
    });
    const toSectionCourse = await this.getSectionCourseContextOrThrow({
      sectionCourseId: params.toSectionCourseId,
      periodId: activePeriodId,
    });

    if (fromMembership.sectionCourseId === toSectionCourse.sectionCourseId) {
      throw new BadRequestException('La seccion-curso origen y destino son la misma');
    }
    if (fromMembership.courseId !== toSectionCourse.courseId) {
      throw new BadRequestException('La seccion-curso destino debe ser del mismo curso');
    }
    if (this.scopeKey(fromMembership.facultyGroup) !== this.scopeKey(toSectionCourse.facultyGroup)) {
      throw new BadRequestException(
        'La seccion-curso destino debe estar en la misma facultad'
      );
    }
    if (this.scopeKey(fromMembership.campusName) !== this.scopeKey(toSectionCourse.campusName)) {
      throw new BadRequestException(
        'La seccion-curso destino debe estar en la misma sede'
      );
    }

    const targetMembershipRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_student_courses
      WHERE studentId = ?
        AND sectionCourseId = ?
      `,
      [params.studentId, toSectionCourse.sectionCourseId]
    );
    if (Number(targetMembershipRows[0]?.c ?? 0) > 0) {
      throw new BadRequestException('El alumno ya esta asignado a la seccion-curso destino');
    }

    const createsConflict = await this.candidateCreatesConflict({
      studentId: params.studentId,
      candidateSectionCourseId: toSectionCourse.sectionCourseId,
      excludeSectionCourseId: fromMembership.sectionCourseId,
      periodId: activePeriodId,
    });
    if (createsConflict) {
      throw new ConflictException(
        'La seccion-curso destino genera cruce de horario para este alumno'
      );
    }

    const targetCurrentRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(DISTINCT studentId) AS c
      FROM section_student_courses
      WHERE sectionCourseId = ?
      `,
      [toSectionCourse.sectionCourseId]
    );
    const currentStudents = Number(targetCurrentRows[0]?.c ?? 0);
    const projectedStudents = currentStudents + 1;
    const overCapacity = this.isOverPhysicalCapacity({
      modality: toSectionCourse.modality,
      classroomCapacity: toSectionCourse.classroomCapacity,
      initialCapacity: toSectionCourse.initialCapacity,
      maxExtraCapacity: toSectionCourse.maxExtraCapacity,
      projectedStudents,
    });
    if (this.isPresentialWithoutClassroom(toSectionCourse)) {
      throw new ConflictException(
        'La seccion-curso destino no tiene aula asignada para modalidad presencial'
      );
    }

    if (overCapacity && !params.confirmOverCapacity) {
      throw new ConflictException(
        'La seccion-curso destino excede su capacidad fisica. Confirma para continuar con sobreaforo.'
      );
    }

    await this.sectionsRepo.manager.transaction(async (manager) => {
      const result: any = await manager.query(
        `
        UPDATE section_student_courses
        SET
          sectionCourseId = ?,
          sectionId = ?,
          courseId = ?,
          updatedAt = NOW(6)
        WHERE studentId = ?
          AND sectionCourseId = ?
        LIMIT 1
        `,
        [
          toSectionCourse.sectionCourseId,
          toSectionCourse.sectionId,
          toSectionCourse.courseId,
          params.studentId,
          fromMembership.sectionCourseId,
        ]
      );
      const affectedRows = Number(result?.affectedRows ?? result?.affected ?? 0);
      if (affectedRows <= 0) {
        throw new NotFoundException('Student membership to origin section-course was not found');
      }

      await manager.query(
        `
        INSERT INTO section_course_reassignments (
          id,
          studentId,
          fromSectionCourseId,
          toSectionCourseId,
          reason,
          changedBy,
          changedAt,
          createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
        `,
        [
          this.uuid(),
          params.studentId,
          fromMembership.sectionCourseId,
          toSectionCourse.sectionCourseId,
          String(params.reason ?? '').trim() || null,
          String(params.changedBy ?? '').trim() || null,
        ]
      );
    });

    return {
      ok: true,
      studentId: params.studentId,
      fromSectionCourseId: fromMembership.sectionCourseId,
      toSectionCourseId: toSectionCourse.sectionCourseId,
      overCapacity,
      projectedStudents,
    };
  }

  async listFacultyFilters() {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{ facultyGroup: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT s.facultyGroup AS facultyGroup
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      WHERE sc.periodId = ?
        AND s.facultyGroup IS NOT NULL
        AND s.facultyGroup <> ''
      ORDER BY s.facultyGroup ASC
      `,
      [activePeriodId]
    );
    return rows
      .map((x) => String(x.facultyGroup || '').trim())
      .filter(Boolean);
  }

  async listCampusFilters(facultyGroup: string) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const fg = facultyGroup.trim();
    const rows: Array<{ campusName: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT s.campusName AS campusName
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      WHERE sc.periodId = ?
        AND s.facultyGroup = ?
        AND s.campusName IS NOT NULL
        AND s.campusName <> ''
      `,
      [activePeriodId, fg]
    );

    const virtualRows: Array<{ hasVirtual: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT 1 AS hasVirtual
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      WHERE sc.periodId = ?
        AND s.facultyGroup = ?
        AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%'
      LIMIT 1
      `,
      [activePeriodId, fg]
    );

    const campuses = rows
      .map((x) => String(x.campusName || '').trim())
      .filter(Boolean);
    if (virtualRows.length > 0) {
      campuses.push('VIRTUAL');
    }

    return Array.from(new Set(campuses)).sort((a, b) => {
      const cmp = this.campusSort(a) - this.campusSort(b);
      return cmp !== 0 ? cmp : a.localeCompare(b);
    });
  }

  async listCourseFilters(params: { facultyGroup: string; campusName: string }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const fg = params.facultyGroup.trim();
    const campus = params.campusName.trim();
    const isVirtualCampus = this.isVirtualCampusFilter(campus);
    const rows: Array<{ courseName: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT c.name AS courseName
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE sc.periodId = ?
        AND s.facultyGroup = ?
        AND (
          (? = 1 AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%')
          OR (
            ? = 0
            AND s.campusName = ?
            AND UPPER(COALESCE(s.modality, '')) NOT LIKE '%VIRTUAL%'
          )
        )
      ORDER BY c.name ASC
      `,
      [activePeriodId, fg, isVirtualCampus ? 1 : 0, isVirtualCampus ? 1 : 0, campus]
    );
    return rows
      .map((row) => String(row.courseName || '').trim())
      .filter(Boolean);
  }

  async listCoursesBySection(sectionId: string) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    await this.getByIdOrThrow(sectionId);
    const rows: Array<{ name: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT c.name AS name
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE sc.sectionId = ?
        AND sc.periodId = ?
      `,
      [sectionId, activePeriodId]
    );
    return rows
      .map((row) => String(row.name || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  async create(body: {
    name: string;
    code?: string | null;
    akademicSectionId?: string | null;
    facultyGroup?: string | null;
    facultyName?: string | null;
    campusName?: string | null;
    modality?: string | null;
    initialCapacity?: number | null;
    maxExtraCapacity?: number | null;
    isAutoLeveling?: boolean | null;
    teacherId?: string | null;
  }): Promise<SectionEntity> {
    let teacher: UserEntity | null = null;
    if (body.teacherId) {
      teacher =
        (await this.usersRepo.findOne({
          where: { id: body.teacherId, role: Role.DOCENTE },
        })) ?? null;
      if (!teacher) throw new NotFoundException('Docente no encontrado');
    }

    const section = this.sectionsRepo.create({
      name: body.name,
      code: body.code ?? null,
      akademicSectionId: body.akademicSectionId ?? null,
      facultyGroup: body.facultyGroup ?? null,
      facultyName: body.facultyName ?? null,
      campusName: body.campusName ?? null,
      modality: body.modality ?? null,
      initialCapacity: body.initialCapacity ?? 45,
      maxExtraCapacity: body.maxExtraCapacity ?? 0,
      isAutoLeveling: body.isAutoLeveling ?? false,
      teacher,
    });
    return this.sectionsRepo.save(section);
  }

  async updateCapacity(params: {
    id: string;
    initialCapacity: number;
    maxExtraCapacity: number;
  }): Promise<SectionEntity> {
    const section = await this.getByIdOrThrow(params.id);
    section.initialCapacity = params.initialCapacity;
    section.maxExtraCapacity = params.maxExtraCapacity;
    return this.sectionsRepo.save(section);
  }

  async updateSectionCourseCapacity(params: {
    sectionCourseId: string;
    initialCapacity: number;
    maxExtraCapacity: number;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const context = await this.getSectionCourseContextOrThrow({
      sectionCourseId: params.sectionCourseId,
      periodId: activePeriodId,
    });
    const initialCapacity = Math.max(0, Number(params.initialCapacity ?? 0));
    const maxExtraCapacity = Math.max(0, Number(params.maxExtraCapacity ?? 0));
    await this.sectionsRepo.manager.query(
      `
      UPDATE section_courses
      SET
        initialCapacity = ?,
        maxExtraCapacity = ?,
        updatedAt = NOW(6)
      WHERE id = ?
      LIMIT 1
      `,
      [initialCapacity, maxExtraCapacity, context.sectionCourseId]
    );

    const rows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_student_courses
      WHERE sectionCourseId = ?
      `,
      [context.sectionCourseId]
    );
    const assignedStudents = Number(rows[0]?.c ?? 0);

    return {
      sectionCourseId: context.sectionCourseId,
      sectionId: context.sectionId,
      courseId: context.courseId,
      courseName: context.courseName,
      initialCapacity,
      maxExtraCapacity,
      assignedStudents,
      isOverbooked: this.isOverCapacity({
        initialCapacity,
        maxExtraCapacity,
        projectedStudents: assignedStudents,
      }),
    };
  }

  async getByIdOrThrow(id: string): Promise<SectionEntity> {
    const section = await this.sectionsRepo.findOne({
      where: { id },
      relations: { teacher: true },
    });
    if (!section) throw new NotFoundException('Seccion no encontrada');
    return section;
  }

  async assignTeacher(params: { id: string; teacherId?: string | null }) {
    const section = await this.getByIdOrThrow(params.id);
    if (!params.teacherId) {
      section.teacher = null;
      return this.sectionsRepo.save(section);
    }

    const teacher = await this.usersRepo.findOne({
      where: { id: params.teacherId, role: Role.DOCENTE },
    });
    if (!teacher) throw new NotFoundException('Docente no encontrado');

    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{ sectionCourseId: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT id AS sectionCourseId
      FROM section_courses
      WHERE sectionId = ?
        AND periodId = ?
      `,
      [section.id, activePeriodId]
    );
    for (const row of rows) {
      const sectionCourseId = String(row.sectionCourseId ?? '').trim();
      if (!sectionCourseId) continue;
      await this.assertTeacherCourseAssignmentHasNoScheduleConflict({
        teacherId: teacher.id,
        sectionCourseId,
      });
    }

    section.teacher = teacher;
    return this.sectionsRepo.save(section);
  }

  async assignTeacherByCourse(params: {
    sectionId: string;
    courseName: string;
    teacherId?: string | null;
  }) {
    const section = await this.getByIdOrThrow(params.sectionId);
    const course = await this.resolveCourseByName(params.courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${params.courseName}`);
    }
    const sectionCourse = await this.resolveSectionCourseOrThrow(section.id, course.id);

    const existing = await this.sectionCourseTeachersRepo.findOne({
      where: { sectionCourseId: sectionCourse.id },
      relations: { section: true, teacher: true },
    });

    if (!params.teacherId) {
      if (existing) {
        await this.sectionCourseTeachersRepo.remove(existing);
      }
      return {
        sectionId: section.id,
        courseName: course.name,
        sectionCourseId: sectionCourse.id,
        teacherId: null as string | null,
        teacherDni: null as string | null,
        teacherName: null as string | null,
      };
    }

    const teacher = await this.usersRepo.findOne({
      where: { id: params.teacherId, role: Role.DOCENTE },
    });
    if (!teacher) throw new NotFoundException('Docente no encontrado');

    await this.assertTeacherCourseAssignmentHasNoScheduleConflict({
      teacherId: teacher.id,
      sectionCourseId: sectionCourse.id,
    });

    const row =
      existing ??
      this.sectionCourseTeachersRepo.create({
        section,
        sectionCourseId: sectionCourse.id,
        courseId: course.id,
        teacher: null,
      } as SectionCourseTeacherEntity);
    row.teacher = teacher;
    const saved = await this.sectionCourseTeachersRepo.save(row);

    return {
      sectionId: section.id,
      courseName: course.name,
      sectionCourseId: sectionCourse.id,
      teacherId: saved.teacher?.id ?? null,
      teacherDni: saved.teacher?.dni ?? null,
      teacherName: saved.teacher?.fullName ?? null,
    };
  }

  async bulkApplyCourseTeacherFromMother(params: {
    facultyGroup: string;
    campusName: string;
    courseName: string;
    modality?: string | null;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const scope = await this.resolveMotherAndSiblings({
      periodId: activePeriodId,
      facultyGroup: params.facultyGroup,
      campusName: params.campusName,
      courseName: params.courseName,
      modality: params.modality ?? null,
    });
    const mother = scope.mother;
    const siblings = scope.siblings;

    const teacherId =
      await this.getEffectiveTeacherIdBySectionCourse(mother.sectionCourseId);
    if (!teacherId) {
      throw new BadRequestException(
        'La seccion madre no tiene docente asignado para este curso.'
      );
    }

    const teacher = await this.usersRepo.findOne({
      where: { id: teacherId, role: Role.DOCENTE },
    });
    if (!teacher) {
      throw new BadRequestException(
        'El docente de la seccion madre no es valido para asignacion.'
      );
    }

    const scopedIds = scope.scoped.map((item) => item.sectionCourseId);
    const skipped: Array<{ sectionCourseId: string; reason: string }> = [];
    const toUpdate = siblings.filter((item) => {
      if (String(item.teacherId ?? '').trim() === teacher.id) {
        skipped.push({
          sectionCourseId: item.sectionCourseId,
          reason: 'Ya tenia el mismo docente',
        });
        return false;
      }
      return true;
    });

    for (const item of toUpdate) {
      await this.assertTeacherCourseAssignmentHasNoScheduleConflict({
        teacherId: teacher.id,
        sectionCourseId: item.sectionCourseId,
        ignoredSectionCourseIds: scopedIds,
      });
    }

    await this.sectionsRepo.manager.transaction(async (manager) => {
      for (const item of toUpdate) {
        const existingRows: Array<{ id: string }> = await manager.query(
          `
          SELECT id
          FROM section_course_teachers
          WHERE sectionCourseId = ?
          LIMIT 1
          `,
          [item.sectionCourseId]
        );
        const existingId = String(existingRows[0]?.id ?? '').trim();
        if (existingId) {
          await manager.query(
            `
            UPDATE section_course_teachers
            SET teacherId = ?, updatedAt = NOW(6)
            WHERE id = ?
            LIMIT 1
            `,
            [teacher.id, existingId]
          );
          continue;
        }
        await manager.query(
          `
          INSERT INTO section_course_teachers (
            id,
            sectionId,
            sectionCourseId,
            courseId,
            teacherId,
            createdAt,
            updatedAt
          )
          VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))
          `,
          [
            this.uuid(),
            item.sectionId,
            item.sectionCourseId,
            item.courseId,
            teacher.id,
          ]
        );
      }
    });

    return {
      motherSectionCourseId: mother.sectionCourseId,
      updatedCount: toUpdate.length,
      skipped,
    };
  }

  async bulkApplyCourseScheduleFromMother(params: {
    facultyGroup: string;
    campusName: string;
    courseName: string;
    modality?: string | null;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const scope = await this.resolveMotherAndSiblings({
      periodId: activePeriodId,
      facultyGroup: params.facultyGroup,
      campusName: params.campusName,
      courseName: params.courseName,
      modality: params.modality ?? null,
    });
    const mother = scope.mother;
    const siblings = scope.siblings;
    const scopedIds = scope.scoped.map((item) => item.sectionCourseId);

    const motherBlocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomUrl: string | null;
      location: string | null;
      referenceModality: string | null;
      referenceClassroom: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        zoomUrl,
        location,
        referenceModality,
        referenceClassroom
      FROM schedule_blocks
      WHERE sectionCourseId = ?
      ORDER BY dayOfWeek ASC, startTime ASC
      `,
      [mother.sectionCourseId]
    );
    if (motherBlocks.length <= 0) {
      throw new BadRequestException(
        'La seccion madre no tiene bloques de horario para clonar.'
      );
    }

    const skipped: Array<{ sectionCourseId: string; reason: string }> = [];
    const toUpdate: typeof siblings = [];

    for (const item of siblings) {
      let blocked = false;
      const teacherId =
        String(item.teacherId ?? '').trim() ||
        (await this.getEffectiveTeacherIdBySectionCourse(item.sectionCourseId)) ||
        null;

      for (const block of motherBlocks) {
        if (teacherId) {
          try {
            await this.assertTeacherScheduleAvailabilityForBlock({
              teacherId,
              sectionCourseId: item.sectionCourseId,
              dayOfWeek: Number(block.dayOfWeek ?? 0),
              startTime: String(block.startTime ?? ''),
              endTime: String(block.endTime ?? ''),
              startDate: this.toIsoDateOnly(block.startDate),
              endDate: this.toIsoDateOnly(block.endDate),
              ignoredSectionCourseIds: scopedIds,
            });
          } catch (error: any) {
            skipped.push({
              sectionCourseId: item.sectionCourseId,
              reason:
                error?.message ??
                'Conflicto de docente fuera del conjunto masivo',
            });
            blocked = true;
            break;
          }
        }

        try {
          await this.assertClassroomScheduleAvailabilityForBlock({
            sectionCourseId: item.sectionCourseId,
            dayOfWeek: Number(block.dayOfWeek ?? 0),
            startTime: String(block.startTime ?? ''),
            endTime: String(block.endTime ?? ''),
            startDate: this.toIsoDateOnly(block.startDate),
            endDate: this.toIsoDateOnly(block.endDate),
            ignoredSectionCourseIds: scopedIds,
          });
        } catch (error: any) {
          skipped.push({
            sectionCourseId: item.sectionCourseId,
            reason:
              error?.message ?? 'Conflicto de aula fuera del conjunto masivo',
          });
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        toUpdate.push(item);
      }
    }

    let removedBlocks = 0;
    let createdBlocks = 0;
    await this.sectionsRepo.manager.transaction(async (manager) => {
      for (const item of toUpdate) {
        const countRows: Array<{ c: number }> = await manager.query(
          `
          SELECT COUNT(*) AS c
          FROM schedule_blocks
          WHERE sectionCourseId = ?
          `,
          [item.sectionCourseId]
        );
        removedBlocks += Number(countRows[0]?.c ?? 0);

        await manager.query(
          `
          DELETE FROM schedule_blocks
          WHERE sectionCourseId = ?
          `,
          [item.sectionCourseId]
        );

        for (const block of motherBlocks) {
          await manager.query(
            `
            INSERT INTO schedule_blocks (
              id,
              sectionId,
              sectionCourseId,
              courseName,
              dayOfWeek,
              startTime,
              endTime,
              startDate,
              endDate,
              zoomUrl,
              location,
              referenceModality,
              referenceClassroom,
              createdAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
            `,
            [
              this.uuid(),
              item.sectionId,
              item.sectionCourseId,
              item.courseName,
              Number(block.dayOfWeek ?? 0),
              String(block.startTime ?? ''),
              String(block.endTime ?? ''),
              this.toIsoDateOnly(block.startDate),
              this.toIsoDateOnly(block.endDate),
              block.zoomUrl ?? null,
              block.location ?? null,
              block.referenceModality ?? null,
              block.referenceClassroom ?? null,
            ]
          );
          createdBlocks += 1;
        }
      }
    });

    return {
      motherSectionCourseId: mother.sectionCourseId,
      updatedSections: toUpdate.length,
      removedBlocks,
      createdBlocks,
      skipped,
    };
  }

  async assignClassroomByCourse(params: {
    sectionId: string;
    courseName: string;
    classroomId?: string | null;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const section = await this.getByIdOrThrow(params.sectionId);
    const course = await this.resolveCourseByName(params.courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${params.courseName}`);
    }
    const sectionCourse = await this.resolveSectionCourseOrThrow(section.id, course.id);
    const scContext = await this.getSectionCourseContextOrThrow({
      sectionCourseId: sectionCourse.id,
      periodId: activePeriodId,
    });

    if (this.isVirtualModality(scContext.modality)) {
      if (params.classroomId) {
        throw new BadRequestException(
          'Las secciones-curso virtuales no requieren aula'
        );
      }
      await this.sectionsRepo.manager.query(
        `
        UPDATE section_courses
        SET classroomId = NULL, updatedAt = NOW(6)
        WHERE id = ?
        LIMIT 1
        `,
        [sectionCourse.id]
      );
      return {
        sectionId: section.id,
        sectionCourseId: sectionCourse.id,
        courseName: course.name,
        classroomId: null,
        classroomCode: null,
        classroomName: null,
        classroomCapacity: null,
        classroomPavilionCode: null,
        classroomPavilionName: null,
        classroomLevelName: null,
        capacitySource: 'VIRTUAL',
      };
    }

    const classroomId = String(params.classroomId ?? '').trim() || null;
    if (!classroomId) {
      await this.sectionsRepo.manager.query(
        `
        UPDATE section_courses
        SET classroomId = NULL, updatedAt = NOW(6)
        WHERE id = ?
        LIMIT 1
        `,
        [sectionCourse.id]
      );
      return {
        sectionId: section.id,
        sectionCourseId: sectionCourse.id,
        courseName: course.name,
        classroomId: null,
        classroomCode: null,
        classroomName: null,
        classroomCapacity: null,
        classroomPavilionCode: null,
        classroomPavilionName: null,
        classroomLevelName: null,
        capacitySource: 'SIN_AULA',
      };
    }

    const classroom = await this.classroomsRepo.findOne({ where: { id: classroomId } });
    if (!classroom) {
      throw new NotFoundException('Aula no encontrada');
    }
    if (classroom.status !== 'ACTIVA') {
      throw new BadRequestException('Solo puedes asignar aulas activas');
    }
    if (!String(classroom.pavilionId ?? '').trim() || !String(classroom.levelName ?? '').trim()) {
      throw new BadRequestException(
        'Esta aula no esta completa (falta pabellon o nivel). Completa sus datos en Aulas.'
      );
    }
    if (this.scopeKey(classroom.campusName) !== this.scopeKey(scContext.campusName)) {
      throw new BadRequestException(
        'El aula seleccionada debe pertenecer a la misma sede de la seccion-curso'
      );
    }

    const assignedRows: Array<{ c: number }> = await this.sectionsRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_student_courses
      WHERE sectionCourseId = ?
      `,
      [sectionCourse.id]
    );
    const assigned = Number(assignedRows[0]?.c ?? 0);
    if (assigned > classroom.capacity) {
      throw new ConflictException(
        `No puedes asignar el aula ${classroom.code}. Matriculados actuales (${assigned}) superan su aforo (${classroom.capacity}).`
      );
    }

    await this.assertSectionCourseClassroomAvailability({
      periodId: activePeriodId,
      sectionCourseId: sectionCourse.id,
      classroomId: classroom.id,
    });

    await this.sectionsRepo.manager.query(
      `
      UPDATE section_courses
      SET classroomId = ?, updatedAt = NOW(6)
      WHERE id = ?
      LIMIT 1
      `,
      [classroom.id, sectionCourse.id]
    );

    const pavilionRows: Array<{ code: string | null; name: string | null }> =
      await this.sectionsRepo.manager.query(
        `
      SELECT code, name
      FROM pavilions
      WHERE id = ?
      LIMIT 1
      `,
        [classroom.pavilionId]
      );
    const pavilion = pavilionRows[0];

    return {
      sectionId: section.id,
      sectionCourseId: sectionCourse.id,
      courseName: course.name,
      classroomId: classroom.id,
      classroomCode: classroom.code,
      classroomName: classroom.name,
      classroomCapacity: Number(classroom.capacity ?? 0),
      classroomPavilionCode: pavilion?.code ? String(pavilion.code) : null,
      classroomPavilionName: pavilion?.name ? String(pavilion.name) : null,
      classroomLevelName: String(classroom.levelName ?? '').trim() || null,
      capacitySource: 'AULA',
    };
  }

  async listStudents(sectionId: string, courseName?: string) {
    await this.getByIdOrThrow(sectionId);
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const normalizedCourse = String(courseName || '').trim();
    if (!normalizedCourse) {
      const rows: Array<{
        id: string;
        dni: string;
        codigoAlumno: string | null;
        fullName: string;
        careerName: string | null;
      }> = await this.sectionsRepo.manager.query(
        `
        SELECT
          DISTINCT u.id AS id,
          u.dni AS dni,
          u.codigoAlumno AS codigoAlumno,
          u.fullName AS fullName,
          u.careerName AS careerName
        FROM section_student_courses ssc
        INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
        INNER JOIN users u ON u.id = ssc.studentId
        WHERE sc.sectionId = ?
          AND sc.periodId = ?
        ORDER BY u.fullName ASC, u.dni ASC
        `,
        [sectionId, activePeriodId]
      );
      return rows;
    }

    const course = await this.resolveCourseByName(normalizedCourse);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${normalizedCourse}`);
    }

    const rows: Array<{
      id: string;
      dni: string;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string | null;
      sectionCourseId: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        u.id AS id,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        u.careerName AS careerName,
        sc.id AS sectionCourseId
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE sc.sectionId = ?
        AND sc.courseId = ?
        AND sc.periodId = ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [sectionId, course.id, activePeriodId]
    );

    return rows.map((row) => ({
      ...row,
      courseName: course.name,
      sectionCourseId: String(row.sectionCourseId),
    }));
  }

  async buildSectionCourseStudentsExportWorkbook(sectionId: string, courseName: string) {
    const context = await this.loadSectionCourseStudentsExportContext({
      sectionId,
      courseName,
    });

    const rows: Array<Array<string>> = [
      ['LISTADO DE ALUMNOS POR SECCION-CURSO'],
      [],
      ['Facultad:', context.facultyName || context.facultyGroup || '-'],
      ['Sede:', context.campusName || '-'],
      ['Seccion:', context.sectionCode || context.sectionName || '-'],
      ['Curso:', context.courseName || '-'],
      [
        'Docente:',
        context.teacherName
          ? `${context.teacherName}${context.teacherDni ? ` (${context.teacherDni})` : ''}`
          : 'Sin docente',
      ],
      ['Horario:', context.scheduleSummary || 'Sin horario'],
      [],
      ['Codigo estudiante', 'Apellidos', 'Nombres', 'Carrera'],
    ];

    for (const student of context.students) {
      rows.push([
        student.codigoAlumno || '',
        student.apellidos || '',
        student.nombres || '',
        student.careerName || 'SIN CARRERA',
      ]);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    // Ajustar los anchos de columna para que el Excel se vea más profesional
    worksheet['!cols'] = [
      { wch: 20 }, // Codigo, o labels de header (Facultad, etc)
      { wch: 35 }, // Apellidos, o valores
      { wch: 35 }, // Nombres
      { wch: 55 }, // Carrera
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Alumnos');

    return {
      fileBuffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      fileName: this.buildSectionCourseStudentsExportFileName({
        sectionCode: context.sectionCode,
        sectionName: context.sectionName,
        courseName: context.courseName,
        periodCode: context.periodCode,
        extension: 'xlsx',
      }),
    };
  }

  async buildSectionCourseStudentsExportPdf(sectionId: string, courseName: string) {
    const context = await this.loadSectionCourseStudentsExportContext({
      sectionId,
      courseName,
    });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    const toBuffer = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      );
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.font('Helvetica-Bold').fontSize(14).text('Listado de alumnos por seccion-curso', { align: 'center' });
    doc.moveDown(1.5);

    const headers = [
      { label: 'Facultad: ', value: context.facultyName || context.facultyGroup || '-' },
      { label: 'Sede: ', value: context.campusName || '-' },
      { label: 'Seccion: ', value: context.sectionCode || context.sectionName || '-' },
      { label: 'Curso: ', value: context.courseName || '-' },
      {
        label: 'Docente: ',
        value: context.teacherName
          ? `${context.teacherName}${context.teacherDni ? ` (${context.teacherDni})` : ''}`
          : 'Sin docente'
      },
      { label: 'Horario: ', value: context.scheduleSummary || 'Sin horario' },
    ];

    doc.fontSize(10);
    for (const h of headers) {
      doc.font('Helvetica-Bold').text(h.label, { continued: true });
      doc.font('Helvetica').text(h.value);
    }
    doc.moveDown(1.2);

    const colX = { code: 40, last: 110, names: 245, career: 375 };
    const colW = { code: 70, last: 130, names: 120, career: 180 };
    const rowMinHeight = 14;
    const maxY = doc.page.height - 45;

    const drawTableHeader = (y: number) => {
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Codigo', colX.code, y, { width: colW.code, lineBreak: false });
      doc.text('Apellidos', colX.last, y, { width: colW.last, lineBreak: false });
      doc.text('Nombres', colX.names, y, { width: colW.names, lineBreak: false });
      doc.text('Carrera', colX.career, y, { width: colW.career, lineBreak: false });
      doc.moveTo(40, y + 12).lineTo(555, y + 12).strokeColor('#cbd5e1').stroke();
      return y + rowMinHeight;
    };

    let y = drawTableHeader(doc.y);
    doc.font('Helvetica').fontSize(8);
    for (const student of context.students) {
      const codeText = student.codigoAlumno || '';
      const lastNameText = student.apellidos || '';
      const namesText = student.nombres || '';
      const careerText = student.careerName || 'SIN CARRERA';

      const rowHeight = Math.max(
        rowMinHeight,
        doc.heightOfString(codeText, { width: colW.code }),
        doc.heightOfString(lastNameText, { width: colW.last }),
        doc.heightOfString(namesText, { width: colW.names }),
        doc.heightOfString(careerText, { width: colW.career })
      ) + 3;

      if (y + rowHeight > maxY) {
        doc.addPage();
        y = drawTableHeader(40);
        doc.font('Helvetica').fontSize(8);
      }

      doc.text(codeText, colX.code, y, {
        width: colW.code,
        lineBreak: true,
      });
      doc.text(lastNameText, colX.last, y, {
        width: colW.last,
        lineBreak: true,
      });
      doc.text(namesText, colX.names, y, {
        width: colW.names,
        lineBreak: true,
      });
      doc.text(careerText, colX.career, y, {
        width: colW.career,
        lineBreak: true,
      });
      y += rowHeight;
    }

    doc.end();
    const fileBuffer = await toBuffer;
    return {
      fileBuffer,
      fileName: this.buildSectionCourseStudentsExportFileName({
        sectionCode: context.sectionCode,
        sectionName: context.sectionName,
        courseName: context.courseName,
        periodCode: context.periodCode,
        extension: 'pdf',
      }),
    };
  }

  async resolveSectionCourseByName(params: {
    sectionId: string;
    courseName: string;
  }) {
    const course = await this.resolveCourseByName(params.courseName);
    if (!course) return null;
    const sectionCourse = await this.resolveSectionCourse(params.sectionId, course.id);
    if (!sectionCourse) return null;
    return {
      ...sectionCourse,
      courseName: course.name,
    };
  }

  async getSectionCourseById(sectionCourseId: string) {
    const rows: Array<{
      id: string;
      sectionId: string;
      courseId: string;
      courseName: string;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      classroomPavilionCode: string | null;
      classroomPavilionName: string | null;
      classroomLevelName: string | null;
      capacitySource: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA';
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS id,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName,
        s.modality AS modality,
        COALESCE(sc.initialCapacity, s.initialCapacity) AS initialCapacity,
        COALESCE(sc.maxExtraCapacity, s.maxExtraCapacity) AS maxExtraCapacity,
        sc.classroomId AS classroomId,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        cl.capacity AS classroomCapacity,
        p.code AS classroomPavilionCode,
        p.name AS classroomPavilionName,
        cl.levelName AS classroomLevelName,
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 'VIRTUAL'
          WHEN sc.classroomId IS NULL THEN 'SIN_AULA'
          WHEN cl.id IS NULL THEN 'AULA_INACTIVA'
          ELSE 'AULA'
        END AS capacitySource
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      LEFT JOIN classrooms cl
        ON cl.id = sc.classroomId
       AND cl.status = 'ACTIVA'
      LEFT JOIN pavilions p
        ON p.id = cl.pavilionId
      WHERE sc.id = ?
      LIMIT 1
      `,
      [sectionCourseId]
    );
    const row = rows[0];
    if (!row?.id) return null;
    return {
      id: String(row.id),
      sectionId: String(row.sectionId),
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
      modality: row.modality ? String(row.modality) : null,
      initialCapacity: Number(row.initialCapacity ?? 45),
      maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
      classroomId: row.classroomId ? String(row.classroomId) : null,
      classroomCode: row.classroomCode ? String(row.classroomCode) : null,
      classroomName: row.classroomName ? String(row.classroomName) : null,
      classroomCapacity:
        row.classroomCapacity !== null && row.classroomCapacity !== undefined
          ? Number(row.classroomCapacity)
          : null,
      classroomPavilionCode: row.classroomPavilionCode
        ? String(row.classroomPavilionCode)
        : null,
      classroomPavilionName: row.classroomPavilionName
        ? String(row.classroomPavilionName)
        : null,
      classroomLevelName: row.classroomLevelName
        ? String(row.classroomLevelName)
        : null,
      capacitySource: String(row.capacitySource ?? '').trim() || null,
    };
  }

  async getCourseCapacityBySectionAndCourseName(sectionId: string, courseName: string) {
    const course = await this.resolveCourseByName(courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${courseName}`);
    }
    const sectionCourse = await this.resolveSectionCourseOrThrow(sectionId, course.id);
    const row = await this.getSectionCourseById(sectionCourse.id);
    if (!row) {
      throw new NotFoundException('course capacity record not found');
    }
    const isVirtual = this.isVirtualModality(row.modality);
    const classroomLabel = isVirtual
      ? 'Sin aula'
      : String(row.classroomCode ?? '').trim() ||
        String(row.classroomName ?? '').trim() ||
        'Sin aula';
    return {
      initialCapacity: row.initialCapacity,
      maxExtraCapacity: row.maxExtraCapacity,
      modality: row.modality,
      classroomCode: row.classroomCode,
      classroomName: row.classroomName,
      referenceModality: isVirtual ? 'VIRTUAL' : 'PRESENCIAL',
      referenceClassroom: classroomLabel,
    };
  }

  async updateCourseCapacityBySectionAndCourseName(params: {
    sectionId: string;
    courseName: string;
    initialCapacity: number;
    maxExtraCapacity: number;
  }) {
    const course = await this.resolveCourseByName(params.courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${params.courseName}`);
    }
    const sectionCourse = await this.resolveSectionCourseOrThrow(params.sectionId, course.id);
    return this.updateSectionCourseCapacity({
      sectionCourseId: sectionCourse.id,
      initialCapacity: params.initialCapacity,
      maxExtraCapacity: params.maxExtraCapacity,
    });
  }

  async getEffectiveTeacherIdBySectionCourse(sectionCourseId: string) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{ teacherId: string | null }> = await this.sectionsRepo.manager.query(
      `
      SELECT COALESCE(sct.teacherId, s.teacherId) AS teacherId
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      WHERE sc.id = ?
        AND sc.periodId = ?
      LIMIT 1
      `,
      [sectionCourseId, activePeriodId]
    );
    const teacherId = String(rows[0]?.teacherId ?? '').trim();
    return teacherId || null;
  }

  async isTeacherAssignedToSectionCourse(params: {
    teacherId: string;
    sectionCourseId: string;
  }) {
    const row = await this.sectionCourseTeachersRepo.findOne({
      where: {
        sectionCourseId: params.sectionCourseId,
        teacher: { id: params.teacherId, role: Role.DOCENTE },
      },
      relations: { teacher: true },
    });
    return Boolean(row);
  }

  async listTeacherAssignments(teacherId: string) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionName: string;
      sectionCode: string | null;
      courseId: string;
      courseName: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        s.id AS sectionId,
        s.name AS sectionName,
        s.code AS sectionCode,
        c.id AS courseId,
        c.name AS courseName
      FROM section_course_teachers sct
      INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE sct.teacherId = ?
        AND sc.periodId = ?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC,
        c.name ASC
      `,
      [teacherId, activePeriodId]
    );
    return rows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      sectionName: String(row.sectionName ?? ''),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
    }));
  }

  async assertTeacherScheduleAvailabilityForBlock(params: {
    teacherId: string;
    sectionCourseId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    excludeBlockId?: string | null;
    ignoredSectionCourseIds?: string[];
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const context = await this.getSectionCourseContextOrThrow({
      sectionCourseId: params.sectionCourseId,
      periodId: activePeriodId,
    });
    if (this.isWelcomeScheduleContext(context)) {
      return;
    }
    const conflicts = await this.findTeacherConflictingBlocks({
      teacherId: params.teacherId,
      periodId: activePeriodId,
      sectionCourseId: params.sectionCourseId,
      dayOfWeek: params.dayOfWeek,
      startTime: params.startTime,
      endTime: params.endTime,
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      excludeBlockId: params.excludeBlockId ?? null,
      ignoredSectionCourseIds: params.ignoredSectionCourseIds ?? [],
    });
    if (conflicts.length <= 0) return;
    const first = conflicts[0];
    const label = `${first.sectionCode ?? first.sectionName} - ${first.courseName}`;
    throw new ConflictException(
      `Conflicto de horario del docente con ${label} (${first.startTime}-${first.endTime}).`
    );
  }

  async assertClassroomScheduleAvailabilityForBlock(params: {
    sectionCourseId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    excludeBlockId?: string | null;
    ignoredSectionCourseIds?: string[];
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const context = await this.getSectionCourseContextOrThrow({
      sectionCourseId: params.sectionCourseId,
      periodId: activePeriodId,
    });
    if (this.isVirtualModality(context.modality)) {
      return;
    }
    if (!context.classroomId) {
      return;
    }

    const conflicts = await this.findClassroomConflictingBlocks({
      periodId: activePeriodId,
      sectionCourseId: context.sectionCourseId,
      classroomId: context.classroomId,
      dayOfWeek: params.dayOfWeek,
      startTime: params.startTime,
      endTime: params.endTime,
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      excludeBlockId: params.excludeBlockId ?? null,
      ignoredSectionCourseIds: params.ignoredSectionCourseIds ?? [],
    });
    if (conflicts.length <= 0) return;
    const first = conflicts[0];
    const label = `${first.sectionCode ?? first.sectionName} - ${first.courseName}`;
    throw new ConflictException(
      `Conflicto de aula ${context.classroomCode ?? context.classroomId} con ${label} (${first.startTime}-${first.endTime}).`
    );
  }

  async listAssignedSectionCoursesForExport() {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{
      sectionCourseId: string;
      sectionCode: string | null;
      sectionName: string;
      courseId: string;
      courseAkademicId: string | null;
      courseName: string;
      teacherId: string;
      teacherDni: string | null;
      teacherName: string;
      studentCount: number;
      periodCode: string;
      periodName: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        s.code AS sectionCode,
        s.name AS sectionName,
        c.id AS courseId,
        c.idakademic AS courseAkademicId,
        c.name AS courseName,
        t.id AS teacherId,
        t.dni AS teacherDni,
        t.fullName AS teacherName,
        COUNT(DISTINCT ssc.studentId) AS studentCount,
        p.code AS periodCode,
        p.name AS periodName
      FROM section_course_teachers sct
      INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN users t ON t.id = sct.teacherId
      INNER JOIN periods p ON p.id = sc.periodId
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND sct.teacherId IS NOT NULL
      GROUP BY
        sc.id,
        s.code,
        s.name,
        c.id,
        c.idakademic,
        c.name,
        t.id,
        t.dni,
        t.fullName,
        p.code,
        p.name
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC,
        c.name ASC
      `,
      [activePeriodId]
    );

    return rows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      sectionName: String(row.sectionName ?? ''),
      courseId: String(row.courseId ?? ''),
      courseAkademicId: row.courseAkademicId ? String(row.courseAkademicId) : null,
      courseName: String(row.courseName ?? ''),
      teacherId: String(row.teacherId ?? ''),
      teacherDni: row.teacherDni ? String(row.teacherDni) : null,
      teacherName: String(row.teacherName ?? ''),
      studentCount: Number(row.studentCount ?? 0),
      periodCode: String(row.periodCode ?? ''),
      periodName: String(row.periodName ?? ''),
    }));
  }

  async buildAssignedSectionCoursesExportWorkbook() {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{
      codigoAlumno: string | null;
      names: string | null;
      paternalLastName: string | null;
      maternalLastName: string | null;
      email: string | null;
      sex: string | null;
      fullName: string;
      dni: string;
      teacherDni: string | null;
      courseId: string;
      courseAkademicId: string | null;
      courseName: string;
      sectionCode: string | null;
      facultyGroup: string | null;
      modality: string | null;
      periodCode: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        st.codigoAlumno AS codigoAlumno,
        st.names AS names,
        st.paternalLastName AS paternalLastName,
        st.maternalLastName AS maternalLastName,
        st.email AS email,
        st.sex AS sex,
        st.fullName AS fullName,
        st.dni AS dni,
        t.dni AS teacherDni,
        c.id AS courseId,
        c.idakademic AS courseAkademicId,
        c.name AS courseName,
        s.code AS sectionCode,
        s.facultyGroup AS facultyGroup,
        s.modality AS modality,
        p.code AS periodCode
      FROM section_course_teachers sct
      INNER JOIN section_courses sc ON sc.id = sct.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN users t ON t.id = sct.teacherId
      INNER JOIN periods p ON p.id = sc.periodId
      INNER JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      INNER JOIN users st ON st.id = ssc.studentId
      WHERE sc.periodId = ?
        AND sct.teacherId IS NOT NULL
      ORDER BY
        s.code ASC,
        c.name ASC,
        st.fullName ASC,
        st.dni ASC
      `,
      [activePeriodId]
    );

    const motherSectionCodeByWelcomeCourse = new Map<string, string>();
    for (const row of rows) {
      const facultyGroup = String(row.facultyGroup ?? '').trim().toUpperCase();
      const isVirtual = String(row.modality ?? '')
        .trim()
        .toUpperCase()
        .includes('VIRTUAL');
      if (facultyGroup !== 'GENERAL' || !isVirtual) continue;
      const courseKey = String(row.courseName ?? '').trim().toUpperCase();
      const sectionCode = String(row.sectionCode ?? '').trim();
      if (!courseKey || !sectionCode) continue;
      const current = motherSectionCodeByWelcomeCourse.get(courseKey) ?? null;
      if (!current || sectionCode.localeCompare(current) < 0) {
        motherSectionCodeByWelcomeCourse.set(courseKey, sectionCode);
      }
    }

    const templateRows = rows.map((row) => {
      const parts = this.splitStudentName(row.fullName);
      const facultyGroup = String(row.facultyGroup ?? '').trim().toUpperCase();
      const isVirtual = String(row.modality ?? '')
        .trim()
        .toUpperCase()
        .includes('VIRTUAL');
      const courseKey = String(row.courseName ?? '').trim().toUpperCase();
      const motherSectionCode =
        facultyGroup === 'GENERAL' && isVirtual
          ? motherSectionCodeByWelcomeCourse.get(courseKey) ??
            String(row.sectionCode ?? '').trim()
          : String(row.sectionCode ?? '').trim();
      return {
        Alumno: row.codigoAlumno ? String(row.codigoAlumno) : '',
        Correo: row.email ? String(row.email) : '',
        Nombres: row.names ? String(row.names) : parts.nombres,
        ApellidoPaterno: row.paternalLastName
          ? String(row.paternalLastName)
          : parts.apellidoPaterno,
        ApellidoMaterno: row.maternalLastName
          ? String(row.maternalLastName)
          : parts.apellidoMaterno,
        DNI: String(row.dni ?? ''),
        Sexo: row.sex ? String(row.sex) : '',
        Docente: row.teacherDni ? String(row.teacherDni) : '',
        'Id Curso': '',
        'Nombre Curso': String(row.courseName ?? ''),
        'Codigo Curso': row.courseAkademicId ? String(row.courseAkademicId) : '',
        'Codigo Seccion': motherSectionCode || '',
        'Periodo Academico': String(row.periodCode ?? ''),
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateRows, {
      header: [
        'Alumno',
        'Correo',
        'Nombres',
        'ApellidoPaterno',
        'ApellidoMaterno',
        'DNI',
        'Sexo',
        'Docente',
        'Id Curso',
        'Nombre Curso',
        'Codigo Curso',
        'Codigo Seccion',
        'Periodo Academico',
      ],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private async loadSectionCourseStudentsExportContext(params: {
    sectionId: string;
    courseName: string;
  }) {
    const section = await this.getByIdOrThrow(params.sectionId);
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const course = await this.resolveCourseByName(params.courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${params.courseName}`);
    }

    const sectionCourseRows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionCode: string | null;
      sectionName: string;
      facultyGroup: string | null;
      facultyName: string | null;
      campusName: string | null;
      courseName: string;
      periodCode: string;
      teacherName: string | null;
      teacherDni: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        s.id AS sectionId,
        s.code AS sectionCode,
        s.name AS sectionName,
        s.facultyGroup AS facultyGroup,
        s.facultyName AS facultyName,
        s.campusName AS campusName,
        c.name AS courseName,
        p.code AS periodCode,
        COALESCE(tc.fullName, ts.fullName) AS teacherName,
        COALESCE(tc.dni, ts.dni) AS teacherDni
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN periods p ON p.id = sc.periodId
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      LEFT JOIN users tc ON tc.id = sct.teacherId
      LEFT JOIN users ts ON ts.id = s.teacherId
      WHERE sc.sectionId = ?
        AND sc.courseId = ?
        AND sc.periodId = ?
      LIMIT 1
      `,
      [params.sectionId, course.id, activePeriodId]
    );
    const sectionCourseRow = sectionCourseRows[0];
    if (!sectionCourseRow?.sectionCourseId) {
      throw new BadRequestException(
        `No existe relacion seccion-curso para seccion ${params.sectionId} y curso ${course.name}`
      );
    }

    const blockRows: Array<{ dayOfWeek: number; startTime: string; endTime: string }> =
      await this.sectionsRepo.manager.query(
        `
        SELECT dayOfWeek, startTime, endTime
        FROM schedule_blocks
        WHERE sectionCourseId = ?
        ORDER BY dayOfWeek ASC, startTime ASC
        `,
        [sectionCourseRow.sectionCourseId]
      );

    const studentsRaw: Array<{
      codigoAlumno: string | null;
      fullName: string | null;
      names: string | null;
      paternalLastName: string | null;
      maternalLastName: string | null;
      careerName: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName,
        u.names AS names,
        u.paternalLastName AS paternalLastName,
        u.maternalLastName AS maternalLastName,
        u.careerName AS careerName
      FROM section_student_courses ssc
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE ssc.sectionCourseId = ?
      ORDER BY
        COALESCE(u.paternalLastName, '') ASC,
        COALESCE(u.maternalLastName, '') ASC,
        COALESCE(u.names, u.fullName, '') ASC,
        u.fullName ASC
      `,
      [sectionCourseRow.sectionCourseId]
    );

    const students = studentsRaw.map((row) => {
      const split = this.splitStudentName(String(row.fullName ?? ''));
      const apellidoPaterno = String(row.paternalLastName ?? '').trim() || split.apellidoPaterno;
      const apellidoMaterno = String(row.maternalLastName ?? '').trim() || split.apellidoMaterno;
      const nombres = String(row.names ?? '').trim() || split.nombres;
      const apellidos = `${apellidoPaterno} ${apellidoMaterno}`.trim();
      return {
        codigoAlumno: String(row.codigoAlumno ?? '').trim(),
        apellidos,
        nombres: nombres || String(row.fullName ?? '').trim(),
        careerName: String(row.careerName ?? '').trim() || 'SIN CARRERA',
      };
    });

    return {
      sectionCourseId: String(sectionCourseRow.sectionCourseId),
      sectionId: String(sectionCourseRow.sectionId),
      sectionCode: sectionCourseRow.sectionCode
        ? String(sectionCourseRow.sectionCode)
        : null,
      sectionName: String(sectionCourseRow.sectionName ?? section.name ?? ''),
      facultyGroup: sectionCourseRow.facultyGroup
        ? String(sectionCourseRow.facultyGroup)
        : null,
      facultyName: sectionCourseRow.facultyName
        ? String(sectionCourseRow.facultyName)
        : null,
      campusName: sectionCourseRow.campusName ? String(sectionCourseRow.campusName) : null,
      courseName: String(sectionCourseRow.courseName ?? course.name),
      periodCode: String(sectionCourseRow.periodCode ?? ''),
      teacherName: sectionCourseRow.teacherName ? String(sectionCourseRow.teacherName) : null,
      teacherDni: sectionCourseRow.teacherDni ? String(sectionCourseRow.teacherDni) : null,
      scheduleSummary: this.buildScheduleSummaryForExport(blockRows),
      students,
    };
  }

  async resolveMotherAndSiblingsForScope(params: {
    facultyGroup: string;
    campusName: string;
    courseName: string;
    modality?: string | null;
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.resolveMotherAndSiblings({
      periodId: activePeriodId,
      facultyGroup: params.facultyGroup,
      campusName: params.campusName,
      courseName: params.courseName,
      modality: params.modality ?? null,
    });
  }

  private async resolveMotherAndSiblings(params: {
    periodId: string;
    facultyGroup: string;
    campusName: string;
    courseName: string;
    modality?: string | null;
  }) {
    const facultyGroup = String(params.facultyGroup ?? '').trim();
    const campusName = String(params.campusName ?? '').trim();
    const courseName = String(params.courseName ?? '').trim();
    if (!facultyGroup || !campusName || !courseName) {
      throw new BadRequestException(
        'facultyGroup, campusName y courseName son requeridos'
      );
    }

    const course = await this.resolveCourseByName(courseName);
    if (!course) {
      throw new BadRequestException(`Curso no encontrado: ${courseName}`);
    }

    const isVirtualCampus = this.isVirtualCampusFilter(campusName);
    const modalityFilter = String(params.modality ?? '').trim();
    const hasModalityFilter = modalityFilter.length > 0;
    const rows: Array<{
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      courseName: string;
      sectionCode: string | null;
      sectionName: string;
      modality: string | null;
      teacherId: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName,
        s.code AS sectionCode,
        s.name AS sectionName,
        s.modality AS modality,
        COALESCE(sct.teacherId, s.teacherId) AS teacherId
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      LEFT JOIN section_course_teachers sct
        ON sct.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND sc.courseId = ?
        AND s.facultyGroup = ?
        AND (
          (? = 1 AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%')
          OR (
            ? = 0
            AND s.campusName = ?
            AND UPPER(COALESCE(s.modality, '')) NOT LIKE '%VIRTUAL%'
          )
        )
        AND (
          ? = 0
          OR UPPER(COALESCE(s.modality, '')) = UPPER(?)
        )
      ORDER BY
        CASE WHEN s.code IS NULL OR s.code = '' THEN 1 ELSE 0 END ASC,
        s.code ASC,
        s.name ASC
      `,
      [
        params.periodId,
        course.id,
        facultyGroup,
        isVirtualCampus ? 1 : 0,
        isVirtualCampus ? 1 : 0,
        campusName,
        hasModalityFilter ? 1 : 0,
        modalityFilter,
      ]
    );

    if (rows.length <= 0) {
      throw new BadRequestException(
        'No hay secciones-curso para el alcance seleccionado.'
      );
    }

    const scoped = rows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId ?? '').trim(),
      sectionId: String(row.sectionId ?? '').trim(),
      courseId: String(row.courseId ?? '').trim(),
      courseName: String(row.courseName ?? '').trim(),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      sectionName: String(row.sectionName ?? '').trim(),
      modality: row.modality ? String(row.modality) : null,
      teacherId: row.teacherId ? String(row.teacherId) : null,
    }));
    const mother = scoped[0];
    const siblings = scoped.slice(1);
    return {
      mother,
      siblings,
      scoped,
    };
  }

  private async assertTeacherCourseAssignmentHasNoScheduleConflict(params: {
    teacherId: string;
    sectionCourseId: string;
    ignoredSectionCourseIds?: string[];
  }) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const context = await this.getSectionCourseContextOrThrow({
      sectionCourseId: params.sectionCourseId,
      periodId: activePeriodId,
    });
    if (this.isWelcomeScheduleContext(context)) {
      return;
    }
    const blockRows: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate
      FROM schedule_blocks
      WHERE sectionCourseId = ?
      `,
      [params.sectionCourseId]
    );
    for (const block of blockRows) {
      const conflicts = await this.findTeacherConflictingBlocks({
        teacherId: params.teacherId,
        periodId: activePeriodId,
        sectionCourseId: params.sectionCourseId,
        dayOfWeek: Number(block.dayOfWeek ?? 0),
        startTime: String(block.startTime ?? ''),
        endTime: String(block.endTime ?? ''),
        startDate: this.toIsoDateOnly(block.startDate),
        endDate: this.toIsoDateOnly(block.endDate),
        ignoredSectionCourseIds: params.ignoredSectionCourseIds ?? [],
      });
      if (conflicts.length <= 0) continue;
      const first = conflicts[0];
      const label = `${first.sectionCode ?? first.sectionName} - ${first.courseName}`;
      throw new ConflictException(
        `No se puede asignar docente: cruce con ${label} (${first.startTime}-${first.endTime}).`
      );
    }
  }

  private buildSectionCourseStudentsExportFileName(params: {
    sectionCode: string | null;
    sectionName: string;
    courseName: string;
    periodCode: string;
    extension: 'xlsx' | 'pdf';
  }) {
    const section = this.sanitizeFilePart(
      params.sectionCode ? params.sectionCode : params.sectionName
    );
    const course = this.sanitizeFilePart(params.courseName);
    const period = this.sanitizeFilePart(params.periodCode || 'PERIODO');
    return `alumnos_${section}_${course}_${period}.${params.extension}`;
  }

  private sanitizeFilePart(value: string) {
    const normalized = this.norm(value).replace(/[^A-Z0-9_-]+/g, '_');
    const compact = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return compact || 'ITEM';
  }

  private buildScheduleSummaryForExport(
    blocks: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
  ) {
    if (!blocks || blocks.length === 0) return 'Sin horario';
    return blocks
      .map((block) => {
        const day = this.dayShort(Number(block.dayOfWeek ?? 0));
        const start = String(block.startTime ?? '').slice(0, 5);
        const end = String(block.endTime ?? '').slice(0, 5);
        return `${day} ${start}-${end}`.trim();
      })
      .join(' | ');
  }

  private dayShort(dayOfWeek: number) {
    const labels = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    return labels[dayOfWeek] || `Dia ${dayOfWeek}`;
  }

  private async findTeacherConflictingBlocks(params: {
    teacherId: string;
    periodId: string;
    sectionCourseId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    excludeBlockId?: string | null;
    ignoredSectionCourseIds?: string[];
  }) {
    const ignored = Array.from(
      new Set(
        (params.ignoredSectionCourseIds ?? [])
          .map((id) => String(id ?? '').trim())
          .filter((id) => Boolean(id) && id !== params.sectionCourseId)
      )
    );
    const ignoredSql =
      ignored.length > 0
        ? ` AND sc.id NOT IN (${ignored.map(() => '?').join(', ')})`
        : '';

    const rows: Array<{
      blockId: string;
      sectionCourseId: string;
      sectionCode: string | null;
      sectionName: string;
      courseName: string;
      startTime: string;
      endTime: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sb.id AS blockId,
        sc.id AS sectionCourseId,
        s.code AS sectionCode,
        s.name AS sectionName,
        c.name AS courseName,
        sb.startTime AS startTime,
        sb.endTime AS endTime
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND COALESCE(sct.teacherId, s.teacherId) = ?
        AND sc.id <> ?
        ${ignoredSql}
        AND sb.dayOfWeek = ?
        AND sb.startTime < ?
        AND sb.endTime > ?
        AND COALESCE(sb.startDate, '1000-01-01') <= COALESCE(?, '9999-12-31')
        AND COALESCE(?, '1000-01-01') <= COALESCE(sb.endDate, '9999-12-31')
        AND (? IS NULL OR sb.id <> ?)
      ORDER BY s.code ASC, s.name ASC, c.name ASC
      LIMIT 5
      `,
      [
        params.periodId,
        params.teacherId,
        params.sectionCourseId,
        ...ignored,
        params.dayOfWeek,
        params.endTime,
        params.startTime,
        params.endDate ?? null,
        params.startDate ?? null,
        params.excludeBlockId ?? null,
        params.excludeBlockId ?? null,
      ]
    );
    return rows;
  }

  private async loadStudentMembershipBySectionCourseOrThrow(params: {
    studentId: string;
    sectionCourseId: string;
    periodId: string;
  }) {
    const rows: Array<{
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      classroomPavilionCode: string | null;
      classroomPavilionName: string | null;
      classroomLevelName: string | null;
      capacitySource: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA';
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName,
        s.facultyGroup AS facultyGroup,
        s.campusName AS campusName,
        s.modality AS modality,
        COALESCE(sc.initialCapacity, s.initialCapacity) AS initialCapacity,
        COALESCE(sc.maxExtraCapacity, s.maxExtraCapacity) AS maxExtraCapacity,
        sc.classroomId AS classroomId,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        cl.capacity AS classroomCapacity,
        p.code AS classroomPavilionCode,
        p.name AS classroomPavilionName,
        cl.levelName AS classroomLevelName,
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 'VIRTUAL'
          WHEN sc.classroomId IS NULL THEN 'SIN_AULA'
          WHEN cl.id IS NULL THEN 'AULA_INACTIVA'
          ELSE 'AULA'
        END AS capacitySource
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
      LEFT JOIN classrooms cl
        ON cl.id = sc.classroomId
       AND cl.status = 'ACTIVA'
      LEFT JOIN pavilions p
        ON p.id = cl.pavilionId
      WHERE ssc.studentId = ?
        AND sc.id = ?
        AND sc.periodId = ?
      LIMIT 1
      `,
      [params.studentId, params.sectionCourseId, params.periodId]
    );
    const row = rows[0];
    if (!row?.sectionCourseId) {
      throw new BadRequestException(
        'El alumno no esta asignado a la seccion-curso origen en el periodo activo'
      );
    }
    return {
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      modality: row.modality ? String(row.modality) : null,
      initialCapacity: Number(row.initialCapacity ?? 45),
      maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
      classroomId: row.classroomId ? String(row.classroomId) : null,
      classroomCode: row.classroomCode ? String(row.classroomCode) : null,
      classroomName: row.classroomName ? String(row.classroomName) : null,
      classroomCapacity:
        row.classroomCapacity !== null && row.classroomCapacity !== undefined
          ? Number(row.classroomCapacity)
          : null,
      classroomPavilionCode: row.classroomPavilionCode
        ? String(row.classroomPavilionCode)
        : null,
      classroomPavilionName: row.classroomPavilionName
        ? String(row.classroomPavilionName)
        : null,
      classroomLevelName: row.classroomLevelName
        ? String(row.classroomLevelName)
        : null,
      capacitySource: String(row.capacitySource ?? '').trim() || null,
    };
  }

  private async getSectionCourseContextOrThrow(params: {
    sectionCourseId: string;
    periodId: string;
  }) {
    const rows: Array<{
      sectionCourseId: string;
      sectionId: string;
      courseId: string;
      courseName: string;
      facultyGroup: string | null;
      campusName: string | null;
      modality: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      classroomId: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      classroomCapacity: number | null;
      capacitySource: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA';
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName,
        s.facultyGroup AS facultyGroup,
        s.campusName AS campusName,
        s.modality AS modality,
        COALESCE(sc.initialCapacity, s.initialCapacity) AS initialCapacity,
        COALESCE(sc.maxExtraCapacity, s.maxExtraCapacity) AS maxExtraCapacity,
        sc.classroomId AS classroomId,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        cl.capacity AS classroomCapacity,
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 'VIRTUAL'
          WHEN sc.classroomId IS NULL THEN 'SIN_AULA'
          WHEN cl.id IS NULL THEN 'AULA_INACTIVA'
          ELSE 'AULA'
        END AS capacitySource
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
      LEFT JOIN classrooms cl
        ON cl.id = sc.classroomId
       AND cl.status = 'ACTIVA'
      WHERE sc.id = ?
        AND sc.periodId = ?
      LIMIT 1
      `,
      [params.sectionCourseId, params.periodId]
    );
    const row = rows[0];
    if (!row?.sectionCourseId) {
      throw new BadRequestException('La seccion-curso destino no pertenece al periodo activo');
    }
    return {
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      modality: row.modality ? String(row.modality) : null,
      initialCapacity: Number(row.initialCapacity ?? 45),
      maxExtraCapacity: Number(row.maxExtraCapacity ?? 0),
      classroomId: row.classroomId ? String(row.classroomId) : null,
      classroomCode: row.classroomCode ? String(row.classroomCode) : null,
      classroomName: row.classroomName ? String(row.classroomName) : null,
      classroomCapacity:
        row.classroomCapacity !== null && row.classroomCapacity !== undefined
          ? Number(row.classroomCapacity)
          : null,
      capacitySource: String(row.capacitySource ?? '').trim() || null,
    };
  }

  private scopeKey(value: string | null | undefined) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private isVirtualModality(value: string | null | undefined) {
    return this.scopeKey(value).includes('VIRTUAL');
  }

  private isWelcomeScheduleContext(params: {
    facultyGroup: string | null | undefined;
    campusName: string | null | undefined;
    modality: string | null | undefined;
  }) {
    return (
      this.scopeKey(params.facultyGroup) === 'GENERAL' &&
      this.scopeKey(params.campusName) === 'VIRTUAL' &&
      this.isVirtualModality(params.modality)
    );
  }

  private buildPlanningStatusAndAvailability(params: {
    modality: string | null;
    capacitySource: string | null;
    classroomCapacity: number | null;
    studentCount: number;
    hasClassroomConflict: boolean;
    hasTeacherConflict: boolean;
  }) {
    if (this.isVirtualModality(params.modality)) {
      return {
        planningStatus: 'OK' as const,
        planningStatusLabel: 'OK',
        hasClassroomConflict: false,
        hasTeacherConflict: Boolean(params.hasTeacherConflict),
        availableSeats: null,
      };
    }

    const source = this.scopeKey(params.capacitySource);
    const classroomCapacity = Math.max(0, Number(params.classroomCapacity ?? 0));
    const studentCount = Math.max(0, Number(params.studentCount ?? 0));
    const hasClassroomConflict = Boolean(params.hasClassroomConflict);
    const hasTeacherConflict = Boolean(params.hasTeacherConflict);
    const availableSeats = classroomCapacity > 0 ? Math.max(0, classroomCapacity - studentCount) : 0;

    if (source === 'SIN_AULA' || source === 'AULA_INACTIVA' || classroomCapacity <= 0) {
      return {
        planningStatus: 'FALTA_AULA' as const,
        planningStatusLabel: 'Falta aula',
        hasClassroomConflict,
        hasTeacherConflict,
        availableSeats,
      };
    }
    if (hasClassroomConflict) {
      return {
        planningStatus: 'CRUCE_AULA' as const,
        planningStatusLabel: 'Cruce aula',
        hasClassroomConflict,
        hasTeacherConflict,
        availableSeats,
      };
    }
    if (hasTeacherConflict) {
      return {
        planningStatus: 'CRUCE_DOCENTE' as const,
        planningStatusLabel: 'Cruce docente',
        hasClassroomConflict,
        hasTeacherConflict,
        availableSeats,
      };
    }
    return {
      planningStatus: 'OK' as const,
      planningStatusLabel: 'OK',
      hasClassroomConflict,
      hasTeacherConflict,
      availableSeats,
    };
  }

  private isPresentialWithoutClassroom(params: {
    modality: string | null | undefined;
    classroomId?: string | null;
    classroomCapacity?: number | null;
  }) {
    if (this.isVirtualModality(params.modality)) return false;
    const classroomId = String(params.classroomId ?? '').trim();
    const classroomCapacity = Number(params.classroomCapacity ?? 0);
    if (!classroomId) return true;
    return !Number.isFinite(classroomCapacity) || classroomCapacity <= 0;
  }

  private isOverPhysicalCapacity(params: {
    modality: string | null | undefined;
    classroomCapacity?: number | null;
    initialCapacity: number;
    maxExtraCapacity: number;
    projectedStudents: number;
  }) {
    const projectedStudents = Math.max(0, Number(params.projectedStudents ?? 0));
    if (this.isVirtualModality(params.modality)) {
      return false;
    }

    const classroomCapacity = Number(params.classroomCapacity ?? 0);
    if (!Number.isFinite(classroomCapacity) || classroomCapacity <= 0) {
      return true;
    }
    return projectedStudents > classroomCapacity;
  }

  private isOverCapacity(params: {
    initialCapacity: number;
    maxExtraCapacity: number;
    projectedStudents: number;
  }) {
    const initialCapacity = Math.max(0, Number(params.initialCapacity ?? 0));
    const maxExtraCapacity = Math.max(0, Number(params.maxExtraCapacity ?? 0));
    const projectedStudents = Math.max(0, Number(params.projectedStudents ?? 0));

    const hardCap = initialCapacity + maxExtraCapacity;
    if (hardCap <= 0) return false;
    return projectedStudents > hardCap;
  }

  private async assertSectionCourseClassroomAvailability(params: {
    periodId: string;
    sectionCourseId: string;
    classroomId: string;
    ignoredSectionCourseIds?: string[];
  }) {
    const blockRows: Array<{
      id: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT id, dayOfWeek, startTime, endTime, startDate, endDate
      FROM schedule_blocks
      WHERE sectionCourseId = ?
      `,
      [params.sectionCourseId]
    );
    for (const block of blockRows) {
      const conflicts = await this.findClassroomConflictingBlocks({
        periodId: params.periodId,
        sectionCourseId: params.sectionCourseId,
        classroomId: params.classroomId,
        dayOfWeek: Number(block.dayOfWeek ?? 0),
        startTime: String(block.startTime ?? ''),
        endTime: String(block.endTime ?? ''),
        startDate: this.toIsoDateOnly(block.startDate),
        endDate: this.toIsoDateOnly(block.endDate),
        excludeBlockId: String(block.id ?? '').trim() || null,
        ignoredSectionCourseIds: params.ignoredSectionCourseIds ?? [],
      });
      if (conflicts.length <= 0) continue;
      const first = conflicts[0];
      const label = `${first.sectionCode ?? first.sectionName} - ${first.courseName}`;
      throw new ConflictException(
        `No se puede asignar aula: cruce con ${label} (${first.startTime}-${first.endTime}).`
      );
    }
  }

  private async findClassroomConflictingBlocks(params: {
    periodId: string;
    sectionCourseId: string;
    classroomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    excludeBlockId?: string | null;
    ignoredSectionCourseIds?: string[];
  }) {
    const ignored = Array.from(
      new Set(
        (params.ignoredSectionCourseIds ?? [])
          .map((id) => String(id ?? '').trim())
          .filter((id) => Boolean(id) && id !== params.sectionCourseId)
      )
    );
    const ignoredSql =
      ignored.length > 0
        ? ` AND sc.id NOT IN (${ignored.map(() => '?').join(', ')})`
        : '';

    const rows: Array<{
      blockId: string;
      sectionCourseId: string;
      sectionCode: string | null;
      sectionName: string;
      courseName: string;
      startTime: string;
      endTime: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sb.id AS blockId,
        sc.id AS sectionCourseId,
        s.code AS sectionCode,
        s.name AS sectionName,
        c.name AS courseName,
        sb.startTime AS startTime,
        sb.endTime AS endTime
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND sc.classroomId = ?
        AND sc.id <> ?
        ${ignoredSql}
        AND sb.dayOfWeek = ?
        AND sb.startTime < ?
        AND sb.endTime > ?
        AND COALESCE(sb.startDate, '1000-01-01') <= COALESCE(?, '9999-12-31')
        AND COALESCE(?, '1000-01-01') <= COALESCE(sb.endDate, '9999-12-31')
        AND (? IS NULL OR sb.id <> ?)
      ORDER BY s.code ASC, s.name ASC, c.name ASC
      LIMIT 5
      `,
      [
        params.periodId,
        params.classroomId,
        params.sectionCourseId,
        ...ignored,
        params.dayOfWeek,
        params.endTime,
        params.startTime,
        params.endDate ?? null,
        params.startDate ?? null,
        params.excludeBlockId ?? null,
        params.excludeBlockId ?? null,
      ]
    );
    return rows;
  }

  private async findConflictingCandidateIds(params: {
    studentId: string;
    excludeSectionCourseId: string;
    candidateSectionCourseIds: string[];
    periodId: string;
  }) {
    const ids = Array.from(
      new Set(params.candidateSectionCourseIds.map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (ids.length === 0) return new Set<string>();
    const placeholders = ids.map(() => '?').join(', ');
    const rows: Array<{ candidateSectionCourseId: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT cand.id AS candidateSectionCourseId
      FROM section_courses cand
      INNER JOIN schedule_blocks cb ON cb.sectionCourseId = cand.id
      INNER JOIN section_student_courses ssc ON ssc.studentId = ?
      INNER JOIN section_courses other_sc
        ON other_sc.id = ssc.sectionCourseId
       AND other_sc.periodId = ?
      INNER JOIN schedule_blocks ob ON ob.sectionCourseId = other_sc.id
      WHERE cand.id IN (${placeholders})
        AND cand.periodId = ?
        AND other_sc.id <> ?
        AND cb.dayOfWeek = ob.dayOfWeek
        AND cb.startTime < ob.endTime
        AND cb.endTime > ob.startTime
        AND COALESCE(cb.startDate, '1000-01-01') <= COALESCE(ob.endDate, '9999-12-31')
        AND COALESCE(ob.startDate, '1000-01-01') <= COALESCE(cb.endDate, '9999-12-31')
      `,
      [
        params.studentId,
        params.periodId,
        ...ids,
        params.periodId,
        params.excludeSectionCourseId,
      ]
    );
    return new Set(rows.map((row) => String(row.candidateSectionCourseId)));
  }

  private async candidateCreatesConflict(params: {
    studentId: string;
    candidateSectionCourseId: string;
    excludeSectionCourseId: string;
    periodId: string;
  }) {
    const ids = await this.findConflictingCandidateIds({
      studentId: params.studentId,
      excludeSectionCourseId: params.excludeSectionCourseId,
      candidateSectionCourseIds: [params.candidateSectionCourseId],
      periodId: params.periodId,
    });
    return ids.has(params.candidateSectionCourseId);
  }

  private async loadCourseLookup() {
    const rows: Array<{ id: string; name: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT id, name
      FROM courses
      `
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      map.set(String(row.id), name);
    }
    return map;
  }

  private async resolveCourseByName(courseName: string) {
    const lookup = await this.loadCourseLookup();
    const targetKey = this.courseKey(courseName);
    if (!targetKey) return null;
    for (const [id, name] of lookup.entries()) {
      if (this.courseKey(name) === targetKey) {
        return { id, name };
      }
    }
    return null;
  }

  private async resolveSectionCourse(sectionId: string, courseId: string) {
    const activePeriodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const rows: Array<{ id: string; sectionId: string; courseId: string }> =
      await this.sectionsRepo.manager.query(
        `
      SELECT id, sectionId, courseId
      FROM section_courses
      WHERE sectionId = ?
        AND courseId = ?
        AND periodId = ?
      LIMIT 1
      `,
        [sectionId, courseId, activePeriodId]
      );
    const row = rows[0];
    const id = String(row?.id ?? '').trim();
    if (!id) return null;
    return {
      id,
      sectionId: String(row.sectionId),
      courseId: String(row.courseId),
    };
  }

  private async resolveSectionCourseOrThrow(sectionId: string, courseId: string) {
    const row = await this.resolveSectionCourse(sectionId, courseId);
    if (!row) {
      throw new BadRequestException(
        `No existe relacion seccion-curso para la seccion ${sectionId} y curso ${courseId}`
      );
    }
    return row;
  }

  private courseKey(value: string) {
    return this.norm(value).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  }

  private campusSort(campusName: string) {
    const n = this.norm(campusName);
    if (n.includes('CHINCHA')) return 0;
    if (n.includes('ICA')) return 1;
    if (n.includes('HUAURA') || n.includes('HUACHO')) return 2;
    if (n.includes('VIRTUAL')) return 3;
    return 10;
  }

  private isVirtualCampusFilter(campusName: string) {
    return this.norm(campusName).includes('VIRTUAL');
  }

  private norm(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private splitStudentName(fullNameRaw: string) {
    const fullName = String(fullNameRaw || '').trim();
    if (!fullName) {
      return {
        apellidoPaterno: '',
        apellidoMaterno: '',
        nombres: '',
      };
    }

    const commaIdx = fullName.indexOf(',');
    if (commaIdx >= 0) {
      const left = fullName.slice(0, commaIdx).trim();
      const right = fullName.slice(commaIdx + 1).trim();
      const surnameParts = left.split(/\s+/g).filter(Boolean);
      return {
        apellidoPaterno: surnameParts[0] ?? '',
        apellidoMaterno: surnameParts.slice(1).join(' '),
        nombres: right,
      };
    }

    const tokens = fullName.split(/\s+/g).filter(Boolean);
    if (tokens.length <= 2) {
      return {
        apellidoPaterno: tokens[0] ?? '',
        apellidoMaterno: '',
        nombres: tokens.slice(1).join(' '),
      };
    }
    return {
      apellidoPaterno: tokens[0] ?? '',
      apellidoMaterno: tokens[1] ?? '',
      nombres: tokens.slice(2).join(' '),
    };
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

  private uuid() {
    return randomUUID();
  }
}
