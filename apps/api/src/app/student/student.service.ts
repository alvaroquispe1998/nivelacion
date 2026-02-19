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
    const teacherBySectionCourseId =
      await this.loadTeacherNamesBySectionCourseIds(sectionCourseIds);

    const blocks = await this.blocksRepo.find({
      where: sectionCourseIds.map((sectionCourseId) => ({ sectionCourseId })),
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });

    return blocks
      .map((b) => ({
        dayOfWeek: b.dayOfWeek,
        startTime: this.toHHmm(b.startTime),
        endTime: this.toHHmm(b.endTime),
        courseName: String(b.courseName ?? ''),
        sectionName: String(b.section?.name ?? ''),
        teacherName:
          teacherBySectionCourseId.get(String(b.sectionCourseId ?? '').trim()) ?? null,
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

  private async loadTeacherNamesBySectionCourseIds(sectionCourseIds: string[]) {
    const ids = sectionCourseIds.map((x) => String(x ?? '').trim()).filter(Boolean);
    if (ids.length === 0) return new Map<string, string>();

    const placeholders = ids.map(() => '?').join(', ');
    const rows: Array<{ sectionCourseId: string; teacherName: string | null }> =
      await this.blocksRepo.manager.query(
        `
      SELECT
        sc.id AS sectionCourseId,
        MAX(COALESCE(tc.fullName, ts.fullName)) AS teacherName
      FROM section_courses sc
      LEFT JOIN section_course_teachers sct ON sct.sectionCourseId = sc.id
      LEFT JOIN users tc ON tc.id = sct.teacherId
      LEFT JOIN sections s ON s.id = sc.sectionId
      LEFT JOIN users ts ON ts.id = s.teacherId
      WHERE sc.id IN (${placeholders})
      GROUP BY sc.id
      `,
        [...ids]
      );

    const out = new Map<string, string>();
    for (const row of rows) {
      const sectionCourseId = String(row.sectionCourseId ?? '').trim();
      const teacherName = String(row.teacherName ?? '').trim();
      if (!sectionCourseId || !teacherName) continue;
      out.set(sectionCourseId, teacherName);
    }
    return out;
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
