import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttendanceStatus, Role } from '@uai/shared';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { UsersService } from '../users/users.service';
import { AttendanceRecordEntity } from './attendance-record.entity';
import { AttendanceSessionEntity } from './attendance-session.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceSessionEntity)
    private readonly sessionsRepo: Repository<AttendanceSessionEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordsRepo: Repository<AttendanceRecordEntity>,
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepo: Repository<EnrollmentEntity>,
    private readonly usersService: UsersService,
    private readonly enrollmentsService: EnrollmentsService
  ) {}

  async createSession(params: {
    scheduleBlockId: string;
    sessionDate: string;
    createdByUserId: string;
  }) {
    const block = await this.blocksRepo.findOne({
      where: { id: params.scheduleBlockId },
      relations: { section: true },
    });
    if (!block) throw new NotFoundException('Schedule block not found');

    const exists = await this.sessionsRepo.findOne({
      where: { scheduleBlock: { id: block.id }, sessionDate: params.sessionDate },
      relations: { scheduleBlock: true },
    });
    if (exists) {
      throw new ConflictException('Attendance session already exists for this date');
    }

    const createdBy = await this.usersService.getByIdOrThrow(params.createdByUserId);
    if (createdBy.role !== Role.ADMIN) {
      throw new BadRequestException('createdBy must be ADMIN');
    }

    const session = this.sessionsRepo.create({
      scheduleBlock: block,
      sessionDate: params.sessionDate,
      createdBy,
    });
    await this.sessionsRepo.save(session);

    const enrollments = await this.enrollmentsRepo.find({
      where: { section: { id: block.section.id } },
      relations: { student: true, section: true },
    });

    if (enrollments.length > 0) {
      await this.recordsRepo.save(
        enrollments.map((e) =>
          this.recordsRepo.create({
            attendanceSession: session,
            student: e.student,
            status: AttendanceStatus.FALTO,
            notes: null,
          })
        )
      );
    }

    return session;
  }

  async listSessionsBySection(sectionId: string) {
    const sessions = await this.sessionsRepo.find({
      where: { scheduleBlock: { section: { id: sectionId } } },
      relations: { scheduleBlock: { section: true } },
      order: { sessionDate: 'DESC' },
    });

    return sessions.map((s) => ({
      id: s.id,
      scheduleBlockId: s.scheduleBlock.id,
      sessionDate: s.sessionDate,
      courseName: s.scheduleBlock.courseName,
    }));
  }

  async getSessionOrThrow(id: string) {
    const session = await this.sessionsRepo.findOne({
      where: { id },
      relations: { scheduleBlock: { section: true } },
    });
    if (!session) throw new NotFoundException('Attendance session not found');
    return session;
  }

  async getRecords(sessionId: string) {
    const records = await this.recordsRepo.find({
      where: { attendanceSession: { id: sessionId } },
      relations: { student: true, attendanceSession: true },
      order: { createdAt: 'ASC' },
    });
    return records.map((r) => ({
      studentId: r.student.id,
      fullName: r.student.fullName,
      status: r.status,
      notes: r.notes,
    }));
  }

  async updateRecords(sessionId: string, items: Array<{ studentId: string; status: AttendanceStatus; notes?: string | null }>) {
    const session = await this.getSessionOrThrow(sessionId);
    const sectionId = session.scheduleBlock.section.id;

    for (const it of items) {
      await this.enrollmentsService.assertStudentInSectionOrThrow({
        studentId: it.studentId,
        sectionId,
      });
    }

    for (const it of items) {
      const record = await this.recordsRepo.findOne({
        where: { attendanceSession: { id: session.id }, student: { id: it.studentId } },
        relations: { attendanceSession: true, student: true },
      });
      if (!record) {
        const student = await this.usersService.getByIdOrThrow(it.studentId);
        await this.recordsRepo.save(
          this.recordsRepo.create({
            attendanceSession: session,
            student,
            status: it.status,
            notes: it.notes ?? null,
          })
        );
        continue;
      }

      record.status = it.status;
      record.notes = it.notes ?? null;
      await this.recordsRepo.save(record);
    }

    return { ok: true };
  }
}

