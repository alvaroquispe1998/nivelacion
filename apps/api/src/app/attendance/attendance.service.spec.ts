jest.mock('../schedule-blocks/schedule-block.entity', () => ({
  ScheduleBlockEntity: class ScheduleBlockEntity {},
}));
jest.mock('./attendance-record.entity', () => ({
  AttendanceRecordEntity: class AttendanceRecordEntity {},
}));
jest.mock('./attendance-session.entity', () => ({
  AttendanceSessionEntity: class AttendanceSessionEntity {},
}));
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus, Role } from '@uai/shared';
import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
  function createService() {
    const sessionsRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
    };
    const recordsRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
    };
    const blocksRepo = {
      findOne: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };
    const usersService = {
      getByIdOrThrow: jest.fn(),
    };

    const service = new AttendanceService(
      sessionsRepo as any,
      recordsRepo as any,
      blocksRepo as any,
      usersService as any
    );
    return { service, sessionsRepo, recordsRepo, blocksRepo, usersService };
  }

  it('createSession should preload records only from section_student_courses of block course', async () => {
    const { service, sessionsRepo, recordsRepo, blocksRepo, usersService } = createService();

    blocksRepo.findOne.mockResolvedValue({
      id: 'blk-1',
      sectionCourseId: 'sc-1',
      courseName: 'COMUNICACION',
      section: { id: 'sec-1' },
    });
    sessionsRepo.findOne.mockResolvedValue(null);
    usersService.getByIdOrThrow.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN });
    sessionsRepo.save.mockResolvedValue(undefined);
    blocksRepo.manager.query.mockResolvedValueOnce([
      { studentId: 'stu-1' },
      { studentId: 'stu-2' },
    ]);

    await service.createSession({
      scheduleBlockId: 'blk-1',
      sessionDate: '2026-02-18',
      actorUserId: 'admin-1',
    });

    expect(recordsRepo.save).toHaveBeenCalledTimes(1);
    const payload = recordsRepo.save.mock.calls[0][0] as Array<any>;
    expect(payload).toHaveLength(2);
    expect(payload.map((x) => x.student.id).sort()).toEqual(['stu-1', 'stu-2']);
    expect(payload.every((x) => x.status === AttendanceStatus.FALTO)).toBe(true);
  });

  it('updateRecords should reject students outside section+course membership', async () => {
    const { service, sessionsRepo, blocksRepo, usersService } = createService();

    sessionsRepo.findOne.mockResolvedValue({
      id: 'ses-1',
      scheduleBlock: {
        id: 'blk-1',
        sectionCourseId: 'sc-1',
        courseName: 'COMUNICACION',
        section: { id: 'sec-1' },
      },
    });
    usersService.getByIdOrThrow.mockResolvedValue({ id: 'admin-1', role: Role.ADMIN });
    blocksRepo.manager.query.mockResolvedValueOnce([{ studentId: 'stu-1' }]);

    await expect(
      service.updateRecords(
        'ses-1',
        [
          { studentId: 'stu-1', status: AttendanceStatus.ASISTIO },
          { studentId: 'stu-2', status: AttendanceStatus.FALTO },
        ],
        'admin-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
