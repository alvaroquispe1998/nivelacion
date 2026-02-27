import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Role } from '@uai/shared';
import { DataSource } from 'typeorm';
import { PeriodsService } from '../periods/periods.service';
import { SectionsService } from '../sections/sections.service';
import { SaveSectionCourseGradesDto } from './dto/save-section-course-grades.dto';
import { UpdateGradeSchemeDto } from './dto/update-grade-scheme.dto';

type GradeComponentCode = 'DIAGNOSTICO' | 'FK1' | 'FK2' | 'PARCIAL';

interface GradeSchemeComponentRow {
  id: string;
  schemeId: string;
  code: GradeComponentCode;
  name: string;
  weight: number;
  orderIndex: number;
  minScore: number;
  maxScore: number;
  isActive: boolean;
}

interface GradeSchemeRow {
  id: string;
  periodId: string;
  status: 'DRAFT' | 'LOCKED';
  components: GradeSchemeComponentRow[];
}

interface GradesReportFilter {
  facultyGroup?: string;
  campusName?: string;
  careerName?: string;
}

const COMPONENT_ORDER: GradeComponentCode[] = ['DIAGNOSTICO', 'FK1', 'FK2', 'PARCIAL'];
const DEFAULT_COMPONENTS: Array<{
  code: GradeComponentCode;
  name: string;
  weight: number;
  orderIndex: number;
  minScore: number;
  maxScore: number;
  isActive: boolean;
}> = [
  { code: 'DIAGNOSTICO', name: 'DIAGNOSTICO (Evaluacion inicial)', weight: 0, orderIndex: 1, minScore: 0, maxScore: 20, isActive: true },
  { code: 'FK1', name: 'FK1', weight: 30, orderIndex: 2, minScore: 0, maxScore: 20, isActive: true },
  { code: 'FK2', name: 'FK2', weight: 30, orderIndex: 3, minScore: 0, maxScore: 20, isActive: true },
  { code: 'PARCIAL', name: 'PARCIAL', weight: 40, orderIndex: 4, minScore: 0, maxScore: 20, isActive: true },
];

