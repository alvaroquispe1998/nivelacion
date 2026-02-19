jest.mock('../schedule-blocks/schedule-block.entity', () => ({
  ScheduleBlockEntity: class ScheduleBlockEntity {},
}));
jest.mock('../attendance/attendance-record.entity', () => ({
  AttendanceRecordEntity: class AttendanceRecordEntity {},
}));

import { StudentService } from './student.service';

describe('StudentService', () => {
  function createService() {
    const blocksRepo = {
      find: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };
    const recordsRepo = {
      createQueryBuilder: jest.fn(),
    };

    const service = new StudentService(blocksRepo as any, recordsRepo as any);
    return { service, blocksRepo, recordsRepo };
  }

  it('getSchedule should return only blocks for enrolled section+course pairs', async () => {
    const { service, blocksRepo } = createService();

    blocksRepo.manager.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (normalized.includes('FROM PERIODS')) {
        return [{ id: 'period-1' }];
      }
      if (normalized.includes('FROM SECTION_STUDENT_COURSES')) {
        return [{ sectionCourseId: 'sc-1' }];
      }
      if (normalized.includes('FROM SECTION_COURSES SC')) {
        return [{ sectionCourseId: 'sc-1', teacherName: 'DOCENTE UNO' }];
      }
      throw new Error(`Unexpected SQL in test: ${normalized}`);
    });

    const allBlocks = [
      {
        id: 'blk-1',
        sectionCourseId: 'sc-1',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
        courseName: 'COMUNICACION',
        section: { id: 'sec-1', name: 'SEC-1' },
        zoomUrl: null,
        location: null,
      },
      {
        id: 'blk-2',
        sectionCourseId: 'sc-2',
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '12:00',
        courseName: 'MATEMATICA',
        section: { id: 'sec-1', name: 'SEC-1' },
        zoomUrl: null,
        location: null,
      },
      {
        id: 'blk-3',
        sectionCourseId: 'sc-3',
        dayOfWeek: 3,
        startTime: '07:00',
        endTime: '09:00',
        courseName: 'COMUNICACION',
        section: { id: 'sec-2', name: 'SEC-2' },
        zoomUrl: null,
        location: null,
      },
    ];

    blocksRepo.find.mockImplementation(async (params: any) => {
      const acceptedIds = new Set(
        (params?.where ?? []).map((item: any) => String(item.sectionCourseId))
      );
      return allBlocks.filter((b) => acceptedIds.has(String(b.sectionCourseId)));
    });

    const out = await service.getSchedule('stu-1');
    expect(out).toHaveLength(1);
    expect(out[0].courseName).toBe('COMUNICACION');
    expect(out[0].sectionName).toBe('SEC-1');
    expect(out[0].teacherName).toBe('DOCENTE UNO');
  });
});
