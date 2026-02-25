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
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const rows: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      courseName: string;
      sectionName: string;
      teacherName: string | null;
      modality: string | null;
      classroomCode: string | null;
      classroomName: string | null;
      zoomUrl: string | null;
      location: string | null;
    }> = await this.blocksRepo.manager.query(
      `
      SELECT
        sb.dayOfWeek AS dayOfWeek,
        sb.startTime AS startTime,
        sb.endTime AS endTime,
        sb.courseName AS courseName,
        s.name AS sectionName,
        MAX(COALESCE(tc.fullName, ts.fullName)) AS teacherName,
        s.modality AS modality,
        cl.code AS classroomCode,
        cl.name AS classroomName,
        sb.zoomUrl AS zoomUrl,
        sb.location AS location
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN schedule_blocks sb ON sb.sectionCourseId = sc.id
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      LEFT JOIN users tc ON tc.id = sct.teacherId
      LEFT JOIN users ts ON ts.id = s.teacherId
      LEFT JOIN classrooms cl ON cl.id = sc.classroomId
      WHERE ssc.studentId = ?
        AND sc.periodId = ?
      GROUP BY
        sb.id,
        sb.dayOfWeek,
        sb.startTime,
        sb.endTime,
        sb.courseName,
        s.name,
        s.modality,
        cl.code,
        cl.name,
        sb.zoomUrl,
        sb.location
      ORDER BY sb.dayOfWeek ASC, sb.startTime ASC
      `,
      [studentId, activePeriodId]
    );

    return rows.map((row) => ({
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      startTime: this.toHHmm(row.startTime),
      endTime: this.toHHmm(row.endTime),
      courseName: String(row.courseName ?? ''),
      sectionName: String(row.sectionName ?? ''),
      teacherName: row.teacherName ? String(row.teacherName) : null,
      modality: row.modality ? String(row.modality) : null,
      classroomCode: row.classroomCode ? String(row.classroomCode) : null,
      classroomName: row.classroomName ? String(row.classroomName) : null,
      zoomUrl: row.zoomUrl ? String(row.zoomUrl) : null,
      location: row.location ? String(row.location) : null,
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

  private toHHmm(value: string) {
    const text = String(value ?? '').trim();
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return text;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return text;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
