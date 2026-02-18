import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';

@Injectable()
export class StudentService {
  constructor(
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordsRepo: Repository<AttendanceRecordEntity>
  ) {}

  async getSchedule(studentId: string) {
    const sectionCourseIds = await this.loadSectionCourseMembershipIdsByStudent(studentId);
    if (sectionCourseIds.length === 0) return [];

    const blocks = await this.blocksRepo.find({
      where: sectionCourseIds.map((sectionCourseId) => ({ sectionCourseId })),
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });

    return blocks
      .map((b) => ({
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
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const records = await this.recordsRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.attendanceSession', 's')
      .innerJoinAndSelect('s.scheduleBlock', 'b')
      .where('r.studentId = :studentId', { studentId })
      .andWhere('b.sectionCourseId IS NOT NULL')
      .andWhere(
        `
        EXISTS (
          SELECT 1
          FROM section_courses sc
          WHERE sc.id = b.sectionCourseId
            AND sc.periodId = :periodId
        )
        `,
        { periodId: activePeriodId }
      )
      .orderBy('s.sessionDate', 'DESC')
      .getMany();

    return records.map((r) => ({
      courseName: r.attendanceSession.scheduleBlock.courseName,
      sessionDate: r.attendanceSession.sessionDate,
      status: r.status,
    }));
  }

  private async loadSectionCourseMembershipIdsByStudent(studentId: string) {
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const rows: Array<{ sectionCourseId: string }> = await this.blocksRepo.manager.query(
      `
      SELECT DISTINCT ssc.sectionCourseId AS sectionCourseId
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      WHERE ssc.studentId = ?
        AND ssc.sectionCourseId IS NOT NULL
        AND sc.periodId = ?
      `,
      [studentId, activePeriodId]
    );
    return rows
      .map((x) => String(x.sectionCourseId || '').trim())
      .filter(Boolean);
  }

  private async loadActivePeriodIdOrThrow() {
    const rows: Array<{ id: string }> = await this.blocksRepo.manager.query(
      `
      SELECT id
      FROM periods
      WHERE status = 'ACTIVE'
      ORDER BY updatedAt DESC, createdAt DESC
      LIMIT 1
      `
    );
    const id = String(rows[0]?.id ?? '').trim();
    if (!id) {
      throw new BadRequestException('No active period configured');
    }
    return id;
  }
}
