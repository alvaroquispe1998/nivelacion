jest.mock('./section.entity', () => ({
  SectionEntity: class SectionEntity {},
}));
jest.mock('../users/user.entity', () => ({
  UserEntity: class UserEntity {},
}));
jest.mock('./section-course-teacher.entity', () => ({
  SectionCourseTeacherEntity: class SectionCourseTeacherEntity {},
}));

import { NotFoundException } from '@nestjs/common';
import { SectionsService } from './sections.service';

describe('SectionsService', () => {
  function createService() {
    const sectionsRepo = {
      findOne: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };
    const usersRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
    };
    const sectionCourseTeachersRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const periodsService = {
      getActivePeriodIdOrThrow: jest.fn().mockResolvedValue('period-1'),
    };

    const service = new SectionsService(
      sectionsRepo as any,
      usersRepo as any,
      sectionCourseTeachersRepo as any,
      periodsService as any
    );
    return {
      service,
      sectionsRepo,
      usersRepo,
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
});
