import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@uai/shared';
import * as XLSX from 'xlsx';
import { DataSource, In } from 'typeorm';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';

type CourseName =
  | 'COMUNICACION'
  | 'HABILIDADES COMUNICATIVAS'
  | 'MATEMATICA'
  | 'CIENCIA, TECNOLOGIA Y AMBIENTE'
  | 'CIENCIAS SOCIALES';

const COURSE_BY_COLUMN: Record<number, CourseName> = {
  25: 'COMUNICACION', // Z
  26: 'HABILIDADES COMUNICATIVAS', // AA
  27: 'MATEMATICA', // AB
  28: 'CIENCIA, TECNOLOGIA Y AMBIENTE', // AC
  29: 'CIENCIAS SOCIALES', // AD
};

const FICA_NAME = 'INGENIERIA, CIENCIAS Y HUMANIDADES';
const SALUD_NAME = 'CIENCIAS DE LA SALUD';
const HOURS_PER_GROUP = 4;
const PRICE_PER_HOUR = 116;

interface ParsedStudent {
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  careerName: string;
  facultyName: string;
  facultyGroup: 'FICA' | 'SALUD';
  campusName: string;
  campusCode: string;
  modality: 'VIRTUAL' | 'PRESENCIAL';
  modalityChar: 'V' | 'P';
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
}

