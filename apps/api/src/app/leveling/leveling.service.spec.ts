jest.mock('../sections/section.entity', () => ({
  SectionEntity: class SectionEntity {},
}));
jest.mock('../users/user.entity', () => ({
  UserEntity: class UserEntity {},
}));

import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { LevelingService } from './leveling.service';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';

describe('LevelingService', () => {
  it('buildCourseGroupSummary should collapse non-welcome virtual groups and exclude welcome from totals', () => {
    const service = new LevelingService({} as DataSource, {} as any);

    const summary = (service as any).buildCourseGroupSummary({
      groupUnits: [
        {
          id: 'FICA|CHINCHA|MATEMATICA|1',
          facultyGroup: 'FICA',
          campusName: 'CHINCHA',
          courseName: 'MATEMATICA',
          size: 48,
          modality: 'PRESENCIAL',
        },
        {
          id: 'FICA|ICA|MATEMATICA|1',
          facultyGroup: 'FICA',
          campusName: 'ICA',
          courseName: 'MATEMATICA',
          size: 13,
          modality: 'VIRTUAL',
        },
        {
          id: 'FICA|HUAURA|MATEMATICA|1',
          facultyGroup: 'FICA',
          campusName: 'HUAURA',
          courseName: 'MATEMATICA',
          size: 16,
          modality: 'VIRTUAL',
        },
        {
          id: 'GENERAL|VIRTUAL|BIENVENIDA UAI|WELCOME|1',
          facultyGroup: 'GENERAL',
          campusName: 'VIRTUAL',
          courseName: 'BIENVENIDA UAI',
          size: 20,
          modality: 'VIRTUAL',
        },
        {
          id: 'GENERAL|VIRTUAL|BIENVENIDA UAI|WELCOME|2',
          facultyGroup: 'GENERAL',
          campusName: 'VIRTUAL',
          courseName: 'BIENVENIDA UAI',
          size: 25,
          modality: 'VIRTUAL',
        },
      ],
      courseNames: ['MATEMATICA', 'BIENVENIDA UAI'],
    });

    const ficaVirtual = summary.byFaculty
      .find((faculty: any) => faculty.facultyGroup === 'FICA')
      ?.rows.find((row: any) => row.label === 'VIRTUAL');
    expect(ficaVirtual?.courseGroups['MATEMATICA']).toBe(1);
    expect(ficaVirtual?.courseGroupSizes['MATEMATICA']).toEqual([29]);
    expect(ficaVirtual?.totalGroups).toBe(1);
    expect(summary.byFaculty.some((faculty: any) => faculty.facultyGroup === 'GENERAL')).toBe(false);
    expect(summary.totalPay4Weeks).toBe(928);
  });

  it('applyPlan should be idempotent and should not run mass deletes', async () => {
    const usersByDni = new Map<string, any>();
    const sectionsByCode = new Map<string, any>();
    const sectionCourses = new Map<string, { id: string; periodId: string; sectionId: string; courseId: string }>();
    const sectionStudentCourses = new Set<string>();
    const runDemands = new Set<string>();
    const queries: string[] = [];

    let userSeq = 0;
    let sectionSeq = 0;

    const usersRepo = {
      find: jest.fn(async (opts: any) => {
        const dnis: string[] = opts?.where?.dni?._value ?? [];
        return dnis
          .map((dni) => usersByDni.get(dni))
          .filter((x): x is any => Boolean(x));
      }),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x: any) => {
        const saved = { id: x.id ?? `usr-${++userSeq}`, ...x };
        usersByDni.set(saved.dni, saved);
        return saved;
      }),
    };

    const sectionsRepo = {
      find: jest.fn(async (opts: any) => {
        const codes: string[] = opts?.where?.code?._value ?? [];
        return codes
          .map((code) => sectionsByCode.get(code))
          .filter((x): x is any => Boolean(x));
      }),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x: any) => {
        const saved = { id: x.id ?? `sec-${++sectionSeq}`, ...x };
        sectionsByCode.set(saved.code, saved);
        return saved;
      }),
    };

    const manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === UserEntity) return usersRepo;
        if (entity === SectionEntity) return sectionsRepo;
        throw new Error('Unexpected repository request');
      }),
      query: jest.fn(async (sql: string, params: Array<string | number> = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        queries.push(normalized);

        if (normalized.includes('SELECT ID, NAME FROM COURSES')) {
          return [
            { id: 1, name: 'COMUNICACION' },
            { id: 2, name: 'HABILIDADES COMUNICATIVAS' },
            { id: 3, name: 'MATEMATICA' },
            { id: 4, name: 'CIENCIA, TECNOLOGIA Y AMBIENTE' },
            { id: 5, name: 'CIENCIAS SOCIALES' },
          ];
        }

        if (normalized.includes('SELECT ID FROM PERIODS')) {
          return [{ id: 'period-1' }];
        }

        if (normalized.includes('UPDATE LEVELING_RUNS SET STATUS = \'ARCHIVED\'')) {
          return;
        }

        if (normalized.includes('INSERT INTO LEVELING_RUNS')) {
          return;
        }

        if (normalized.includes('SELECT PERIODID, SECTIONID, COURSEID FROM SECTION_COURSES')) {
          const periodId = String(params[params.length - 1]);
          const sectionIds = params.slice(0, -1).map((x) => String(x));
          return Array.from(sectionCourses.values())
            .filter((row) => row.periodId === periodId && sectionIds.includes(row.sectionId))
            .map((row) => ({
              periodId: row.periodId,
              sectionId: row.sectionId,
              courseId: row.courseId,
            }));
        }

        if (normalized.includes('SELECT ID, SECTIONID, COURSEID FROM SECTION_COURSES')) {
          const periodId = String(params[params.length - 1]);
          const sectionIds = params.slice(0, -1).map((x) => String(x));
          return Array.from(sectionCourses.values())
            .filter((row) => row.periodId === periodId && sectionIds.includes(row.sectionId))
            .map((row) => ({
              id: row.id,
              sectionId: row.sectionId,
              courseId: row.courseId,
            }));
        }

        if (normalized.includes('SELECT SECTIONCOURSEID, STUDENTID FROM SECTION_STUDENT_COURSES')) {
          const sectionCourseIds = params.map((x) => String(x));
          return Array.from(sectionStudentCourses)
            .map((key) => {
              const [sectionCourseId, studentId] = key.split(':');
              return { sectionCourseId, studentId };
            })
            .filter((row) => sectionCourseIds.includes(row.sectionCourseId));
        }

        if (normalized.includes('INSERT IGNORE INTO SECTION_COURSES')) {
          for (let i = 0; i < params.length; i += 5) {
            const id = String(params[i]);
            const periodId = String(params[i + 1]);
            const sectionId = String(params[i + 2]);
            const courseId = String(params[i + 3]);
            sectionCourses.set(`${periodId}:${sectionId}:${courseId}`, {
              id,
              periodId,
              sectionId,
              courseId,
            });
          }
          return;
        }

        if (normalized.includes('INSERT IGNORE INTO SECTION_STUDENT_COURSES')) {
          for (let i = 0; i < params.length; i += 5) {
            const sectionCourseId = String(params[i + 1]);
            const studentId = String(params[i + 4]);
            sectionStudentCourses.add(`${sectionCourseId}:${studentId}`);
          }
          return;
        }

        if (normalized.includes('DELETE FROM SECTION_STUDENT_COURSES WHERE SECTIONCOURSEID IN')) {
          const sectionCourseIds = params.map((x) => String(x));
          for (const key of Array.from(sectionStudentCourses)) {
            const [sectionCourseId] = key.split(':');
            if (sectionCourseIds.includes(sectionCourseId)) {
              sectionStudentCourses.delete(key);
            }
          }
          return;
        }

        if (
          normalized.includes(
            'SELECT RUNID, STUDENTID, COURSEID FROM LEVELING_RUN_STUDENT_COURSE_DEMANDS'
          )
        ) {
          const runId = String(params[0] ?? '');
          return Array.from(runDemands)
            .map((key) => {
              const [runIdKey, studentId, courseId] = key.split(':');
              return { runId: runIdKey, studentId, courseId };
            })
            .filter((row) => row.runId === runId);
        }

        if (normalized.includes('INSERT IGNORE INTO LEVELING_RUN_STUDENT_COURSE_DEMANDS')) {
          for (let i = 0; i < params.length; i += 7) {
            const runId = String(params[i + 1]);
            const studentId = String(params[i + 2]);
            const courseId = String(params[i + 3]);
            runDemands.add(`${runId}:${studentId}:${courseId}`);
          }
          return;
        }

        throw new Error(`Unexpected SQL in test: ${normalized}`);
      }),
    };

    const dataSource = {
      transaction: async (cb: any) => cb(manager),
    } as DataSource;

    const service = new LevelingService(dataSource, {
      getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1'),
    } as any);

    const student = {
      dni: '11111111',
      codigoAlumno: null,
      fullName: 'Alumno Uno',
      careerName: 'Carrera',
      facultyName: 'Facultad',
      facultyGroup: 'FICA' as const,
      campusName: 'FILIAL ICA',
      campusCode: 'IC',
      modality: 'PRESENCIAL' as const,
      modalityChar: 'P' as const,
      sourceModality: 'PRESENCIAL' as const,
      neededCourses: ['COMUNICACION'] as const,
    };
    const plannedSection = {
      code: 'A1',
      name: 'A1',
      facultyName: 'Facultad',
      facultyGroup: 'FICA' as const,
      campusName: 'FILIAL ICA',
      campusCode: 'IC',
      modality: 'PRESENCIAL' as const,
      neededCourses: ['COMUNICACION'] as const,
      initialCapacity: 45,
      maxExtraCapacity: 0,
      students: [student],
      studentCoursesByDni: new Map([['11111111', new Set(['COMUNICACION'])]]),
    };

    const first = await (service as any).applyPlan({ sections: [plannedSection] });
    const second = await (service as any).applyPlan({ sections: [plannedSection] });

    expect(first.sectionCoursesCreated).toBe(1);
    expect(first.sectionCoursesOmitted).toBe(0);
    expect(first.runStatus).toBe('STRUCTURED');
    expect(first.runId).toBeTruthy();
    expect(first.demandsCreated).toBe(1);
    expect(first.demandsOmitted).toBe(0);

    expect(second.sectionCoursesCreated).toBe(0);
    expect(second.sectionCoursesOmitted).toBe(1);
    expect(second.runStatus).toBe('STRUCTURED');
    expect(second.runId).toBeTruthy();
    expect(second.demandsCreated).toBe(1);
    expect(second.demandsOmitted).toBe(0);

    expect(queries.some((q) => q.includes('DELETE FROM SECTION_COURSES'))).toBe(false);
    expect(
      queries.some(
        (q) =>
          q.includes('DELETE FROM SECTION_STUDENT_COURSES') &&
          !q.includes('WHERE SECTIONCOURSEID IN')
      )
    ).toBe(false);
    expect(queries.some((q) => q.includes('DELETE FROM ENROLLMENTS'))).toBe(false);
  });

  it('planFromExcel should parse new template with courses from column O onwards', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        if (normalized.includes('FROM LEVELING_CONFIG')) {
          return [{ initialCapacity: 45, maxExtraCapacity: 0 }];
        }
        if (normalized.includes('FROM CAREERS C')) {
          return [
            {
              careerName: 'ADMINISTRACION DE EMPRESAS',
              facultyName: 'INGENIERIA, CIENCIAS Y HUMANIDADES',
            },
          ];
        }
        if (normalized.includes('SELECT ID, NAME FROM COURSES')) {
          return [
            { id: 'c-1', name: 'COMUNICACION' },
            { id: 'c-2', name: 'HABILIDADES COMUNICATIVAS' },
            { id: 'c-3', name: 'MATEMATICA' },
          ];
        }
        throw new Error(`Unexpected SQL in test: ${normalized}`);
      }),
      transaction: jest.fn(),
    } as unknown as DataSource;

    const service = new LevelingService(dataSource, {
      getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1'),
    } as any);

    const rows = [
      [
        'ApellidoPaterno',
        'ApellidoMaterno',
        'Nombres',
        'CodigoEstudiante',
        'DNI',
        'Facultad',
        'Carrera',
        'Celular',
        'CorreoInstitucional',
        'Sexo',
        'Modalidad',
        'Condicion',
        'Requerimiento de Nivelacion',
        'Programa de Nivelacion',
        'COMUNICACION',
        'HABILIDADES COMUNICATIVAS',
        'MATEMATICA',
      ],
      [
        'LOPEZ',
        'SANGAMA',
        'ADAMARI',
        'A261000876',
        '74954190',
        'INGENIERIA, CIENCIAS Y HUMANIDADES',
        'ADMINISTRACION DE EMPRESAS',
        '944563196',
        'adamari@uai.edu.pe',
        'Femenino',
        'VIRTUAL',
        'INGRESO',
        'SI',
        'SI',
        '',
        'HABILIDADES COMUNICATIVAS',
        '',
      ],
      [
        'VARAS',
        'BOCANEGRA',
        'PEDRO LUIS',
        'A261000296',
        '75105756',
        'INGENIERIA, CIENCIAS Y HUMANIDADES',
        'ADMINISTRACION DE EMPRESAS',
        '974366914',
        '',
        '',
        'VIRTUAL',
        'INGRESO',
        'SI',
        'SI',
        'COMUNICACION',
        '',
        '',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja4');
    const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const parsed = (service as any).parseExcel(
      fileBuffer,
      new Map([
        ['ADMINISTRACION DE EMPRESAS', 'INGENIERIA, CIENCIAS Y HUMANIDADES'],
      ]),
      new Map([
        ['COMUNICACION', { id: 'c-1', name: 'COMUNICACION' }],
        [
          'HABILIDADES COMUNICATIVAS',
          { id: 'c-2', name: 'HABILIDADES COMUNICATIVAS' },
        ],
        ['MATEMATICA', { id: 'c-3', name: 'MATEMATICA' }],
      ])
    );
    expect(parsed.students).toHaveLength(2);
    const needsByCourse = parsed.students.reduce((acc: Record<string, number>, student: any) => {
      for (const name of student.neededCourses ?? []) {
        acc[name] = (acc[name] ?? 0) + 1;
      }
      return acc;
    }, {});
    expect(needsByCourse['COMUNICACION']).toBe(1);
    expect(needsByCourse['HABILIDADES COMUNICATIVAS']).toBe(1);
    expect(parsed.students[0]).toMatchObject({
      names: 'ADAMARI',
      paternalLastName: 'LOPEZ',
      maternalLastName: 'SANGAMA',
      email: 'adamari@uai.edu.pe',
      sex: 'F',
    });
  });
});
