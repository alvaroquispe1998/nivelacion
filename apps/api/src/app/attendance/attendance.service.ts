import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttendanceStatus, Role } from '@uai/shared';
import { Repository } from 'typeorm';
import { PeriodsService } from '../periods/periods.service';
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
    private readonly usersService: UsersService,
    private readonly periodsService: PeriodsService
  ) {}

  async createSession(params: {
    scheduleBlockId: string;
    sessionDate: string;
    actorUserId: string;
  }) {
    const block = await this.blocksRepo.findOne({
      where: { id: params.scheduleBlockId },
      relations: { section: true },
    });
    if (!block) throw new NotFoundException('Schedule block not found');

    const actor = await this.usersService.getByIdOrThrow(params.actorUserId);
    if (![Role.ADMIN, Role.DOCENTE].includes(actor.role)) {
      throw new BadRequestException('createdBy must be ADMIN or DOCENTE');
    }
    const sectionCourseId = await this.resolveSectionCourseIdForBlockOrThrow(block);
    if (actor.role === Role.DOCENTE) {
      await this.assertTeacherAssignedToSectionCourseOrThrow({
        teacherId: actor.id,
        sectionCourseId,
      });
      this.assertTeacherCanEditDateOrThrow(params.sessionDate);
    }

    const exists = await this.sessionsRepo.findOne({
      where: { scheduleBlock: { id: block.id }, sessionDate: params.sessionDate },
      relations: { scheduleBlock: true },
    });
    if (exists) {
      // Idempotent behavior: if session already exists for this date,
      // return it so callers can continue editing records.
      return exists;
    }

    const session = this.sessionsRepo.create({
      scheduleBlock: block,
      sessionDate: params.sessionDate,
      createdBy: actor,
    });
    await this.sessionsRepo.save(session);

    const studentIds = await this.loadStudentIdsBySectionCourse({
      sectionCourseId,
    });

    if (studentIds.length > 0) {
      await this.recordsRepo.save(
        studentIds.map((studentId) =>
          this.recordsRepo.create({
            attendanceSession: session,
            student: { id: studentId } as any,
            status: AttendanceStatus.FALTO,
            notes: null,
          })
        )
      );
    }

    return session;
  }

  async listSessionsBySection(sectionId: string) {
    const activePeriodId = await this.loadOperationalPeriodIdOrThrow();
    const rows: Array<{
      id: string;
      scheduleBlockId: string;
      sessionDate: string;
      courseName: string;
    }> = await this.blocksRepo.manager.query(
      `
      SELECT
        ses.id AS id,
        ses.scheduleBlockId AS scheduleBlockId,
        ses.sessionDate AS sessionDate,
        b.courseName AS courseName
      FROM attendance_sessions ses
      INNER JOIN schedule_blocks b ON b.id = ses.scheduleBlockId
      INNER JOIN section_courses sc ON sc.id = b.sectionCourseId
      WHERE b.sectionId = ?
        AND sc.periodId = ?
      ORDER BY ses.sessionDate DESC
      `,
      [sectionId, activePeriodId]
    );

    return rows.map((row) => ({
      id: String(row.id),
      scheduleBlockId: String(row.scheduleBlockId),
      sessionDate: this.toIsoDateOnly(row.sessionDate),
      courseName: String(row.courseName ?? ''),
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

  async updateRecords(
    sessionId: string,
    items: Array<{ studentId: string; status: AttendanceStatus; notes?: string | null }>,
    actorUserId: string
  ) {
    const session = await this.getSessionOrThrow(sessionId);
    const sectionCourseId = await this.resolveSectionCourseIdForBlockOrThrow(
      session.scheduleBlock
    );
    const actor = await this.usersService.getByIdOrThrow(actorUserId);
    if (![Role.ADMIN, Role.DOCENTE].includes(actor.role)) {
      throw new BadRequestException('actor must be ADMIN or DOCENTE');
    }
    if (actor.role === Role.DOCENTE) {
      await this.assertTeacherAssignedToSectionCourseOrThrow({
        teacherId: actor.id,
        sectionCourseId,
      });
      this.assertTeacherCanEditDateOrThrow(session.sessionDate);
    }
    const studentIds = Array.from(new Set(items.map((x) => x.studentId).filter(Boolean)));
    await this.assertStudentsInSectionCourseOrThrow({
      sectionCourseId,
      studentIds,
    });

    for (const it of items) {
      const record = await this.recordsRepo.findOne({
        where: { attendanceSession: { id: session.id }, student: { id: it.studentId } },
        relations: { attendanceSession: true, student: true },
      });
      if (!record) {
        await this.recordsRepo.save(
          this.recordsRepo.create({
            attendanceSession: session,
            student: { id: it.studentId } as any,
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

  async listSessionsBySectionCourse(sectionCourseId: string) {
    const sessions = await this.sessionsRepo.find({
      where: { scheduleBlock: { sectionCourseId } },
      relations: { scheduleBlock: true },
      order: { sessionDate: 'DESC' },
    });
    return sessions.map((s) => ({
      id: s.id,
      scheduleBlockId: s.scheduleBlock.id,
      sessionDate: this.toIsoDateOnly(s.sessionDate),
      courseName: s.scheduleBlock.courseName,
      sectionCourseId: s.scheduleBlock.sectionCourseId,
    }));
  }

  async canTeacherManageSession(sessionId: string, teacherId: string) {
    const session = await this.getSessionOrThrow(sessionId);
    const sectionCourseId = await this.resolveSectionCourseIdForBlockOrThrow(
      session.scheduleBlock
    );
    const rows: Array<{ c: number }> = await this.blocksRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_course_teachers
      WHERE teacherId = ?
        AND sectionCourseId = ?
      `
      ,
      [teacherId, sectionCourseId]
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  private async resolveSectionCourseIdForBlockOrThrow(block: ScheduleBlockEntity) {
    if (block.sectionCourseId) return String(block.sectionCourseId);
    const sectionId = String(block.section?.id ?? '').trim();
    if (!sectionId) {
      throw new BadRequestException('Schedule block section not found');
    }
    const activePeriodId = await this.loadOperationalPeriodIdOrThrow();
    const rows: Array<{ id: string; name: string }> = await this.blocksRepo.manager.query(
      `
      SELECT sc.id AS id, c.name AS name
      FROM section_courses sc
      INNER JOIN courses c ON c.id = sc.courseId
      WHERE sc.sectionId = ?
        AND sc.periodId = ?
      `,
      [sectionId, activePeriodId]
    );
    const blockKey = this.courseKey(block.courseName);
    const matched = rows.find((row) => this.courseKey(row.name) === blockKey);
    if (!matched?.id) {
      throw new BadRequestException(
        `Section-course relation not found for block ${block.id} (${block.courseName})`
      );
    }
    return String(matched.id);
  }

  private loadOperationalPeriodIdOrThrow() {
    return this.periodsService.getOperationalPeriodIdOrThrow();
  }

  private toIsoDateOnly(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return '';
      const directDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
      if (directDate) return directDate[1];
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return text;
      return this.toLocalIsoDate(parsed);
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      return this.toLocalIsoDate(value);
    }
    return String(value);
  }

  private toLocalIsoDate(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private serverTodayIso() {
    return this.toLocalIsoDate(new Date());
  }

  private assertTeacherCanEditDateOrThrow(sessionDate: string) {
    const targetDate = this.toIsoDateOnly(sessionDate);
    const today = this.serverTodayIso();
    if (targetDate === today) return;
    throw new BadRequestException(
      'Solo puedes editar asistencia en la fecha de la sesion'
    );
  }

  private async loadStudentIdsBySectionCourse(params: {
    sectionCourseId: string;
  }) {
    const rows: Array<{ studentId: string }> = await this.blocksRepo.manager.query(
      `
      SELECT DISTINCT studentId
      FROM section_student_courses
      WHERE sectionCourseId = ?
      `,
      [params.sectionCourseId]
    );
    return rows.map((x) => String(x.studentId));
  }

  private async assertStudentsInSectionCourseOrThrow(params: {
    sectionCourseId: string;
    studentIds: string[];
  }) {
    if (params.studentIds.length === 0) return;
    const uniqueStudentIds = Array.from(new Set(params.studentIds));
    const placeholders = uniqueStudentIds.map(() => '?').join(', ');
    const rows: Array<{ studentId: string }> = await this.blocksRepo.manager.query(
      `
      SELECT studentId
      FROM section_student_courses
      WHERE sectionCourseId = ?
        AND studentId IN (${placeholders})
      `,
      [params.sectionCourseId, ...uniqueStudentIds]
    );
    const allowed = new Set(rows.map((x) => String(x.studentId)));
    const missing = uniqueStudentIds.filter((id) => !allowed.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Students are not assigned to this section course: ${missing.join(', ')}`
      );
    }
  }

  private async assertTeacherAssignedToSectionCourseOrThrow(params: {
    teacherId: string;
    sectionCourseId: string;
  }) {
    const rows: Array<{ c: number }> = await this.blocksRepo.manager.query(
      `
      SELECT COUNT(*) AS c
      FROM section_course_teachers
      WHERE teacherId = ?
        AND sectionCourseId = ?
      `,
      [params.teacherId, params.sectionCourseId]
    );
    if (Number(rows[0]?.c ?? 0) > 0) return;
    throw new BadRequestException(
      `Teacher ${params.teacherId} is not assigned to section-course ${params.sectionCourseId}`
    );
  }

  private courseKey(value: string) {
    return this.norm(value).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  }

  private norm(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
}