interface FacultyCourseGroupSummary {
  facultyGroup: string;
  rows: Array<{
    label: string;
    campusName: string;
    modality: string;
    courseGroups: Record<CourseName, number>;
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

@Injectable()
export class LevelingService {
  constructor(private readonly dataSource: DataSource) {}

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

    const careerFacultyMap = await this.loadCareerFacultyMap();
    const parsed = this.parseExcel(params.fileBuffer, careerFacultyMap);
    const sectionCapacity = initialCapacity + maxExtraCapacity;
    const plannedSections = this.buildPlan({
      students: parsed.students,
      sectionCapacity,
      initialCapacity,
      maxExtraCapacity,
    });

    let applied: null | {
      sectionsCreated: number;
      sectionsUpdated: number;
      studentsCreated: number;
      studentsUpdated: number;
      enrollmentsCreated: number;
    } = null;

    if (apply) {
      applied = await this.applyPlan({
        sections: plannedSections,
      });
    }

    const summaryByCourse: Record<CourseName, number> = {
      COMUNICACION: 0,
      'HABILIDADES COMUNICATIVAS': 0,
      MATEMATICA: 0,
      'CIENCIA, TECNOLOGIA Y AMBIENTE': 0,
      'CIENCIAS SOCIALES': 0,
    };
    for (const s of parsed.students) {
      for (const c of s.neededCourses) summaryByCourse[c]++;
    }
    const manualSummary =
      sectionCapacity === 45
        ? this.extractManualSummaryFromExcel(params.fileBuffer)
        : null;
    const courseGroupSummary =
      manualSummary ??
      this.buildCourseGroupSummary({
        students: parsed.students,
        sectionCapacity,
      });

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
      summary: courseGroupSummary,
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
      })),
      applied,
    };
  }

  private parseExcel(
    buffer: Buffer,
    careerFacultyMap: Map<string, string>
  ): {
    rowsRead: number;
    students: ParsedStudent[];
    unknownCareers: string[];
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

    const studentByDni = new Map<string, ParsedStudent>();
    const unknownCareerSet = new Set<string>();
    let rowsRead = 0;

    for (let i = 5; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const orderNumber = this.cell(row, 0);
      if (!orderNumber) continue;
      if (!/^\d+$/.test(orderNumber)) continue;
      rowsRead++;

      const condition = this.norm(this.cell(row, 23)); // X
      const needsLeveling = this.norm(this.cell(row, 24)); // Y
      if (condition !== 'INGRESO') continue;
      if (needsLeveling !== 'SI') continue;

      const dni = this.normalizeDni(this.cell(row, 4));
      if (!dni) continue;
      const codigoAlumno = this.cell(row, 3) || null;
      const fullName = `${this.cell(row, 1)} ${this.cell(row, 2)}`.trim();
      const careerName = this.cell(row, 6);
      const area = this.cell(row, 5);
      const campusRaw = this.cell(row, 10);
      const modalityRaw = this.cell(row, 11);

      const neededCourses = this.extractNeededCourses(row);
      if (neededCourses.length === 0) continue;

      const mappedFaculty = careerFacultyMap.get(this.norm(careerName));
      const facultyName = mappedFaculty ?? this.fallbackFaculty(area);
      if (!mappedFaculty && careerName) {
        unknownCareerSet.add(careerName);
      }

      const facultyGroup = this.facultyGroupOf(facultyName);
      const { campusName, campusCode } = this.normalizeCampus(campusRaw);
      const { modality, modalityChar } = this.normalizeModality(modalityRaw);

      const existing = studentByDni.get(dni);
      if (existing) {
        existing.neededCourses = this.uniqueCourses([
          ...existing.neededCourses,
          ...neededCourses,
        ]);
        continue;
      }

      studentByDni.set(dni, {
        dni,
        codigoAlumno,
        fullName,
        careerName,
        facultyName,
        facultyGroup,
        campusName,
        campusCode,
        modality,
        modalityChar,
        neededCourses,
      });
    }

    return {
      rowsRead,
      students: Array.from(studentByDni.values()),
      unknownCareers: Array.from(unknownCareerSet).sort((a, b) =>
        a.localeCompare(b)
      ),
    };
  }

  private buildPlan(params: {
    students: ParsedStudent[];
    sectionCapacity: number;
    initialCapacity: number;
    maxExtraCapacity: number;
  }): PlannedSection[] {
    const grouped = new Map<string, ParsedStudent[]>();
    for (const s of params.students) {
      const signature = s.neededCourses.slice().sort().join('||');
      const key = [
        s.facultyGroup,
        s.facultyName,
        s.campusName,
        s.campusCode,
        s.modality,
        s.modalityChar,
        signature,
      ].join('::');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    const entries = Array.from(grouped.entries()).sort((a, b) => {
      const byCount = b[1].length - a[1].length;
      return byCount !== 0 ? byCount : a[0].localeCompare(b[0]);
    });

    const sectionIndexByPrefix = new Map<string, number>();
    const plan: PlannedSection[] = [];

    for (const [key, students] of entries) {
      const [
        facultyGroup,
        facultyName,
        campusName,
        campusCode,
        modality,
        modalityChar,
        signature,
      ] = key.split('::');
      const neededCourses = signature
        .split('||')
        .filter(Boolean) as CourseName[];

      const capPerSection = Math.max(1, params.sectionCapacity);
      const sectionsNeeded = Math.max(1, Math.ceil(students.length / capPerSection));

      const prefixKey = `${facultyGroup}|${modality}|${campusCode}`;
      let idx = sectionIndexByPrefix.get(prefixKey) ?? 0;

      for (let i = 0; i < sectionsNeeded; i++) {
        const start = i * capPerSection;
        const end = Math.min(start + capPerSection, students.length);
        const chunk = students.slice(start, end);
        idx += 1;

        const code = `${this.alphaCode(idx)}${modalityChar}${this.facultyChar(
          facultyGroup
        )}-${campusCode}`;

        plan.push({
          code,
          name: code,
          facultyGroup: facultyGroup as 'FICA' | 'SALUD',
          facultyName,
          campusName,
          campusCode,
          modality: modality as 'VIRTUAL' | 'PRESENCIAL',
          neededCourses,
          initialCapacity: params.initialCapacity,
          maxExtraCapacity: params.maxExtraCapacity,
          students: chunk,
        });
      }

      sectionIndexByPrefix.set(prefixKey, idx);
    }

    return plan.sort((a, b) => a.code.localeCompare(b.code));
  }

  private buildCourseGroupSummary(params: {
    students: ParsedStudent[];
    sectionCapacity: number;
  }): CourseGroupSummaryPayload {
    const courseCountsByRow = new Map<
      string,
      {
        facultyGroup: string;
        campusName: string;
        modality: string;
        courseCounts: Record<CourseName, number>;
      }
    >();

    for (const student of params.students) {
      const shortCampus = this.shortCampus(student.campusName);
      const campusGroup = shortCampus === 'CHINCHA' ? 'CHINCHA' : 'ICA / HUAURA';
      const rowKey = `${student.facultyGroup}::${campusGroup}::${student.modality}`;
      if (!courseCountsByRow.has(rowKey)) {
        courseCountsByRow.set(rowKey, {
          facultyGroup: student.facultyGroup,
          campusName: campusGroup,
          modality: student.modality,
          courseCounts: {
            COMUNICACION: 0,
            'HABILIDADES COMUNICATIVAS': 0,
            MATEMATICA: 0,
            'CIENCIA, TECNOLOGIA Y AMBIENTE': 0,
            'CIENCIAS SOCIALES': 0,
          },
        });
      }

      const row = courseCountsByRow.get(rowKey)!;
      for (const course of student.neededCourses) {
        row.courseCounts[course] += 1;
      }
    }

    const groupedByFaculty = new Map<string, FacultyCourseGroupSummary>();
    const divisor = Math.max(1, params.sectionCapacity);

    for (const row of courseCountsByRow.values()) {
      if (!groupedByFaculty.has(row.facultyGroup)) {
        groupedByFaculty.set(row.facultyGroup, {
          facultyGroup: row.facultyGroup,
          rows: [],
          totalGroups: 0,
          totalHours: 0,
          totalPay4Weeks: 0,
        });
      }
      const faculty = groupedByFaculty.get(row.facultyGroup)!;

      const courseGroups: Record<CourseName, number> = {
        COMUNICACION: Math.ceil(row.courseCounts.COMUNICACION / divisor),
        'HABILIDADES COMUNICATIVAS': Math.ceil(
          row.courseCounts['HABILIDADES COMUNICATIVAS'] / divisor
        ),
        MATEMATICA: Math.ceil(row.courseCounts.MATEMATICA / divisor),
        'CIENCIA, TECNOLOGIA Y AMBIENTE': Math.ceil(
          row.courseCounts['CIENCIA, TECNOLOGIA Y AMBIENTE'] / divisor
        ),
        'CIENCIAS SOCIALES': Math.ceil(row.courseCounts['CIENCIAS SOCIALES'] / divisor),
      };

      const totalGroups =
        courseGroups.COMUNICACION +
        courseGroups['HABILIDADES COMUNICATIVAS'] +
        courseGroups.MATEMATICA +
        courseGroups['CIENCIA, TECNOLOGIA Y AMBIENTE'] +
        courseGroups['CIENCIAS SOCIALES'];

      faculty.rows.push({
        label: `${this.shortCampus(row.campusName)} - ${row.modality}`,
        campusName: row.campusName,
        modality: row.modality,
        courseGroups,
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

    const totalPay4Weeks = byFaculty.reduce((acc, item) => acc + item.totalPay4Weeks, 0);

    return {
      hoursPerGroup: HOURS_PER_GROUP,
      pricePerHour: PRICE_PER_HOUR,
      totalPay4Weeks,
      byFaculty,
    };
  }

  private extractManualSummaryFromExcel(buffer: Buffer): CourseGroupSummaryPayload | null {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return null;

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    const fica = this.extractManualFacultySummary(rows, 'GRUPOS FICA', 'FICA');
    const salud = this.extractManualFacultySummary(rows, 'GRUPOS SALUD', 'SALUD');
    const byFaculty = [fica, salud].filter(Boolean) as FacultyCourseGroupSummary[];
    if (byFaculty.length === 0) return null;

    const totalPayFromExcel = this.extractManualTotalPay(rows);
    const totalPay4Weeks =
      totalPayFromExcel ??
      byFaculty.reduce((acc, faculty) => acc + faculty.totalPay4Weeks, 0);

    return {
      hoursPerGroup: HOURS_PER_GROUP,
      pricePerHour: PRICE_PER_HOUR,
      totalPay4Weeks,
      byFaculty,
    };
  }

  private extractManualFacultySummary(
    rows: (string | number | null)[][],
    title: string,
    facultyGroup: 'FICA' | 'SALUD'
  ): FacultyCourseGroupSummary | null {
    const COL_AH = 33;
    const COL_AI = 34;
    const COL_AJ = 35;
    const COL_AK = 36;
    const COL_AL = 37;
    const COL_AM = 38;
    const COL_AN = 39;

    const titleIdx = rows.findIndex((row) => this.norm(this.cell(row ?? [], COL_AH)) === title);
    if (titleIdx < 0) return null;

    const out: FacultyCourseGroupSummary = {
      facultyGroup,
      rows: [],
      totalGroups: 0,
      totalHours: 0,
      totalPay4Weeks: 0,
    };

    for (let r = titleIdx; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const stopMarker = this.norm(this.cell(row, COL_AM));
      if (r > titleIdx && stopMarker === 'TOTAL DE GRUPOS') {
        break;
      }

      const label = this.cell(row, COL_AI);
      if (!label) continue;

      const courseGroups: Record<CourseName, number> = {
        COMUNICACION: this.asNonNegativeInt(this.cell(row, COL_AJ)),
        'HABILIDADES COMUNICATIVAS': this.asNonNegativeInt(this.cell(row, COL_AK)),
        MATEMATICA: this.asNonNegativeInt(this.cell(row, COL_AL)),
        'CIENCIA, TECNOLOGIA Y AMBIENTE': this.asNonNegativeInt(this.cell(row, COL_AM)),
        'CIENCIAS SOCIALES': this.asNonNegativeInt(this.cell(row, COL_AN)),
      };

      const totalGroups =
        courseGroups.COMUNICACION +
        courseGroups['HABILIDADES COMUNICATIVAS'] +
        courseGroups.MATEMATICA +
        courseGroups['CIENCIA, TECNOLOGIA Y AMBIENTE'] +
        courseGroups['CIENCIAS SOCIALES'];

      out.rows.push({
        label,
        campusName: this.campusFromLabel(label),
        modality: this.modalityFromLabel(label),
        courseGroups,
        totalGroups,
      });
      out.totalGroups += totalGroups;
    }

    if (out.rows.length === 0) return null;

    out.totalHours = out.totalGroups * HOURS_PER_GROUP;
    out.totalPay4Weeks = out.totalHours * PRICE_PER_HOUR;
    return out;
  }

  private extractManualTotalPay(rows: (string | number | null)[][]): number | null {
    const COL_AM = 38;
    const COL_AO = 40;
    const idx = rows.findIndex(
      (row) => this.norm(this.cell(row ?? [], COL_AM)) === 'TOTAL DE NIVELACION'
    );
    if (idx < 0) return null;
    const pay = this.asNonNegativeInt(this.cell(rows[idx] ?? [], COL_AO));
    return pay > 0 ? pay : null;
  }

  private async applyPlan(params: { sections: PlannedSection[] }) {
    return this.dataSource.transaction(async (manager) => {
      const usersRepo = manager.getRepository(UserEntity);
      const sectionsRepo = manager.getRepository(SectionEntity);
      const enrollmentsRepo = manager.getRepository(EnrollmentEntity);

      const uniqueByDni = new Map<string, ParsedStudent>();
      for (const section of params.sections) {
        for (const s of section.students) uniqueByDni.set(s.dni, s);
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
        const saved = await sectionsRepo.save(existing);
        sectionByCode.set(s.code, saved);
        sectionsUpdated++;
      }

      const studentIds = Array.from(studentByDni.values()).map((u) => u.id);
      if (studentIds.length > 0) {
        await enrollmentsRepo
          .createQueryBuilder()
          .delete()
          .from(EnrollmentEntity)
          .where('studentId IN (:...studentIds)', { studentIds })
          .execute();
      }

      const enrollmentRows: EnrollmentEntity[] = [];
      for (const sec of params.sections) {
        const section = sectionByCode.get(sec.code);
        if (!section) continue;

        for (const stu of sec.students) {
          const user = studentByDni.get(stu.dni);
          if (!user) continue;
          enrollmentRows.push(
            enrollmentsRepo.create({
              section,
              student: user,
            } as EnrollmentEntity)
          );
        }
      }
      if (enrollmentRows.length > 0) {
        await enrollmentsRepo.save(enrollmentRows);
      }

      return {
        sectionsCreated,
        sectionsUpdated,
        studentsCreated,
        studentsUpdated,
        enrollmentsCreated: enrollmentRows.length,
      };
    });
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

  private extractNeededCourses(row: (string | number | null)[]) {
    const out: CourseName[] = [];
    for (const [idxRaw, courseName] of Object.entries(COURSE_BY_COLUMN)) {
      const idx = Number(idxRaw);
      if (this.hasCourseNeed(this.cell(row, idx))) {
        out.push(courseName);
      }
    }
    return out;
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

  private campusSort(campusName: string) {
    const short = this.shortCampus(campusName);
    if (short === 'CHINCHA') return 0;
    if (short === 'ICA') return 1;
    if (short === 'HUAURA') return 2;
    return 10;
  }

  private modalitySort(modality: string) {
    return this.norm(modality).includes('PRESENCIAL') ? 0 : 1;
  }

  private normalizeModality(raw: string) {
    const n = this.norm(raw);
    if (n.includes('PRESENCIAL')) {
      return { modality: 'PRESENCIAL' as const, modalityChar: 'P' as const };
    }
    return { modality: 'VIRTUAL' as const, modalityChar: 'V' as const };
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

  private norm(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private asNonNegativeInt(value: string) {
    if (!value) return 0;
    const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  private campusFromLabel(label: string) {
    const parts = label.split('-');
    return parts[0]?.trim() || label.trim();
  }

  private modalityFromLabel(label: string) {
    const n = this.norm(label);
    if (n.includes('PRESENCIAL')) return 'PRESENCIAL';
    if (n.includes('VIRTUAL')) return 'VIRTUAL';
    return '';
  }
}
