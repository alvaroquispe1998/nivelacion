import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
import * as XLSX from 'xlsx';
import { Repository } from 'typeorm';
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
    @InjectRepository(SectionCourseTeacherEntity)
    private readonly sectionCourseTeachersRepo: Repository<SectionCourseTeacherEntity>,
    private readonly periodsService: PeriodsService
  ) { }

  async list(): Promise<Array<{ section: SectionEntity; studentCount: number }>> {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
  }): Promise<Array<{ section: SectionEntity; studentCount: number }>> {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
        s.initialCapacity AS initialCapacity,
        s.maxExtraCapacity AS maxExtraCapacity,
        s.isAutoLeveling AS isAutoLeveling,
        s.createdAt AS createdAt,
        s.updatedAt AS updatedAt,
        COALESCE(tc.id, ts.id) AS teacherId,
        COALESCE(tc.dni, ts.dni) AS teacherDni,
        COALESCE(tc.fullName, ts.fullName) AS teacherName,
        COUNT(DISTINCT ssc.studentId) AS studentCount
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
      LEFT JOIN section_student_courses ssc
        ON ssc.sectionCourseId = scf.id
      WHERE s.facultyGroup = ?
        AND (
          (? = 1 AND UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%')
          OR (? = 0 AND s.campusName = ?)
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
        ts.fullName
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

    return rows.map((row) => ({
      section: this.sectionsRepo.create({
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
      }),
      studentCount: Number(row.studentCount || 0),
    }));
  }

  async listScheduleConflicts(params?: {
    facultyGroup?: string;
    campusName?: string;
    courseName?: string;
    studentCode?: string;
  }) {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
        s.initialCapacity AS initialCapacity,
        s.maxExtraCapacity AS maxExtraCapacity,
        COUNT(DISTINCT ssc.studentId) AS currentStudents
      FROM section_courses sc
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      LEFT JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND sc.courseId = ?
        AND sc.id <> ?
        AND COALESCE(s.facultyGroup, '') = COALESCE(?, '')
        AND COALESCE(s.campusName, '') = COALESCE(?, '')
        AND UPPER(COALESCE(s.modality, '')) = UPPER(COALESCE(?, ''))
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
        s.initialCapacity,
        s.maxExtraCapacity
      ORDER BY s.code ASC, s.name ASC
      `,
      [
        activePeriodId,
        fromMembership.courseId,
        fromMembership.sectionCourseId,
        fromMembership.facultyGroup,
        fromMembership.campusName,
        fromMembership.modality,
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
      const overCapacity = this.isOverCapacity({
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
  }) {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
      throw new BadRequestException('Origin and target section-course are the same');
    }
    if (fromMembership.courseId !== toSectionCourse.courseId) {
      throw new BadRequestException('Target section-course must belong to the same course');
    }
    if (!this.isSameScope(fromMembership, toSectionCourse)) {
      throw new BadRequestException(
        'Target section-course must be in the same faculty, campus and modality'
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
      throw new BadRequestException('Student is already assigned to target section-course');
    }

    const createsConflict = await this.candidateCreatesConflict({
      studentId: params.studentId,
      candidateSectionCourseId: toSectionCourse.sectionCourseId,
      excludeSectionCourseId: fromMembership.sectionCourseId,
      periodId: activePeriodId,
    });
    if (createsConflict) {
      throw new ConflictException(
        'Target section-course creates schedule conflicts for this student'
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
    const overCapacity = this.isOverCapacity({
      initialCapacity: toSectionCourse.initialCapacity,
      maxExtraCapacity: toSectionCourse.maxExtraCapacity,
      projectedStudents,
    });

    if (overCapacity && !params.confirmOverCapacity) {
      throw new ConflictException(
        'Target section-course exceeds capacity. Confirm over-capacity to continue.'
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
          OR (? = 0 AND s.campusName = ?)
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
      if (!teacher) throw new NotFoundException('Teacher not found');
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

  async getByIdOrThrow(id: string): Promise<SectionEntity> {
    const section = await this.sectionsRepo.findOne({
      where: { id },
      relations: { teacher: true },
    });
    if (!section) throw new NotFoundException('Section not found');
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
    if (!teacher) throw new NotFoundException('Teacher not found');
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
      throw new BadRequestException(`Course not found: ${params.courseName}`);
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
    if (!teacher) throw new NotFoundException('Teacher not found');

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

  async listStudents(sectionId: string, courseName?: string) {
    await this.getByIdOrThrow(sectionId);
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
    const normalizedCourse = String(courseName || '').trim();
    if (!normalizedCourse) {
      const rows: Array<{
        id: string;
        dni: string;
        codigoAlumno: string | null;
        fullName: string;
      }> = await this.sectionsRepo.manager.query(
        `
        SELECT
          DISTINCT u.id AS id,
          u.dni AS dni,
          u.codigoAlumno AS codigoAlumno,
          u.fullName AS fullName
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
      throw new BadRequestException(`Course not found: ${normalizedCourse}`);
    }

    const rows: Array<{
      id: string;
      dni: string;
      codigoAlumno: string | null;
      fullName: string;
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        u.id AS id,
        u.dni AS dni,
        u.codigoAlumno AS codigoAlumno,
        u.fullName AS fullName
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
    }));
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
    }> = await this.sectionsRepo.manager.query(
      `
      SELECT
        sc.id AS id,
        sc.sectionId AS sectionId,
        sc.courseId AS courseId,
        c.name AS courseName
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
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
    };
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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

  async listAssignedSectionCoursesForExport() {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
    const rows: Array<{
      codigoAlumno: string | null;
      names: string | null;
      paternalLastName: string | null;
      maternalLastName: string | null;
      email: string | null;
      sex: string | null;
      fullName: string;
      dni: string;
      teacherName: string;
      courseId: string;
      courseAkademicId: string | null;
      courseName: string;
      sectionCode: string | null;
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
        t.fullName AS teacherName,
        c.id AS courseId,
        c.idakademic AS courseAkademicId,
        c.name AS courseName,
        s.code AS sectionCode,
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

    const templateRows = rows.map((row) => {
      const parts = this.splitStudentName(row.fullName);
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
        Docente: String(row.teacherName ?? ''),
        'Id Curso': row.courseAkademicId ? String(row.courseAkademicId) : String(row.courseId),
        'Nombre Curso': String(row.courseName ?? ''),
        'Codigo Curso': String(row.courseId ?? ''),
        'Codigo Seccion': row.sectionCode ? String(row.sectionCode) : '',
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
        s.initialCapacity AS initialCapacity,
        s.maxExtraCapacity AS maxExtraCapacity
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
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
        'Student is not assigned to the provided origin section-course in active period'
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
        s.initialCapacity AS initialCapacity,
        s.maxExtraCapacity AS maxExtraCapacity
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN sections s ON s.id = sc.sectionId
      WHERE sc.id = ?
        AND sc.periodId = ?
      LIMIT 1
      `,
      [params.sectionCourseId, params.periodId]
    );
    const row = rows[0];
    if (!row?.sectionCourseId) {
      throw new BadRequestException('Target section-course is not part of active period');
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
    };
  }

  private isSameScope(
    a: { facultyGroup: string | null; campusName: string | null; modality: string | null },
    b: { facultyGroup: string | null; campusName: string | null; modality: string | null }
  ) {
    return (
      this.scopeKey(a.facultyGroup) === this.scopeKey(b.facultyGroup) &&
      this.scopeKey(a.campusName) === this.scopeKey(b.campusName) &&
      this.scopeKey(a.modality) === this.scopeKey(b.modality)
    );
  }

  private scopeKey(value: string | null | undefined) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private isOverCapacity(params: {
    initialCapacity: number;
    maxExtraCapacity: number;
    projectedStudents: number;
  }) {
    const initialCapacity = Math.max(0, Number(params.initialCapacity ?? 0));
    const maxExtraCapacity = Math.max(0, Number(params.maxExtraCapacity ?? 0));
    const projectedStudents = Math.max(0, Number(params.projectedStudents ?? 0));

    // Legacy behavior in this app: maxExtraCapacity=0 means no hard upper bound.
    if (maxExtraCapacity <= 0) return false;
    return projectedStudents > initialCapacity + maxExtraCapacity;
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
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
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
        `Section-course relation not found for section ${sectionId} and course ${courseId}`
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
}
