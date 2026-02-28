jest.mock('../sections/sections.service', () => ({
  SectionsService: class SectionsService {},
}));

import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { GradesService } from './grades.service';
import { NotFoundException } from '@nestjs/common';

describe('GradesService', () => {
  it('computeFinalAverage should round course grades up to the next integer', () => {
    const service = new GradesService({} as DataSource, {} as any, {} as any);

    const result = (service as any).computeFinalAverage(
      [
        {
          id: 'fk1',
          schemeId: 'scheme-1',
          code: 'FK1',
          name: 'FK1',
          weight: 30,
          orderIndex: 1,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
        {
          id: 'fk2',
          schemeId: 'scheme-1',
          code: 'FK2',
          name: 'FK2',
          weight: 30,
          orderIndex: 2,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
        {
          id: 'parcial',
          schemeId: 'scheme-1',
          code: 'PARCIAL',
          name: 'PARCIAL',
          weight: 40,
          orderIndex: 3,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
      ],
      new Map([
        ['fk1', 10],
        ['fk2', 10],
        ['parcial', 10.01],
      ])
    );

    expect(result.finalAverage).toBe(11);
    expect(result.isComplete).toBe(true);
    expect(result.approved).toBe(true);
  });

  it('computeFinalAverage should mark the course as incomplete when grades are missing', () => {
    const service = new GradesService({} as DataSource, {} as any, {} as any);

    const result = (service as any).computeFinalAverage(
      [
        {
          id: 'fk1',
          schemeId: 'scheme-1',
          code: 'FK1',
          name: 'FK1',
          weight: 30,
          orderIndex: 1,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
        {
          id: 'fk2',
          schemeId: 'scheme-1',
          code: 'FK2',
          name: 'FK2',
          weight: 30,
          orderIndex: 2,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
        {
          id: 'parcial',
          schemeId: 'scheme-1',
          code: 'PARCIAL',
          name: 'PARCIAL',
          weight: 40,
          orderIndex: 3,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
      ],
      new Map([
        ['fk1', 15],
        ['fk2', 16],
      ])
    );

    expect(result.isComplete).toBe(false);
    expect(result.approved).toBe(false);
  });

  it('getAdminAveragesReport should keep the global student average with two decimals', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        if (normalized.includes('SELECT SSC.STUDENTID AS STUDENTID, SSC.SECTIONCOURSEID AS SECTIONCOURSEID')) {
          return [
            { studentId: 'student-1', sectionCourseId: 'section-course-1' },
            { studentId: 'student-1', sectionCourseId: 'section-course-2' },
          ];
        }
        if (normalized.includes('SELECT G.STUDENTID AS STUDENTID, G.SECTIONCOURSEID AS SECTIONCOURSEID')) {
          return [
            { studentId: 'student-1', sectionCourseId: 'section-course-1', componentId: 'fk1', score: 10.01 },
            { studentId: 'student-1', sectionCourseId: 'section-course-2', componentId: 'fk1', score: 13.11 },
          ];
        }
        throw new Error(`Unexpected SQL in test: ${normalized}`);
      }),
    } as unknown as DataSource;

    const service = new GradesService(
      dataSource,
      {
        getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1'),
      } as any,
      {} as any
    );

    jest.spyOn(service as any, 'getAdminStudentsReport').mockResolvedValue([
      {
        studentId: 'student-1',
        dni: '12345678',
        codigoAlumno: 'A0001',
        fullName: 'Alumno Demo',
        careerName: 'INGENIERIA',
      },
    ]);
    jest.spyOn(service as any, 'getOrCreateScheme').mockResolvedValue({
      id: 'scheme-1',
      periodId: 'period-1',
      status: 'LOCKED',
      components: [
        {
          id: 'fk1',
          schemeId: 'scheme-1',
          code: 'FK1',
          name: 'FK1',
          weight: 100,
          orderIndex: 1,
          minScore: 0,
          maxScore: 20,
          isActive: true,
        },
      ],
    });

    const result = await service.getAdminAveragesReport({});

    expect(result).toEqual([
      expect.objectContaining({
        studentId: 'student-1',
        average: 12.5,
        approved: 'SI',
      }),
    ]);
  });

  it('searchAdminStudentsForReport should return ranked student matches', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        {
          studentId: 'student-1',
          dni: '60670959',
          codigoAlumno: 'A261002108',
          fullName: 'Juan Perez Gomez',
          careerName: 'INGENIERIA',
        },
      ]),
    } as unknown as DataSource;

    const service = new GradesService(
      dataSource,
      { getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1') } as any,
      {} as any
    );

    const result = await service.searchAdminStudentsForReport('juan perez');

    expect(result).toEqual([
      {
        studentId: 'student-1',
        dni: '60670959',
        codigoAlumno: 'A261002108',
        fullName: 'Juan Perez Gomez',
        careerName: 'INGENIERIA',
      },
    ]);
    expect((dataSource.query as jest.Mock).mock.calls[0][1]).toContain('JUAN PEREZ');
  });

  it('getAdminStudentReport should aggregate student profile, schedule, enrollment, grades and attendance', async () => {
    const service = new GradesService({} as DataSource, {} as any, {} as any);

    jest.spyOn(service as any, 'getStudentProfileOrThrow').mockResolvedValue({
      studentId: 'student-1',
      dni: '12345678',
      codigoAlumno: 'A0001',
      fullName: 'Alumno Demo',
      names: 'Alumno',
      paternalLastName: 'Demo',
      maternalLastName: 'Test',
      careerName: 'INGENIERIA',
      sex: 'M',
      email: 'demo@test.com',
      examDate: '2026-01-10',
    });
    jest
      .spyOn(service as any, 'getStudentScheduleByStudentAndPeriod')
      .mockResolvedValue([
        {
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '10:00',
          courseName: 'Matematica',
          sectionName: 'A',
        },
      ]);
    jest
      .spyOn(service as any, 'getStudentEnrollmentByStudentAndPeriod')
      .mockResolvedValue([
        {
          sectionCourseId: 'sc-1',
          courseName: 'Matematica',
          sectionCode: 'A',
          sectionName: 'A',
          facultyGroup: 'ING',
          facultyName: 'Ingenieria',
          campusName: 'Lima',
          modality: 'PRESENCIAL',
          teacherName: 'Docente Demo',
          classroomCode: '101',
          classroomName: 'Aula 101',
          classroomLabel: 'Aula 101',
        },
      ]);
    jest
      .spyOn(service as any, 'getStudentGradesByStudentAndPeriod')
      .mockResolvedValue({
        periodId: 'period-1',
        components: [],
        rows: [],
      });
    jest
      .spyOn(service as any, 'getStudentAttendanceByStudentAndPeriod')
      .mockResolvedValue({
        summaryByCourse: [],
        sessions: [],
      });
    (service as any).periodsService = {
      getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1'),
    };

    const result = await service.getAdminStudentReport('student-1');

    expect(result.periodId).toBe('period-1');
    expect(result.student.studentId).toBe('student-1');
    expect(result.schedule).toHaveLength(1);
    expect(result.enrollment).toHaveLength(1);
  });

  it('buildAdminStudentReportExcel should create the expected workbook sheets', async () => {
    const service = new GradesService({} as DataSource, {} as any, {} as any);

    jest.spyOn(service, 'getAdminStudentReport').mockResolvedValue({
      periodId: 'period-1',
      student: {
        studentId: 'student-1',
        dni: '12345678',
        codigoAlumno: 'A0001',
        fullName: 'Alumno Demo',
        names: 'Alumno',
        paternalLastName: 'Demo',
        maternalLastName: 'Test',
        careerName: 'INGENIERIA',
        sex: 'M',
        email: 'demo@test.com',
        examDate: '2026-01-10',
      },
      schedule: [],
      enrollment: [],
      grades: { periodId: 'period-1', components: [], rows: [] },
      attendance: { summaryByCourse: [], sessions: [] },
    });
    jest.spyOn(service as any, 'loadPeriodMetadata').mockResolvedValue({
      id: 'period-1',
      code: '2026-1',
      name: 'Periodo 2026-1',
    });

    const result = await service.buildAdminStudentReportExcel('student-1');
    const workbook = XLSX.read(result.fileBuffer, { type: 'buffer' });

    expect(workbook.SheetNames).toEqual([
      'Datos Generales',
      'Horario',
      'Matricula',
      'Notas',
      'Asistencia Resumen',
      'Asistencia Detalle',
    ]);
    expect(result.fileName).toContain('reporte_alumno');
  });

  it('buildAdminStudentReportPdf should return a non-empty buffer', async () => {
    const service = new GradesService({} as DataSource, {} as any, {} as any);

    jest.spyOn(service, 'getAdminStudentReport').mockResolvedValue({
      periodId: 'period-1',
      student: {
        studentId: 'student-1',
        dni: '12345678',
        codigoAlumno: 'A0001',
        fullName: 'Alumno Demo',
        names: 'Alumno',
        paternalLastName: 'Demo',
        maternalLastName: 'Test',
        careerName: 'INGENIERIA',
        sex: 'M',
        email: 'demo@test.com',
        examDate: '2026-01-10',
      },
      schedule: [],
      enrollment: [],
      grades: { periodId: 'period-1', components: [], rows: [] },
      attendance: { summaryByCourse: [], sessions: [] },
    });
    jest.spyOn(service as any, 'loadPeriodMetadata').mockResolvedValue({
      id: 'period-1',
      code: '2026-1',
      name: 'Periodo 2026-1',
    });

    const result = await service.buildAdminStudentReportPdf('student-1');

    expect(Buffer.isBuffer(result.fileBuffer)).toBe(true);
    expect(result.fileBuffer.length).toBeGreaterThan(0);
  });

  it('getAdminStudentReport should throw when the user does not exist', async () => {
    const dataSource = {
      query: jest.fn(async () => []),
    } as unknown as DataSource;

    const service = new GradesService(
      dataSource,
      { getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1') } as any,
      {} as any
    );

    await expect(service.getAdminStudentReport('missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('getAdminStudentReport should throw when the user is not a student', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        {
          studentId: 'teacher-1',
          role: 'DOCENTE',
        },
      ]),
    } as unknown as DataSource;

    const service = new GradesService(
      dataSource,
      { getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1') } as any,
      {} as any
    );

    await expect(service.getAdminStudentReport('teacher-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
