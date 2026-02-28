jest.mock('./schedule-block.entity', () => ({
  ScheduleBlockEntity: class ScheduleBlockEntity {},
}));
jest.mock('../sections/sections.service', () => ({
  SectionsService: class SectionsService {},
}));

import { ScheduleBlocksService } from './schedule-blocks.service';

describe('ScheduleBlocksService', () => {
  it('create should skip overlap and teacher validations for welcome sections', async () => {
    const blocksRepo = {
      manager: {
        query: jest.fn(),
      },
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const sectionsService = {
      getByIdOrThrow: jest.fn(async () => ({
        id: 'sec-1',
        facultyGroup: 'GENERAL',
        campusName: 'VIRTUAL',
        modality: 'VIRTUAL',
      })),
      getSectionCourseById: jest.fn(async () => ({
        id: 'sc-1',
        sectionId: 'sec-1',
        courseName: 'BIENVENIDA UAI',
        modality: 'VIRTUAL',
        classroomCode: null,
        classroomName: null,
      })),
      resolveSectionCourseByName: jest.fn(async () => ({
        id: 'sc-1',
        sectionId: 'sec-1',
        courseName: 'BIENVENIDA UAI',
      })),
      getEffectiveTeacherIdBySectionCourse: jest.fn(async () => 'teacher-1'),
      assertTeacherScheduleAvailabilityForBlock: jest.fn(async () => undefined),
      assertClassroomScheduleAvailabilityForBlock: jest.fn(async () => undefined),
    };
    const periodsService = {
      getOperationalPeriodIdOrThrow: jest.fn(async () => 'period-1'),
    };

    const service = new ScheduleBlocksService(
      blocksRepo as any,
      sectionsService as any,
      periodsService as any
    );

    const result = await service.create({
      sectionId: 'sec-1',
      courseName: 'BIENVENIDA UAI',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '10:00',
      startDate: '2026-03-02',
      endDate: '2026-03-02',
    });

    expect(blocksRepo.manager.query).not.toHaveBeenCalled();
    expect(sectionsService.getEffectiveTeacherIdBySectionCourse).not.toHaveBeenCalled();
    expect(sectionsService.assertTeacherScheduleAvailabilityForBlock).not.toHaveBeenCalled();
    expect(sectionsService.assertClassroomScheduleAvailabilityForBlock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        sectionCourseId: 'sc-1',
        courseName: 'BIENVENIDA UAI',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
      })
    );
  });
});
