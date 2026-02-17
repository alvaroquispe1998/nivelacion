import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';

@Injectable()
export class StudentService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepo: Repository<EnrollmentEntity>,
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordsRepo: Repository<AttendanceRecordEntity>
  ) {}

  async getSchedule(studentId: string) {
    const enrollments = await this.enrollmentsRepo.find({
      where: { student: { id: studentId } },
      relations: { section: true, student: true },
    });

    const sectionIds = enrollments.map((e) => e.section.id);
    if (sectionIds.length === 0) return [];

    const blocks = await this.blocksRepo.find({
      where: sectionIds.map((id) => ({ section: { id } })),
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });

    return blocks.map((b) => ({
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      courseName: b.courseName,
      sectionName: b.section.name,
      zoomUrl: b.zoomUrl,
      location: b.location,
    }));
  }

  async getAttendance(studentId: string) {
    const records = await this.recordsRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.attendanceSession', 's')
      .innerJoinAndSelect('s.scheduleBlock', 'b')
      .where('r.studentId = :studentId', { studentId })
      .orderBy('s.sessionDate', 'DESC')
      .getMany();

    return records.map((r) => ({
      courseName: r.attendanceSession.scheduleBlock.courseName,
      sessionDate: r.attendanceSession.sessionDate,
      status: r.status,
    }));
  }
}
