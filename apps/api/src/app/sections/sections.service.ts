import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

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
      INNER JOIN section_student_courses ssc
        ON ssc.sectionCourseId = scf.id
      WHERE s.facultyGroup = ?
        AND s.campusName = ?
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
      HAVING COUNT(DISTINCT ssc.studentId) > 0
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC
      `,
      [course.id, activePeriodId, facultyGroup, campusName]
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

  async listFacultyFilters() {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
    const rows: Array<{ facultyGroup: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT s.facultyGroup AS facultyGroup
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      INNER JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
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
      INNER JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND s.facultyGroup = ?
        AND s.campusName IS NOT NULL
        AND s.campusName <> ''
      `,
      [activePeriodId, fg]
    );

    return rows
      .map((x) => String(x.campusName || '').trim())
      .filter(Boolean)
      .sort((a, b) => {
        const cmp = this.campusSort(a) - this.campusSort(b);
        return cmp !== 0 ? cmp : a.localeCompare(b);
      });
  }

  async listCourseFilters(params: { facultyGroup: string; campusName: string }) {
    const activePeriodId = await this.periodsService.getActivePeriodIdOrThrow();
    const fg = params.facultyGroup.trim();
    const campus = params.campusName.trim();
    const rows: Array<{ courseName: string }> = await this.sectionsRepo.manager.query(
      `
      SELECT DISTINCT c.name AS courseName
      FROM sections s
      INNER JOIN section_courses sc ON sc.sectionId = s.id
      INNER JOIN courses c ON c.id = sc.courseId
      INNER JOIN section_student_courses ssc ON ssc.sectionCourseId = sc.id
      WHERE sc.periodId = ?
        AND s.facultyGroup = ?
        AND s.campusName = ?
      ORDER BY c.name ASC
      `,
      [activePeriodId, fg, campus]
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
    return 10;
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
}