@Injectable()
export class GradesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly periodsService: PeriodsService,
    private readonly sectionsService: SectionsService
  ) {}

  async getAdminScheme() {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.getOrCreateScheme(periodId);
  }

  async updateAdminScheme(dto: UpdateGradeSchemeDto) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    this.validateSchemePayload(dto);
    const scheme = await this.getOrCreateScheme(periodId);
    const byCode = new Map(dto.components.map((x) => [x.code as GradeComponentCode, x]));
    for (const code of COMPONENT_ORDER) {
      const row = scheme.components.find((x) => x.code === code);
      const input = byCode.get(code);
      if (!row || !input) continue;
      await this.dataSource.query(
        `
        UPDATE grade_scheme_components
        SET name = ?, weight = ?, orderIndex = ?, minScore = ?, maxScore = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP(6)
        WHERE id = ?
        `,
        [
          String(input.name ?? '').trim(),
          this.toFixed2(input.weight ?? 0),
          Number(input.orderIndex ?? row.orderIndex),
          this.toFixed2(input.minScore ?? row.minScore),
          this.toFixed2(input.maxScore ?? row.maxScore),
          input.isActive === false ? 0 : 1,
          row.id,
        ]
      );
    }
    return this.getOrCreateScheme(periodId);
  }

  async listSectionCoursesForAdmin(params: {
    facultyGroup?: string;
    campusName?: string;
    courseName?: string;
  }) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const where: string[] = ['sc.periodId = ?'];
    const args: unknown[] = [periodId];
    if (String(params.facultyGroup ?? '').trim()) {
      where.push('s.facultyGroup = ?');
      args.push(String(params.facultyGroup).trim());
    }
    if (String(params.campusName ?? '').trim()) {
      where.push('s.campusName = ?');
      args.push(String(params.campusName).trim());
    }
    if (String(params.courseName ?? '').trim()) {
      where.push('c.name = ?');
      args.push(String(params.courseName).trim());
    }

    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT sc.id AS sectionCourseId, s.id AS sectionId, s.code AS sectionCode, s.name AS sectionName,
             c.name AS courseName, s.facultyGroup AS facultyGroup, s.facultyName AS facultyName,
             s.campusName AS campusName, s.modality AS modality, COUNT(DISTINCT ssc.studentId) AS studentCount
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE ${where.join(' AND ')}
      GROUP BY sc.id, s.id, s.code, s.name, c.name, s.facultyGroup, s.facultyName, s.campusName, s.modality
      ORDER BY c.name ASC, s.code ASC, s.name ASC
      `,
      args
    );
    return rows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      sectionName: String(row.sectionName ?? ''),
      courseName: String(row.courseName ?? ''),
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      facultyName: row.facultyName ? String(row.facultyName) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      modality: row.modality ? String(row.modality) : null,
      studentCount: Number(row.studentCount ?? 0),
    }));
  }

  async getSectionCourseGradesForAdmin(sectionCourseId: string) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.getSectionCourseGrades({
      sectionCourseId,
      periodId,
      actorRole: Role.ADMIN,
      actorUserId: '',
    });
  }

  async getSectionCourseGradesForTeacher(sectionCourseId: string, teacherId: string) {
    const periodId = await this.periodsService.getActivePeriodIdOrThrow();
    return this.getSectionCourseGrades({
      sectionCourseId,
      periodId,
      actorRole: Role.DOCENTE,
      actorUserId: teacherId,
    });
  }

  async saveSectionCourseGradesForAdmin(
    sectionCourseId: string,
    dto: SaveSectionCourseGradesDto,
    actorUserId: string
  ) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.saveSectionCourseGrades({
      sectionCourseId,
      dto,
      actorRole: Role.ADMIN,
      actorUserId,
      periodId,
    });
  }

  async saveSectionCourseGradesForTeacher(
    sectionCourseId: string,
    dto: SaveSectionCourseGradesDto,
    actorUserId: string
  ) {
    const periodId = await this.periodsService.getActivePeriodIdOrThrow();
    return this.saveSectionCourseGrades({
      sectionCourseId,
      dto,
      actorRole: Role.DOCENTE,
      actorUserId,
      periodId,
    });
  }

  async publishSectionCourseGradesForAdmin(sectionCourseId: string, actorUserId: string) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    return this.publishSectionCourseGrades({
      sectionCourseId,
      actorRole: Role.ADMIN,
      actorUserId,
      periodId,
    });
  }

  async publishSectionCourseGradesForTeacher(sectionCourseId: string, actorUserId: string) {
    const periodId = await this.periodsService.getActivePeriodIdOrThrow();
    return this.publishSectionCourseGrades({
      sectionCourseId,
      actorRole: Role.DOCENTE,
      actorUserId,
      periodId,
    });
  }

  async getStudentGrades(studentId: string) {
    const periodId = await this.periodsService.getActivePeriodIdOrThrow();
    const scheme = await this.getOrCreateScheme(periodId);
    const activeComponents = this.getActiveComponents(scheme.components);

    const enrollments: Array<any> = await this.dataSource.query(
      `
      SELECT sc.id AS sectionCourseId, c.name AS courseName, s.code AS sectionCode, s.name AS sectionName,
             s.facultyGroup AS facultyGroup, s.facultyName AS facultyName, s.campusName AS campusName, s.modality AS modality
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE ssc.studentId = ? AND sc.periodId = ?
      ORDER BY c.name ASC, s.code ASC, s.name ASC
      `,
      [studentId, periodId]
    );
    if (enrollments.length === 0) return { periodId, components: activeComponents, rows: [] };

    const sectionCourseIds = enrollments.map((x) => String(x.sectionCourseId));
    const placeholders = sectionCourseIds.map(() => '?').join(', ');
    const grades: Array<any> = await this.dataSource.query(
      `
      SELECT sectionCourseId, componentId, score
      FROM section_course_grades
      WHERE studentId = ? AND sectionCourseId IN (${placeholders})
      `,
      [studentId, ...sectionCourseIds]
    );
    const gradeMap = new Map<string, number>();
    for (const row of grades) {
      gradeMap.set(this.gradeKey(studentId, String(row.sectionCourseId), String(row.componentId)), Number(row.score ?? 0));
    }

    const rows = enrollments.map((row) => {
      const sectionCourseId = String(row.sectionCourseId);
      const scores = new Map<string, number>();
      for (const c of activeComponents) {
        const key = this.gradeKey(studentId, sectionCourseId, c.id);
        if (gradeMap.has(key)) scores.set(c.id, gradeMap.get(key) ?? 0);
      }
      const { finalAverage, approved } = this.computeFinalAverage(activeComponents, scores);
      return {
        sectionCourseId,
        courseName: String(row.courseName ?? ''),
        sectionCode: row.sectionCode ? String(row.sectionCode) : null,
        sectionName: String(row.sectionName ?? ''),
        facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
        facultyName: row.facultyName ? String(row.facultyName) : null,
        campusName: row.campusName ? String(row.campusName) : null,
        modality: row.modality ? String(row.modality) : null,
        components: activeComponents.map((component) => {
          const key = this.gradeKey(studentId, sectionCourseId, component.id);
          return {
            componentId: component.id,
            code: component.code,
            name: component.name,
            weight: component.weight,
            score: gradeMap.has(key) ? this.toFixed2(gradeMap.get(key) ?? 0) : null,
          };
        }),
        finalAverage,
        approved,
      };
    });
    return { periodId, components: activeComponents, rows };
  }

  async getAdminReportFilters() {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const faculties: Array<any> = await this.dataSource.query(
      `
      SELECT DISTINCT s.facultyGroup AS facultyGroup, s.facultyName AS facultyName
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE sc.periodId = ? AND COALESCE(NULLIF(TRIM(s.facultyGroup), ''), '') <> ''
      ORDER BY s.facultyGroup ASC
      `,
      [periodId]
    );
    const campuses: Array<any> = await this.dataSource.query(
      `
      SELECT DISTINCT s.campusName AS campusName
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE sc.periodId = ? AND COALESCE(NULLIF(TRIM(s.campusName), ''), '') <> ''
      ORDER BY s.campusName ASC
      `,
      [periodId]
    );
    const careers: Array<any> = await this.dataSource.query(
      `
      SELECT DISTINCT u.careerName AS careerName
      FROM users u
      WHERE u.role = 'ALUMNO' AND COALESCE(NULLIF(TRIM(u.careerName), ''), '') <> ''
      AND EXISTS (
        SELECT 1
        FROM section_student_courses ssc
        INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
        WHERE ssc.studentId = u.id AND sc.periodId = ?
      )
      ORDER BY u.careerName ASC
      `,
      [periodId]
    );
    return {
      periodId,
      faculties: faculties.map((x) => ({
        facultyGroup: String(x.facultyGroup ?? '').trim(),
        facultyName: String(x.facultyName ?? '').trim() || String(x.facultyGroup ?? '').trim(),
      })),
      campuses: campuses.map((x) => String(x.campusName ?? '').trim()).filter(Boolean),
      careers: careers.map((x) => String(x.careerName ?? '').trim()).filter(Boolean),
    };
  }

  async getAdminStudentsReport(filter: GradesReportFilter) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const { whereSql, params } = this.buildEnrollmentWhere(periodId, filter);
    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT DISTINCT u.id AS studentId, u.dni AS dni, u.codigoAlumno AS codigoAlumno, u.fullName AS fullName, u.careerName AS careerName
      FROM users u
      INNER JOIN section_student_courses ssc ON ssc.studentId = u.id
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE ${whereSql}
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      params
    );
    return rows.map((x) => ({
      studentId: String(x.studentId),
      dni: String(x.dni ?? ''),
      codigoAlumno: x.codigoAlumno ? String(x.codigoAlumno) : null,
      fullName: String(x.fullName ?? ''),
      careerName: x.careerName ? String(x.careerName) : null,
    }));
  }

  async getAdminAveragesReport(filter: GradesReportFilter) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const students = await this.getAdminStudentsReport(filter);
    if (students.length === 0) return [];

    const scheme = await this.getOrCreateScheme(periodId);
    const activeComponents = this.getActiveComponents(scheme.components);
    if (activeComponents.length === 0) {
      return students.map((student) => ({ ...student, average: 0, approved: 'NO' as const }));
    }

    const studentIds = students.map((x) => x.studentId);
    const studentPlaceholders = studentIds.map(() => '?').join(', ');
    const sectionCourseRows: Array<any> = await this.dataSource.query(
      `
      SELECT ssc.studentId AS studentId, ssc.sectionCourseId AS sectionCourseId
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE ssc.studentId IN (${studentPlaceholders})
        AND ${this.buildSectionOnlyWhere(filter, 's', 'u').whereSql}
        AND sc.periodId = ?
      `,
      [...studentIds, ...this.buildSectionOnlyWhere(filter, 's', 'u').params, periodId]
    );
    if (sectionCourseRows.length === 0) {
      return students.map((student) => ({ ...student, average: 0, approved: 'NO' as const }));
    }

    const sectionCourseIds = Array.from(new Set(sectionCourseRows.map((x) => String(x.sectionCourseId))));
    const scPlaceholders = sectionCourseIds.map(() => '?').join(', ');
    const componentIds = activeComponents.map((x) => x.id);
    const cPlaceholders = componentIds.map(() => '?').join(', ');
    const gradeRows: Array<any> = await this.dataSource.query(
      `
      SELECT g.studentId AS studentId, g.sectionCourseId AS sectionCourseId, g.componentId AS componentId, g.score AS score
      FROM section_course_grades g
      WHERE g.studentId IN (${studentPlaceholders})
        AND g.sectionCourseId IN (${scPlaceholders})
        AND g.componentId IN (${cPlaceholders})
      `,
      [...studentIds, ...sectionCourseIds, ...componentIds]
    );

    const map = new Map<string, number>();
    for (const row of gradeRows) {
      map.set(this.gradeKey(String(row.studentId), String(row.sectionCourseId), String(row.componentId)), Number(row.score ?? 0));
    }

    const byStudent = new Map<string, number[]>();
    for (const row of sectionCourseRows) {
      const studentId = String(row.studentId);
      const sectionCourseId = String(row.sectionCourseId);
      const scores = new Map<string, number>();
      for (const c of activeComponents) {
        const key = this.gradeKey(studentId, sectionCourseId, c.id);
        if (map.has(key)) scores.set(c.id, map.get(key) ?? 0);
      }
      const { finalAverage } = this.computeFinalAverage(activeComponents, scores);
      const list = byStudent.get(studentId) ?? [];
      list.push(finalAverage);
      byStudent.set(studentId, list);
    }

    return students.map((student) => {
      const values = byStudent.get(student.studentId) ?? [];
      const average = values.length ? this.toFixed2(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      return { ...student, average, approved: average >= 11 ? 'SI' : 'NO' };
    });
  }

  async getAdminAttendanceReport(filter: GradesReportFilter) {
    const periodId = await this.periodsService.getOperationalPeriodIdOrThrow();
    const students = await this.getAdminStudentsReport(filter);
    if (students.length === 0) return { dates: [] as string[], rows: [] as any[] };

    const studentIds = students.map((x) => x.studentId);
    const sPlaceholders = studentIds.map(() => '?').join(', ');
    const where = this.buildSectionOnlyWhere(filter, 's', 'u');
    const records: Array<any> = await this.dataSource.query(
      `
      SELECT r.studentId AS studentId, ses.sessionDate AS sessionDate, r.status AS status
      FROM attendance_records r
      INNER JOIN attendance_sessions ses ON ses.id = r.attendanceSessionId
      INNER JOIN schedule_blocks sb ON sb.id = ses.scheduleBlockId
      INNER JOIN section_courses sc ON sc.id = sb.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN users u ON u.id = r.studentId
      WHERE r.studentId IN (${sPlaceholders})
        AND sc.periodId = ?
        AND ${where.whereSql}
      ORDER BY ses.sessionDate ASC
      `,
      [...studentIds, periodId, ...where.params]
    );
    const dates = Array.from(new Set(records.map((x) => this.toIsoDateOnly(x.sessionDate)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const byCell = new Map<string, 'ASISTIO' | 'FALTO'>();
    for (const row of records) {
      const date = this.toIsoDateOnly(row.sessionDate);
      if (!date) continue;
      const key = `${String(row.studentId)}::${date}`;
      const status = this.normalizeAttendanceStatus(row.status);
      if (byCell.get(key) === 'ASISTIO') continue;
      byCell.set(key, status);
    }
    const rows = students.map((student) => {
      const attendanceByDate: Record<string, 'ASISTIO' | 'FALTO' | ''> = {};
      let totalAsistencias = 0;
      for (const date of dates) {
        const status = byCell.get(`${student.studentId}::${date}`) ?? '';
        attendanceByDate[date] = status as any;
        if (status === 'ASISTIO') totalAsistencias += 1;
      }
      return { ...student, attendanceByDate, totalAsistencias };
    });
    return { dates, rows };
  }

  private async getSectionCourseGrades(params: {
    sectionCourseId: string;
    periodId: string;
    actorRole: Role;
    actorUserId: string;
  }) {
    const sectionCourseId = String(params.sectionCourseId ?? '').trim();
    if (!sectionCourseId) {
      throw new BadRequestException('sectionCourseId es requerido');
    }
    const context = await this.getSectionCourseContextOrThrow(sectionCourseId);
    if (context.periodId !== params.periodId) {
      throw new NotFoundException('La seccion-curso no pertenece al periodo actual');
    }
    if (params.actorRole === Role.DOCENTE) {
      await this.assertTeacherAssignmentOrThrow(params.actorUserId, sectionCourseId);
    }
    const scheme = await this.getOrCreateScheme(params.periodId);
    const publication = await this.getOrCreatePublication(sectionCourseId, params.periodId);
    const students = await this.loadEnrolledStudents(sectionCourseId);
    const grades = await this.loadSectionGrades(sectionCourseId);
    const map = new Map<string, number>();
    for (const row of grades) {
      map.set(this.gradeKey(String(row.studentId), sectionCourseId, String(row.componentId)), Number(row.score ?? 0));
    }
    const activeComponents = this.getActiveComponents(scheme.components);
    const resultStudents = students.map((student) => {
      const scores = new Map<string, number>();
      for (const component of activeComponents) {
        const key = this.gradeKey(student.studentId, sectionCourseId, component.id);
        if (map.has(key)) scores.set(component.id, map.get(key) ?? 0);
      }
      const calc = this.computeFinalAverage(activeComponents, scores);
      const rowScores = Object.fromEntries(
        scheme.components.map((component) => {
          const key = this.gradeKey(student.studentId, sectionCourseId, component.id);
          return [component.id, map.has(key) ? this.toFixed2(map.get(key) ?? 0) : null];
        })
      );
      return {
        studentId: student.studentId,
        dni: student.dni,
        codigoAlumno: student.codigoAlumno,
        fullName: student.fullName,
        careerName: student.careerName,
        scores: rowScores,
        finalAverage: calc.finalAverage,
        approved: calc.approved,
      };
    });
    const requiredCells = students.length * activeComponents.length;
    let gradedCells = 0;
    for (const student of students) {
      for (const component of activeComponents) {
        if (map.has(this.gradeKey(student.studentId, sectionCourseId, component.id))) gradedCells += 1;
      }
    }
    return {
      periodId: params.periodId,
      sectionCourse: context,
      scheme: {
        id: scheme.id,
        status: scheme.status,
        components: scheme.components,
      },
      publication: {
        isPublished: publication.isPublished,
        publishedAt: publication.publishedAt,
        publishedBy: publication.publishedBy,
      },
      stats: {
        students: students.length,
        requiredCells,
        gradedCells,
        missingCells: Math.max(requiredCells - gradedCells, 0),
      },
      students: resultStudents,
    };
  }

  private async saveSectionCourseGrades(params: {
    sectionCourseId: string;
    dto: SaveSectionCourseGradesDto;
    actorRole: Role;
    actorUserId: string;
    periodId: string;
  }) {
    const sectionCourseId = String(params.sectionCourseId ?? '').trim();
    const actorUserId = String(params.actorUserId ?? '').trim();
    if (!sectionCourseId || !actorUserId) {
      throw new BadRequestException('sectionCourseId y actorUserId son requeridos');
    }
    const context = await this.getSectionCourseContextOrThrow(sectionCourseId);
    if (context.periodId !== params.periodId) {
      throw new NotFoundException('La seccion-curso no pertenece al periodo actual');
    }
    if (params.actorRole === Role.DOCENTE) {
      await this.assertTeacherAssignmentOrThrow(actorUserId, sectionCourseId);
    }
    const publication = await this.getOrCreatePublication(sectionCourseId, params.periodId);
    if (params.actorRole === Role.DOCENTE && publication.isPublished) {
      throw new BadRequestException('Las notas ya fueron publicadas y no se pueden editar');
    }

    const scheme = await this.getOrCreateScheme(params.periodId);
    const activeComponents = this.getActiveComponents(scheme.components);
    const componentMap = new Map(activeComponents.map((x) => [x.id, x]));
    const students = await this.loadEnrolledStudents(sectionCourseId);
    const studentSet = new Set(students.map((x) => x.studentId));
    const dedup = new Map<string, { studentId: string; componentId: string; score: number }>();

    for (const grade of params.dto.grades ?? []) {
      const studentId = String(grade.studentId ?? '').trim();
      const componentId = String(grade.componentId ?? '').trim();
      if (!studentId || !componentId) continue;
      if (!studentSet.has(studentId)) {
        throw new BadRequestException(`Alumno no matriculado en esta seccion-curso: ${studentId}`);
      }
      const component = componentMap.get(componentId);
      if (!component) {
        throw new BadRequestException(`Componente invalido/inactivo: ${componentId}`);
      }
      const score = this.toFixed2(Number(grade.score ?? 0));
      if (score < component.minScore || score > component.maxScore) {
        throw new BadRequestException(
          `La nota para ${component.code} debe estar entre ${component.minScore} y ${component.maxScore}`
        );
      }
      dedup.set(this.gradeKey(studentId, sectionCourseId, componentId), {
        studentId,
        componentId,
        score,
      });
    }

    for (const row of dedup.values()) {
      await this.dataSource.query(
        `
        INSERT INTO section_course_grades
          (id, sectionCourseId, studentId, componentId, score, updatedBy, createdAt, updatedAt)
        VALUES
          (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE
          score = VALUES(score),
          updatedBy = VALUES(updatedBy),
          updatedAt = CURRENT_TIMESTAMP(6)
        `,
        [randomUUID(), sectionCourseId, row.studentId, row.componentId, row.score, actorUserId]
      );
    }

    return this.getSectionCourseGrades({
      sectionCourseId,
      periodId: params.periodId,
      actorRole: params.actorRole,
      actorUserId,
    });
  }

  private async publishSectionCourseGrades(params: {
    sectionCourseId: string;
    actorRole: Role;
    actorUserId: string;
    periodId: string;
  }) {
    const sectionCourseId = String(params.sectionCourseId ?? '').trim();
    const actorUserId = String(params.actorUserId ?? '').trim();
    if (!sectionCourseId || !actorUserId) {
      throw new BadRequestException('sectionCourseId y actorUserId son requeridos');
    }
    const context = await this.getSectionCourseContextOrThrow(sectionCourseId);
    if (context.periodId !== params.periodId) {
      throw new NotFoundException('La seccion-curso no pertenece al periodo actual');
    }
    if (params.actorRole === Role.DOCENTE) {
      await this.assertTeacherAssignmentOrThrow(actorUserId, sectionCourseId);
    }

    const scheme = await this.getOrCreateScheme(params.periodId);
    const activeComponents = this.getActiveComponents(scheme.components);
    if (activeComponents.length === 0) {
      throw new BadRequestException('No hay componentes activos para publicar');
    }
    const students = await this.loadEnrolledStudents(sectionCourseId);
    const grades = await this.loadSectionGrades(sectionCourseId);
    const map = new Map<string, number>();
    for (const row of grades) {
      map.set(this.gradeKey(String(row.studentId), sectionCourseId, String(row.componentId)), Number(row.score ?? 0));
    }
    const missing: Array<{ studentId: string; studentName: string; componentCode: string }> = [];
    for (const student of students) {
      for (const component of activeComponents) {
        const key = this.gradeKey(student.studentId, sectionCourseId, component.id);
        if (!map.has(key)) {
          missing.push({
            studentId: student.studentId,
            studentName: student.fullName,
            componentCode: component.code,
          });
        }
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'No se puede publicar: faltan notas por alumno/componente',
        missingCount: missing.length,
        missing: missing.slice(0, 200),
      });
    }
    const publication = await this.getOrCreatePublication(sectionCourseId, params.periodId);
    await this.dataSource.query(
      `
      UPDATE section_course_grade_publications
      SET isPublished = 1, publishedAt = CURRENT_TIMESTAMP(6), publishedBy = ?, updatedAt = CURRENT_TIMESTAMP(6)
      WHERE id = ?
      `,
      [actorUserId, publication.id]
    );
    return {
      ok: true,
      sectionCourseId,
      students: students.length,
      components: activeComponents.length,
      publishedAt: this.toIsoDateOnly(new Date()),
    };
  }

  private async getSectionCourseContextOrThrow(sectionCourseId: string) {
    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT sc.id AS sectionCourseId, sc.sectionId AS sectionId, sc.periodId AS periodId,
             sc.courseId AS courseId, c.name AS courseName, s.code AS sectionCode, s.name AS sectionName,
             s.facultyGroup AS facultyGroup, s.facultyName AS facultyName, s.campusName AS campusName, s.modality AS modality
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE sc.id = ?
      LIMIT 1
      `,
      [sectionCourseId]
    );
    const row = rows[0];
    if (!row?.sectionCourseId) throw new NotFoundException('Seccion-curso no encontrada');
    return {
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      periodId: String(row.periodId),
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      sectionName: String(row.sectionName ?? ''),
      facultyGroup: row.facultyGroup ? String(row.facultyGroup) : null,
      facultyName: row.facultyName ? String(row.facultyName) : null,
      campusName: row.campusName ? String(row.campusName) : null,
      modality: row.modality ? String(row.modality) : null,
    };
  }

  private async loadEnrolledStudents(sectionCourseId: string) {
    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT u.id AS studentId, u.dni AS dni, u.codigoAlumno AS codigoAlumno, u.fullName AS fullName, u.careerName AS careerName
      FROM section_student_courses ssc
      INNER JOIN users u ON u.id = ssc.studentId
      WHERE ssc.sectionCourseId = ?
      ORDER BY u.fullName ASC, u.dni ASC
      `,
      [sectionCourseId]
    );
    return rows.map((x) => ({
      studentId: String(x.studentId),
      dni: String(x.dni ?? ''),
      codigoAlumno: x.codigoAlumno ? String(x.codigoAlumno) : null,
      fullName: String(x.fullName ?? ''),
      careerName: x.careerName ? String(x.careerName) : null,
    }));
  }

  private async loadSectionGrades(sectionCourseId: string) {
    return this.dataSource.query(
      `
      SELECT studentId, componentId, score
      FROM section_course_grades
      WHERE sectionCourseId = ?
      `,
      [sectionCourseId]
    );
  }

  private async assertTeacherAssignmentOrThrow(teacherId: string, sectionCourseId: string) {
    const assigned = await this.sectionsService.isTeacherAssignedToSectionCourse({
      teacherId: String(teacherId ?? '').trim(),
      sectionCourseId,
    });
    if (assigned) return;
    throw new BadRequestException('Docente no asignado a esta seccion-curso');
  }

  private async getOrCreatePublication(sectionCourseId: string, periodId: string) {
    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT id, isPublished, publishedAt, publishedBy
      FROM section_course_grade_publications
      WHERE sectionCourseId = ? AND periodId = ?
      LIMIT 1
      `,
      [sectionCourseId, periodId]
    );
    if (rows[0]?.id) {
      return {
        id: String(rows[0].id),
        isPublished: Number(rows[0].isPublished ?? 0) === 1,
        publishedAt: rows[0].publishedAt ? this.toIsoDateOnly(rows[0].publishedAt) : null,
        publishedBy: rows[0].publishedBy ? String(rows[0].publishedBy) : null,
      };
    }
    const id = randomUUID();
    await this.dataSource.query(
      `
      INSERT INTO section_course_grade_publications
        (id, sectionCourseId, periodId, isPublished, publishedAt, publishedBy, createdAt, updatedAt)
      VALUES
        (?, ?, ?, 0, NULL, NULL, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `,
      [id, sectionCourseId, periodId]
    );
    return { id, isPublished: false, publishedAt: null, publishedBy: null };
  }

  private async getOrCreateScheme(periodId: string): Promise<GradeSchemeRow> {
    const rows: Array<any> = await this.dataSource.query(
      `
      SELECT id, periodId, status
      FROM grade_schemes
      WHERE periodId = ?
      LIMIT 1
      `,
      [periodId]
    );
    let id = String(rows[0]?.id ?? '').trim();
    let status: 'DRAFT' | 'LOCKED' = (rows[0]?.status as any) ?? 'DRAFT';
    if (!id) {
      id = randomUUID();
      await this.dataSource.query(
        `
        INSERT INTO grade_schemes (id, periodId, status, createdAt, updatedAt)
        VALUES (?, ?, 'DRAFT', CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        `,
        [id, periodId]
      );
      for (const c of DEFAULT_COMPONENTS) {
        await this.dataSource.query(
          `
          INSERT INTO grade_scheme_components
            (id, schemeId, code, name, weight, orderIndex, minScore, maxScore, isActive, createdAt, updatedAt)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
          `,
          [
            randomUUID(),
            id,
            c.code,
            c.name,
            this.toFixed2(c.weight),
            c.orderIndex,
            this.toFixed2(c.minScore),
            this.toFixed2(c.maxScore),
            c.isActive ? 1 : 0,
          ]
        );
      }
      status = 'DRAFT';
    }
    const components: Array<any> = await this.dataSource.query(
      `
      SELECT id, schemeId, code, name, weight, orderIndex, minScore, maxScore, isActive
      FROM grade_scheme_components
      WHERE schemeId = ?
      ORDER BY orderIndex ASC, code ASC
      `,
      [id]
    );
    return {
      id,
      periodId,
      status,
      components: components.map((x) => ({
        id: String(x.id),
        schemeId: String(x.schemeId),
        code: String(x.code) as GradeComponentCode,
        name: String(x.name ?? ''),
        weight: this.toFixed2(Number(x.weight ?? 0)),
        orderIndex: Number(x.orderIndex ?? 0),
        minScore: this.toFixed2(Number(x.minScore ?? 0)),
        maxScore: this.toFixed2(Number(x.maxScore ?? 20)),
        isActive: Number(x.isActive ?? 0) === 1,
      })),
    };
  }

  private getActiveComponents(components: GradeSchemeComponentRow[]) {
    return components
      .filter((x) => x.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.code.localeCompare(b.code));
  }

  private validateSchemePayload(dto: UpdateGradeSchemeDto) {
    const components = Array.isArray(dto.components) ? dto.components : [];
    if (components.length !== COMPONENT_ORDER.length) {
      throw new BadRequestException('Se requieren 4 componentes de nota');
    }
    const seen = new Set<string>();
    for (const c of components) {
      const code = String(c.code ?? '').trim().toUpperCase();
      if (!COMPONENT_ORDER.includes(code as GradeComponentCode)) {
        throw new BadRequestException(`Componente invalido: ${code}`);
      }
      if (seen.has(code)) {
        throw new BadRequestException(`Componente duplicado: ${code}`);
      }
      seen.add(code);
      if (Number(c.minScore ?? 0) > Number(c.maxScore ?? 20)) {
        throw new BadRequestException(`Rango invalido para ${code}`);
      }
    }
    const sum = this.toFixed2(
      components
        .filter((x) => x.isActive !== false && String(x.code).toUpperCase() !== 'DIAGNOSTICO')
        .reduce((acc, x) => acc + Number(x.weight ?? 0), 0)
    );
    if (sum !== 100) {
      throw new BadRequestException(`La suma de pesos (sin diagnostico) debe ser 100. Actual: ${sum}`);
    }
  }

  private computeFinalAverage(
    components: GradeSchemeComponentRow[],
    scoresByComponentId: Map<string, number>
  ) {
    const weighted = components.filter((x) => x.weight > 0);
    const totalWeight = weighted.reduce((acc, x) => acc + x.weight, 0);
    if (totalWeight <= 0) return { finalAverage: 0, approved: false };
    const weightedSum = weighted.reduce((acc, x) => {
      const score = this.toFixed2(scoresByComponentId.get(x.id) ?? 0);
      return acc + score * x.weight;
    }, 0);
    const finalAverage = this.toFixed2(weightedSum / totalWeight);
    return { finalAverage, approved: finalAverage >= 11 };
  }

  private buildEnrollmentWhere(periodId: string, filter: GradesReportFilter) {
    const where: string[] = ["u.role = 'ALUMNO'", 'sc.periodId = ?'];
    const params: unknown[] = [periodId];
    if (String(filter.facultyGroup ?? '').trim()) {
      where.push('s.facultyGroup = ?');
      params.push(String(filter.facultyGroup).trim());
    }
    if (String(filter.campusName ?? '').trim()) {
      where.push('s.campusName = ?');
      params.push(String(filter.campusName).trim());
    }
    if (String(filter.careerName ?? '').trim()) {
      where.push('u.careerName = ?');
      params.push(String(filter.careerName).trim());
    }
    return { whereSql: where.join(' AND '), params };
  }

  private buildSectionOnlyWhere(filter: GradesReportFilter, sectionAlias: string, userAlias: string) {
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (String(filter.facultyGroup ?? '').trim()) {
      where.push(`${sectionAlias}.facultyGroup = ?`);
      params.push(String(filter.facultyGroup).trim());
    }
    if (String(filter.campusName ?? '').trim()) {
      where.push(`${sectionAlias}.campusName = ?`);
      params.push(String(filter.campusName).trim());
    }
    if (String(filter.careerName ?? '').trim()) {
      where.push(`${userAlias}.careerName = ?`);
      params.push(String(filter.careerName).trim());
    }
    return { whereSql: where.join(' AND '), params };
  }

  private normalizeAttendanceStatus(value: unknown): 'ASISTIO' | 'FALTO' {
    const text = String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
    return text === 'ASISTIO' ? 'ASISTIO' : 'FALTO';
  }

  private gradeKey(studentId: string, sectionCourseId: string, componentId: string) {
    return `${String(studentId)}::${String(sectionCourseId)}::${String(componentId)}`;
  }

  private toIsoDateOnly(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') {
      const text = value.trim();
      const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
      if (direct) return direct[1];
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return text;
      return this.toLocalIsoDate(parsed);
    }
    if (value instanceof Date) return this.toLocalIsoDate(value);
    return String(value);
  }

  private toLocalIsoDate(value: Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toFixed2(value: number) {
    return Math.round(Number(value || 0) * 100) / 100;
  }
}
