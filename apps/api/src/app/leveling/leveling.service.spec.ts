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
  it('applyPlan should be idempotent and should not run mass deletes', async () => {
    const usersByDni = new Map<string, any>();
    const sectionsByCode = new Map<string, any>();
    const sectionCourses = new Map<string, { id: string; periodId: string; sectionId: string; courseId: string }>();
    const sectionStudentCourses = new Set<string>();
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

        throw new Error(`Unexpected SQL in test: ${normalized}`);
      }),
    };

    const dataSource = {
      transaction: async (cb: any) => cb(manager),
    } as DataSource;

    const service = new LevelingService(dataSource);

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
    expect(first.sectionStudentCoursesCreated).toBe(1);
    expect(first.sectionStudentCoursesOmitted).toBe(0);
    expect(first.enrollmentsCreated).toBe(0);
    expect(first.enrollmentsOmitted).toBe(0);

    expect(second.sectionCoursesCreated).toBe(0);
    expect(second.sectionCoursesOmitted).toBe(1);
    expect(second.sectionStudentCoursesCreated).toBe(0);
    expect(second.sectionStudentCoursesOmitted).toBe(1);
    expect(second.enrollmentsCreated).toBe(0);
    expect(second.enrollmentsOmitted).toBe(0);

    expect(queries.some((q) => q.includes('DELETE FROM SECTION_COURSES'))).toBe(false);
    expect(
      queries.some((q) => q.includes('DELETE FROM SECTION_STUDENT_COURSES'))
    ).toBe(false);
    expect(queries.some((q) => q.includes('DELETE FROM ENROLLMENTS'))).toBe(false);
  });

  it('planFromExcel should parse new template with courses from column L onwards', async () => {
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

    const service = new LevelingService(dataSource);

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
        'COMUNICACION',
        '',
        '',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja4');
    const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = await service.planFromExcel({ fileBuffer });

    expect(result.inputSummary.eligibleStudents).toBe(2);
    expect(result.needsByCourse['COMUNICACION']).toBe(1);
    expect(result.needsByCourse['HABILIDADES COMUNICATIVAS']).toBe(1);
    expect(Object.keys(result.needsByCourse)).toEqual([
      'COMUNICACION',
      'HABILIDADES COMUNICATIVAS',
    ]);

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
    expect(parsed.students[0]).toMatchObject({
      names: 'ADAMARI',
      paternalLastName: 'LOPEZ',
      maternalLastName: 'SANGAMA',
      email: 'adamari@uai.edu.pe',
      sex: 'F',
    });
  });
});
