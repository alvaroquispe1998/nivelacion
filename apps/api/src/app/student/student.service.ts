import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';

@Injectable()
export class StudentService {
  constructor(
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>
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
      joinUrl: string | null;
      startUrl: string | null;
      location: string | null;
      referenceModality: string | null;
      referenceClassroom: string | null;
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
        sb.joinUrl AS joinUrl,
        sb.startUrl AS startUrl,
        sb.location AS location,
        sb.referenceModality AS referenceModality,
        sb.referenceClassroom AS referenceClassroom
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
        sb.joinUrl,
        sb.startUrl,
        sb.location,
        sb.referenceModality,
        sb.referenceClassroom
      ORDER BY sb.dayOfWeek ASC, sb.startTime ASC
      `,
      [studentId, activePeriodId]
    );

    return rows.map((row) => ({
      kind: 'COURSE' as const,
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      startTime: this.toHHmm(row.startTime),
      endTime: this.toHHmm(row.endTime),
      courseName: String(row.courseName ?? ''),
      sectionName: String(row.sectionName ?? ''),
      teacherName: row.teacherName ? String(row.teacherName) : null,
      modality: row.modality ? String(row.modality) : null,
      classroomCode: row.classroomCode ? String(row.classroomCode) : null,
      classroomName: row.classroomName ? String(row.classroomName) : null,
      joinUrl: row.joinUrl ? String(row.joinUrl) : null,
      startUrl: row.startUrl ? String(row.startUrl) : null,
      location: row.location ? String(row.location) : null,
      referenceModality: row.referenceModality
        ? String(row.referenceModality)
        : null,
      referenceClassroom: row.referenceClassroom
        ? String(row.referenceClassroom)
        : null,
      sectionCourseId: null,
      applicationId: null,
      applicationGroupId: null,
      groupName: null,
    }));
  }

  async getAttendance(studentId: string) {
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const rows: Array<{
      courseName: string;
      sessionDate: string;
      status: string;
      sectionCourseId: string;
      sectionName: string;
    }> = await this.blocksRepo.manager.query(
      `
      SELECT
        b.courseName AS courseName,
        s.sessionDate AS sessionDate,
        r.status AS status,
        b.sectionCourseId AS sectionCourseId,
        sec.name AS sectionName
      FROM attendance_records r
      INNER JOIN attendance_sessions s ON s.id = r.attendanceSessionId
      INNER JOIN schedule_blocks b ON b.id = s.scheduleBlockId
      INNER JOIN section_courses sc ON sc.id = b.sectionCourseId
      INNER JOIN sections sec ON sec.id = sc.sectionId
      WHERE r.studentId = ?
        AND sc.periodId = ?
      ORDER BY s.sessionDate DESC, b.courseName ASC
      `,
      [studentId, activePeriodId]
    );

    return rows.map((row) => ({
      kind: 'COURSE' as const,
      courseName: String(row.courseName ?? ''),
      sessionDate: this.normalizeIsoDate(row.sessionDate),
      status: String(row.status ?? 'FALTO'),
      sectionCourseId: String(row.sectionCourseId ?? ''),
      sectionName: String(row.sectionName ?? ''),
      applicationId: null,
      applicationGroupId: null,
      groupName: null,
    }));
  }

  async listCourses(studentId: string) {
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const rows: Array<{
      sectionCourseId: string;
      sectionId: string;
      sectionName: string;
      sectionCode: string | null;
      courseId: string;
      courseName: string;
    }> = await this.blocksRepo.manager.query(
      `
      SELECT
        sc.id AS sectionCourseId,
        s.id AS sectionId,
        s.name AS sectionName,
        s.code AS sectionCode,
        c.id AS courseId,
        c.name AS courseName
      FROM section_student_courses ssc
      INNER JOIN section_courses sc ON sc.id = ssc.sectionCourseId
      INNER JOIN sections s ON s.id = sc.sectionId
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE ssc.studentId = ?
        AND sc.periodId = ?
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%PRESENCIAL%' THEN 0
          WHEN UPPER(COALESCE(s.modality, '')) LIKE '%VIRTUAL%' THEN 1
          ELSE 2
        END,
        s.code ASC,
        s.name ASC,
        c.name ASC
      `,
      [studentId, activePeriodId]
    );
    return rows.map((row) => ({
      sectionCourseId: String(row.sectionCourseId),
      sectionId: String(row.sectionId),
      sectionName: String(row.sectionName ?? ''),
      sectionCode: row.sectionCode ? String(row.sectionCode) : null,
      courseId: String(row.courseId),
      courseName: String(row.courseName ?? ''),
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

  private normalizeIsoDate(value: unknown) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text;
    return parsed.toISOString().slice(0, 10);
  }
}
