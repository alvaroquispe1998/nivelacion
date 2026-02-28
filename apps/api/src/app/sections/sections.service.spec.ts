jest.mock('./section.entity', () => ({
  SectionEntity: class SectionEntity {},
}));
jest.mock('../users/user.entity', () => ({
  UserEntity: class UserEntity {},
}));
jest.mock('./section-course-teacher.entity', () => ({
  SectionCourseTeacherEntity: class SectionCourseTeacherEntity {},
}));

import { ConflictException, NotFoundException } from '@nestjs/common';
import { SectionsService } from './sections.service';

describe('SectionsService', () => {
  function createService() {
    const sectionsRepo = {
      findOne: jest.fn(),
      manager: {
        query: jest.fn(),
        transaction: jest.fn(),
      },
    };
    const usersRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
    };
    const classroomsRepo = {
      findOne: jest.fn(),
    };
    const sectionCourseTeachersRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const periodsService = {
      getActivePeriodIdOrThrow: jest.fn().mockResolvedValue('period-1'),
      getOperationalPeriodIdOrThrow: jest.fn().mockResolvedValue('period-1'),
    };

    const service = new SectionsService(
      sectionsRepo as any,
      usersRepo as any,
      classroomsRepo as any,
      sectionCourseTeachersRepo as any,
      periodsService as any
    );
    sectionsRepo.manager.transaction.mockImplementation(async (cb: any) =>
      cb(sectionsRepo.manager)
    );
    return {
      service,
      sectionsRepo,
      usersRepo,
      classroomsRepo,
      sectionCourseTeachersRepo,
      periodsService,
    };
  }

  it('assignTeacherByCourse should upsert assignment for section+course', async () => {
    const { service, sectionsRepo, usersRepo, sectionCourseTeachersRepo } = createService();

    const section = { id: 'sec-1' };
    const teacher = { id: 't-1', dni: '12345678', fullName: 'Docente 1' };

    sectionsRepo.findOne.mockResolvedValue(section);
    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (
        normalized.includes('FROM SECTION_COURSES SC') &&
        normalized.includes('WHERE SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-1',
            sectionId: 'sec-1',
            courseId: 'course-1',
            courseName: 'COMUNICACION',
            facultyGroup: 'FICA',
            campusName: 'CHINCHA',
            modality: 'PRESENCIAL',
            initialCapacity: 45,
            maxExtraCapacity: 0,
            classroomId: 'class-1',
            classroomCode: 'A101',
            classroomName: 'A101',
            classroomCapacity: 45,
            capacitySource: 'AULA',
          },
        ];
      }
      if (normalized.includes('SELECT ID, NAME FROM COURSES')) {
        return [{ id: 'course-1', name: 'COMUNICACION' }];
      }
      if (normalized.includes('FROM SECTION_COURSES')) {
        return [{ id: 'sc-1', sectionId: 'sec-1', courseId: 'course-1' }];
      }
      return [];
    });
    sectionCourseTeachersRepo.findOne.mockResolvedValue(null);
    usersRepo.findOne.mockResolvedValue(teacher);
    sectionCourseTeachersRepo.save.mockResolvedValue({
      id: 'sct-1',
      section,
      sectionCourseId: 'sc-1',
      courseId: 'course-1',
      teacher,
    });

    const out = await service.assignTeacherByCourse({
      sectionId: 'sec-1',
      courseName: 'COMUNICACION',
      teacherId: 't-1',
    });

    expect(sectionCourseTeachersRepo.save).toHaveBeenCalledTimes(1);
    expect(out.teacherId).toBe('t-1');
    expect(out.courseName).toBe('COMUNICACION');
  });

  it('assignTeacherByCourse should remove relation when teacherId is null', async () => {
    const { service, sectionsRepo, sectionCourseTeachersRepo } = createService();

    const section = { id: 'sec-1' };
    const existing = { id: 'sct-1', section, courseId: 1, teacher: { id: 't-1' } };

    sectionsRepo.findOne.mockResolvedValue(section);
    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (normalized.includes('SELECT ID, NAME FROM COURSES')) {
        return [{ id: 'course-1', name: 'COMUNICACION' }];
      }
      if (normalized.includes('FROM SECTION_COURSES')) {
        return [{ id: 'sc-1', sectionId: 'sec-1', courseId: 'course-1' }];
      }
      return [];
    });
    sectionCourseTeachersRepo.findOne.mockResolvedValue(existing);

    const out = await service.assignTeacherByCourse({
      sectionId: 'sec-1',
      courseName: 'COMUNICACION',
      teacherId: null,
    });

    expect(sectionCourseTeachersRepo.remove).toHaveBeenCalledWith(existing);
    expect(out.teacherId).toBeNull();
  });

  it('assignTeacherByCourse should fail when teacher does not exist', async () => {
    const { service, sectionsRepo, usersRepo, sectionCourseTeachersRepo } = createService();

    sectionsRepo.findOne.mockResolvedValue({ id: 'sec-1' });
    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (normalized.includes('SELECT ID, NAME FROM COURSES')) {
        return [{ id: 'course-1', name: 'COMUNICACION' }];
      }
      if (normalized.includes('FROM SECTION_COURSES')) {
        return [{ id: 'sc-1', sectionId: 'sec-1', courseId: 'course-1' }];
      }
      return [];
    });
    sectionCourseTeachersRepo.findOne.mockResolvedValue(null);
    usersRepo.findOne.mockResolvedValue(null);

    await expect(
      service.assignTeacherByCourse({
        sectionId: 'sec-1',
        courseName: 'COMUNICACION',
        teacherId: 'missing',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listScheduleConflicts should map overlapping rows', async () => {
    const { service, sectionsRepo } = createService();

    sectionsRepo.manager.query.mockResolvedValueOnce([
      {
        studentId: 'stu-1',
        studentCode: '20260001',
        studentName: 'ALUMNO UNO',
        dayOfWeek: 1,
        blockIdA: 'blk-a',
        sectionCourseIdA: 'sc-a',
        sectionIdA: 'sec-a',
        sectionCodeA: 'APF-CH',
        sectionNameA: 'APF-CH',
        courseIdA: 'course-a',
        courseNameA: 'MATEMATICA',
        startTimeA: '09:00',
        endTimeA: '10:00',
        startDateA: '2026-02-23',
        endDateA: '2026-03-22',
        blockIdB: 'blk-b',
        sectionCourseIdB: 'sc-b',
        sectionIdB: 'sec-b',
        sectionCodeB: 'BPF-CH',
        sectionNameB: 'BPF-CH',
        courseIdB: 'course-b',
        courseNameB: 'COMUNICACION',
        startTimeB: '09:00',
        endTimeB: '10:00',
        startDateB: '2026-02-23',
        endDateB: '2026-03-22',
      },
    ]);

    const out = await service.listScheduleConflicts();
    expect(out).toHaveLength(1);
    expect(out[0].studentCode).toBe('20260001');
    expect(out[0].blockA.courseName).toBe('MATEMATICA');
    expect(out[0].blockB.courseName).toBe('COMUNICACION');
  });

  it('reassignStudentSectionCourse should warn with conflict error when target exceeds capacity without confirmation', async () => {
    const { service, sectionsRepo } = createService();

    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (
        normalized.includes('FROM SECTION_STUDENT_COURSES SSC') &&
        normalized.includes('AND SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-from',
            sectionId: 'sec-1',
            courseId: 'course-1',
            courseName: 'MATEMATICA',
            facultyGroup: 'FICA',
            campusName: 'CHINCHA',
            modality: 'PRESENCIAL',
            initialCapacity: 45,
            maxExtraCapacity: 2,
            classroomId: 'class-1',
            classroomCode: 'A101',
            classroomName: 'A101',
            classroomCapacity: 45,
            capacitySource: 'AULA',
          },
        ];
      }
      if (
        normalized.includes('FROM SECTION_COURSES SC') &&
        normalized.includes('WHERE SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-to',
            sectionId: 'sec-2',
            courseId: 'course-1',
            courseName: 'MATEMATICA',
            facultyGroup: 'FICA',
            campusName: 'CHINCHA',
            modality: 'PRESENCIAL',
            initialCapacity: 45,
            maxExtraCapacity: 2,
            classroomId: 'class-1',
            classroomCode: 'A101',
            classroomName: 'A101',
            classroomCapacity: 45,
            capacitySource: 'AULA',
          },
        ];
      }
      if (
        normalized.includes('SELECT COUNT(*) AS C') &&
        normalized.includes('FROM SECTION_STUDENT_COURSES') &&
        normalized.includes('SECTIONCOURSEID = ?')
      ) {
        return [{ c: 0 }];
      }
      if (normalized.includes('SELECT DISTINCT CAND.ID AS CANDIDATESECTIONCOURSEID')) {
        return [];
      }
      if (normalized.includes('SELECT COUNT(DISTINCT STUDENTID) AS C')) {
        return [{ c: 47 }];
      }
      return [];
    });

    await expect(
      service.reassignStudentSectionCourse({
        studentId: 'stu-1',
        fromSectionCourseId: 'sc-from',
        toSectionCourseId: 'sc-to',
        confirmOverCapacity: false,
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reassignStudentSectionCourse should allow reassignment when over-capacity is confirmed', async () => {
    const { service, sectionsRepo } = createService();

    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (
        normalized.includes('FROM SECTION_STUDENT_COURSES SSC') &&
        normalized.includes('AND SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-from',
            sectionId: 'sec-1',
            courseId: 'course-1',
            courseName: 'MATEMATICA',
            facultyGroup: 'FICA',
            campusName: 'CHINCHA',
            modality: 'PRESENCIAL',
            initialCapacity: 45,
            maxExtraCapacity: 2,
            classroomId: 'class-1',
            classroomCode: 'A101',
            classroomName: 'A101',
            classroomCapacity: 45,
            capacitySource: 'AULA',
          },
        ];
      }
      if (
        normalized.includes('FROM SECTION_COURSES SC') &&
        normalized.includes('WHERE SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-to',
            sectionId: 'sec-2',
            courseId: 'course-1',
            courseName: 'MATEMATICA',
            facultyGroup: 'FICA',
            campusName: 'CHINCHA',
            modality: 'PRESENCIAL',
            initialCapacity: 45,
            maxExtraCapacity: 2,
            classroomId: 'class-1',
            classroomCode: 'A101',
            classroomName: 'A101',
            classroomCapacity: 45,
            capacitySource: 'AULA',
          },
        ];
      }
      if (
        normalized.includes('SELECT COUNT(*) AS C') &&
        normalized.includes('FROM SECTION_STUDENT_COURSES') &&
        normalized.includes('SECTIONCOURSEID = ?')
      ) {
        return [{ c: 0 }];
      }
      if (normalized.includes('SELECT DISTINCT CAND.ID AS CANDIDATESECTIONCOURSEID')) {
        return [];
      }
      if (normalized.includes('SELECT COUNT(DISTINCT STUDENTID) AS C')) {
        return [{ c: 47 }];
      }
      if (normalized.includes('UPDATE SECTION_STUDENT_COURSES')) {
        return { affectedRows: 1 };
      }
      return [];
    });

    const out = await service.reassignStudentSectionCourse({
      studentId: 'stu-1',
      fromSectionCourseId: 'sc-from',
      toSectionCourseId: 'sc-to',
      confirmOverCapacity: true,
    });

    expect(out.ok).toBe(true);
    expect(out.overCapacity).toBe(true);
    expect(sectionsRepo.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('assertTeacherScheduleAvailabilityForBlock should skip conflicts for welcome sections', async () => {
    const { service, sectionsRepo } = createService();

    sectionsRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (
        normalized.includes('FROM SECTION_COURSES SC') &&
        normalized.includes('WHERE SC.ID = ?') &&
        normalized.includes('AND SC.PERIODID = ?')
      ) {
        return [
          {
            sectionCourseId: 'sc-1',
            sectionId: 'sec-1',
            courseId: 'course-1',
            courseName: 'BIENVENIDA UAI',
            facultyGroup: 'GENERAL',
            campusName: 'VIRTUAL',
            modality: 'VIRTUAL',
            initialCapacity: 45,
            maxExtraCapacity: 0,
            classroomId: null,
            classroomCode: null,
            classroomName: null,
            classroomCapacity: null,
            capacitySource: 'VIRTUAL',
          },
        ];
      }
      return [];
    });

    const findTeacherConflictingBlocks = jest.spyOn(
      service as any,
      'findTeacherConflictingBlocks'
    );

    await expect(
      service.assertTeacherScheduleAvailabilityForBlock({
        teacherId: 'teacher-1',
        sectionCourseId: 'sc-1',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
      })
    ).resolves.toBeUndefined();

    expect(findTeacherConflictingBlocks).not.toHaveBeenCalled();
  });
});
