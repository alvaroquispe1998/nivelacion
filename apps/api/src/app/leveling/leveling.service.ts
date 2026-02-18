import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Role } from '@uai/shared';
import * as XLSX from 'xlsx';
import { DataSource, EntityManager, In } from 'typeorm';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';

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
const FIRST_COURSE_COLUMN_INDEX = 11; // L

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

interface ApplyPlanResult {
  sectionsCreated: number;
  sectionsUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  sectionCoursesCreated: number;
  sectionCoursesOmitted: number;
  sectionStudentCoursesCreated: number;
  sectionStudentCoursesOmitted: number;
  enrollmentsCreated: number;
  enrollmentsOmitted: number;
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
  courseColumns: Array<{ idx: number; courseName: CourseName }>;
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
    groupModalityOverrides?: string;
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

    let applied: null | ApplyPlanResult = null;

    if (apply) {
      applied = await this.applyPlan({
        sections: plannedSections,
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
      applied,
    };
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

    const studentByDni = new Map<string, ParsedStudent>();
    const unknownCareerSet = new Set<string>();
    const activeCourseNames = new Set<CourseName>();
    let rowsRead = 0;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (row.every((value) => !String(value ?? '').trim())) continue;

      if (columns.orderIdx !== null) {
        const orderNumber = this.cell(row, columns.orderIdx);
        if (!orderNumber || !/^\d+$/.test(orderNumber)) continue;
      }
      rowsRead++;

      if (hasIngresoFilter) {
        const condition = this.norm(this.cell(row, columns.conditionIdx!));
        const needsLeveling = this.norm(this.cell(row, columns.needsLevelingIdx!));
        if (condition !== 'INGRESO') continue;
        if (needsLeveling !== 'SI') continue;
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


  private async applyPlan(params: { sections: PlannedSection[] }): Promise<ApplyPlanResult> {
    return this.dataSource.transaction(async (manager) => {
      const usersRepo = manager.getRepository(UserEntity);
      const sectionsRepo = manager.getRepository(SectionEntity);
      const courseIdByName = await this.loadCourseIdByCanonicalName(manager);
      const activePeriodId = await this.loadActivePeriodIdOrThrow(manager);

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

      const sectionStudentCourseCandidates = new Map<
        string,
        {
          id: string;
          sectionCourseId: string;
          sectionId: string;
          courseId: string;
          studentId: string;
        }
      >();
      for (const sec of params.sections) {
        const section = sectionByCode.get(sec.code);
        if (!section) continue;
        for (const [dni, courses] of sec.studentCoursesByDni.entries()) {
          const user = studentByDni.get(dni);
          if (!user) continue;
          for (const courseName of courses) {
            const courseId = courseIdByName.get(this.courseKey(courseName));
            if (!courseId) continue;
            const sectionCourseId = sectionCourseIdByKey.get(`${section.id}:${courseId}`);
            if (!sectionCourseId) {
              throw new BadRequestException(
                `Section-course relation was not created for section ${section.code} and course ${courseName}`
              );
            }
            const key = `${sectionCourseId}:${user.id}`;
            if (!sectionStudentCourseCandidates.has(key)) {
              sectionStudentCourseCandidates.set(key, {
                id: randomUUID(),
                sectionCourseId,
                sectionId: section.id,
                courseId,
                studentId: user.id,
              });
            }
          }
        }
      }

      const sectionCourseIds = Array.from(sectionCourseIdByKey.values());
      const existingSectionStudentCourseKeys =
        await this.loadExistingSectionStudentCourseKeys(manager, sectionCourseIds);
      const sectionStudentCourseRowsToInsert = Array.from(
        sectionStudentCourseCandidates.entries()
      )
        .filter(([key]) => !existingSectionStudentCourseKeys.has(key))
        .map(([, row]) => row);
      await this.bulkInsertSectionStudentCoursesIgnore(
        manager,
        sectionStudentCourseRowsToInsert
      );

      return {
        sectionsCreated,
        sectionsUpdated,
        studentsCreated,
        studentsUpdated,
        sectionCoursesCreated: sectionCourseRowsToInsert.length,
        sectionCoursesOmitted:
          sectionCourseCandidates.size - sectionCourseRowsToInsert.length,
        sectionStudentCoursesCreated: sectionStudentCourseRowsToInsert.length,
        sectionStudentCoursesOmitted:
          sectionStudentCourseCandidates.size - sectionStudentCourseRowsToInsert.length,
        // Legacy counters kept for API compatibility.
        enrollmentsCreated: 0,
        enrollmentsOmitted: 0,
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

  private async loadExistingSectionStudentCourseKeys(
    manager: EntityManager,
    sectionCourseIds: string[]
  ) {
    if (sectionCourseIds.length === 0) return new Set<string>();
    const placeholders = sectionCourseIds.map(() => '?').join(', ');
    const rows: Array<{ sectionCourseId: string; studentId: string }> =
      await manager.query(
        `
      SELECT sectionCourseId, studentId
      FROM section_student_courses
      WHERE sectionCourseId IN (${placeholders})
      `,
        sectionCourseIds
      );
    return new Set(rows.map((x) => `${x.sectionCourseId}:${String(x.studentId)}`));
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
      campusIdx: pick('SEDE', 'FILIAL', 'CAMPUS'),
      modalityIdx: pick('MODALIDAD'),
      conditionIdx: pick('CONDICION'),
      needsLevelingIdx: pick('REQUERIMIENTO DE NIVELACION', 'NIVELACION'),
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
}
