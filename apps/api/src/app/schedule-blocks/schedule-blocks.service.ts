import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeetingsService } from '../management-zoom/meetings.service';
import { PeriodsService } from '../periods/periods.service';
import { SectionsService } from '../sections/sections.service';
import { timesOverlap } from '../common/utils/time.util';
import { ScheduleBlockEntity } from './schedule-block.entity';
import { AuditActor, AuditService } from '../audit/audit.service';

@Injectable()
export class ScheduleBlocksService {
  constructor(
    @InjectRepository(ScheduleBlockEntity)
    private readonly blocksRepo: Repository<ScheduleBlockEntity>,
    private readonly meetingsService: MeetingsService,
    private readonly sectionsService: SectionsService,
    private readonly periodsService: PeriodsService,
    private readonly auditService: AuditService
  ) {}

  async listBySection(sectionId: string, courseName?: string) {
    const normalizedCourse = String(courseName ?? '').trim();
    if (!normalizedCourse) {
      const activePeriodId = await this.loadActivePeriodIdOrThrow();
      const rows: Array<{ id: string }> = await this.blocksRepo.manager.query(
        `
        SELECT b.id AS id
        FROM schedule_blocks b
        INNER JOIN section_courses sc ON sc.id = b.sectionCourseId
        WHERE b.sectionId = ?
          AND sc.periodId = ?
        ORDER BY b.dayOfWeek ASC, b.startTime ASC
        `,
        [sectionId, activePeriodId]
      );
      const blockIds = rows.map((row) => String(row.id || '').trim()).filter(Boolean);
      if (blockIds.length === 0) return [];
      return this.blocksRepo.find({
        where: blockIds.map((id) => ({ id })),
        relations: { section: true },
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
      });
    }

    const sectionCourse = await this.sectionsService.resolveSectionCourseByName({
      sectionId,
      courseName: normalizedCourse,
    });
    if (!sectionCourse) return [];

    return this.blocksRepo.find({
      where: { sectionCourseId: sectionCourse.id },
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async listBySectionCourse(sectionCourseId: string) {
    return this.blocksRepo.find({
      where: { sectionCourseId },
      relations: { section: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async getByIdOrThrow(id: string) {
    const block = await this.blocksRepo.findOne({
      where: { id },
      relations: { section: true },
    });
    if (!block) throw new NotFoundException('Schedule block not found');
    return block;
  }

  private async assertNoOverlap(params: {
    sectionId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }) {
    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const existing: Array<{ id: string; startTime: string; endTime: string }> =
      await this.blocksRepo.manager.query(
        `
      SELECT
        b.id AS id,
        b.startTime AS startTime,
        b.endTime AS endTime
      FROM schedule_blocks b
      INNER JOIN section_courses sc ON sc.id = b.sectionCourseId
      WHERE b.sectionId = ?
        AND b.dayOfWeek = ?
        AND sc.periodId = ?
      `,
        [params.sectionId, params.dayOfWeek, activePeriodId]
      );

    const overlaps = existing.some((b) => {
      if (params.excludeId && b.id === params.excludeId) return false;
      return timesOverlap(params.startTime, params.endTime, b.startTime, b.endTime);
    });

    if (overlaps) {
      throw new ConflictException(
        'El bloque horario se cruza con otro bloque de esta seccion'
      );
    }
  }

  async create(body: {
    sectionId: string;
    sectionCourseId?: string | null;
    courseName: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate?: string | null;
    endDate?: string | null;
    zoomMeetingRecordId?: string | null;
    joinUrl?: string | null;
    startUrl?: string | null;
    location?: string | null;
    referenceModality?: string | null;
    referenceClassroom?: string | null;
    applyToWholeCourse?: boolean;
    applyTeacherToWholeCourse?: boolean;
    scopeFacultyGroup?: string | null;
    scopeCampusName?: string | null;
    scopeCourseName?: string | null;
    actor?: AuditActor | null;
  }): Promise<{
    block: ScheduleBlockEntity;
    warnings: {
      code: string;
      message: string;
      summary: { affectedStudents: number; totalConflicts: number };
      students: Array<{
        studentId: string;
        dni: string | null;
        codigoAlumno: string | null;
        fullName: string;
        conflicts: Array<{
          kind: 'WORKSHOP';
          reason: string;
          candidateBlock: string;
          conflictingBlock: string;
        }>;
      }>;
    } | null;
  }> {
    if (body.startTime >= body.endTime) {
      throw new BadRequestException('La hora de inicio debe ser menor a la hora de fin');
    }
    if (body.startDate && body.endDate && body.startDate > body.endDate) {
      throw new BadRequestException('La fecha de inicio debe ser menor o igual a la fecha fin');
    }

    const section = await this.sectionsService.getByIdOrThrow(body.sectionId);
    const sectionCourse = body.sectionCourseId
      ? await this.sectionsService.getSectionCourseById(body.sectionCourseId)
      : await this.sectionsService.resolveSectionCourseByName({
          sectionId: section.id,
          courseName: body.courseName,
        });
    if (!sectionCourse) {
      throw new BadRequestException(
        `No existe relacion seccion-curso para la seccion ${section.id} y curso ${body.courseName}`
      );
    }
    if (sectionCourse.sectionId !== section.id) {
      throw new BadRequestException(
        `El sectionCourseId ${sectionCourse.id} no pertenece a la seccion ${section.id}`
      );
    }

    const sectionCourseContext =
      (await this.sectionsService.getSectionCourseById(sectionCourse.id)) ?? null;
    const defaultReference = this.buildReferenceDefaults(
      sectionCourseContext?.modality,
      sectionCourseContext?.classroomCode,
      sectionCourseContext?.classroomName
    );
    const referenceModality = this.normalizeReferenceModality(
      body.referenceModality,
      defaultReference.referenceModality
    );
    const referenceClassroom = this.normalizeReferenceClassroom(
      body.referenceClassroom,
      referenceModality,
      defaultReference.referenceClassroom
    );
    const ignoredSectionCourseIds =
      await this.resolveIgnoredSectionCourseIdsForWholeCourse({
        applyToWholeCourse: Boolean(body.applyToWholeCourse),
        sectionId: section.id,
        courseName: sectionCourse.courseName,
        scopeFacultyGroup: body.scopeFacultyGroup ?? null,
        scopeCampusName: body.scopeCampusName ?? null,
        scopeCourseName: body.scopeCourseName ?? null,
      });

    if (!this.isWelcomeScheduleSection(section)) {
      await this.assertNoOverlap({
        sectionId: section.id,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
      });

      const teacherId = await this.sectionsService.getEffectiveTeacherIdBySectionCourse(
        sectionCourse.id
      );
      if (teacherId) {
        await this.sectionsService.assertTeacherScheduleAvailabilityForBlock({
          teacherId,
          sectionCourseId: sectionCourse.id,
          dayOfWeek: body.dayOfWeek,
          startTime: body.startTime,
          endTime: body.endTime,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          ignoredSectionCourseIds,
        });
      }

      await this.sectionsService.assertClassroomScheduleAvailabilityForBlock({
        sectionCourseId: sectionCourse.id,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        ignoredSectionCourseIds,
      });
    }

    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const resultingBlocks = [
      ...(await this.loadSectionCourseBlocks(sectionCourse.id)),
      {
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
      },
    ];
    const studentConflicts =
      await this.sectionsService.findStudentsScheduleConflictsForSectionCourse({
      periodId: activePeriodId,
      sectionCourseId: sectionCourse.id,
      candidateBlocks: resultingBlocks,
    });
    const blockingConflicts = this.filterStudentScheduleConflictsByKind(
      studentConflicts,
      'COURSE'
    );
    if (blockingConflicts.length > 0) {
      throw new ConflictException(
        this.buildStudentScheduleConflictPayload(blockingConflicts)
      );
    }
    const warnings = this.buildWorkshopScheduleWarningPayload(
      this.filterStudentScheduleConflictsByKind(studentConflicts, 'WORKSHOP')
    );

    const block = this.blocksRepo.create({
      section,
      sectionCourseId: sectionCourse.id,
      courseName: sectionCourse.courseName,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      zoomMeetingRecordId: body.zoomMeetingRecordId ?? null,
      joinUrl: body.joinUrl ?? null,
      startUrl: body.startUrl ?? null,
      location: body.location ?? null,
      referenceModality,
      referenceClassroom,
    });
    const savedBlock = await this.blocksRepo.save(block);
    await this.auditService.recordChange({
      moduleName: 'SCHEDULES',
      entityType: 'SECTION_SCHEDULE_BLOCK',
      entityId: savedBlock.id,
      entityLabel: `${savedBlock.courseName} | ${savedBlock.section?.id ?? body.sectionId}`,
      action: 'CREATE',
      actor: body.actor ?? null,
      before: null,
      after: this.toAuditSnapshot(savedBlock),
    });
    return {
      block: savedBlock,
      warnings,
    };
  }

  async update(
    id: string,
    body: Partial<{
      courseName: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomMeetingRecordId: string | null;
      joinUrl: string | null;
      startUrl: string | null;
      location: string | null;
      referenceModality: string | null;
      referenceClassroom: string | null;
      applyToWholeCourse: boolean;
      applyTeacherToWholeCourse: boolean;
      scopeFacultyGroup: string | null;
      scopeCampusName: string | null;
      scopeCourseName: string | null;
      actor: AuditActor | null;
    }>
  ): Promise<{
    block: ScheduleBlockEntity;
    warnings: {
      code: string;
      message: string;
      summary: { affectedStudents: number; totalConflicts: number };
      students: Array<{
        studentId: string;
        dni: string | null;
        codigoAlumno: string | null;
        fullName: string;
        conflicts: Array<{
          kind: 'WORKSHOP';
          reason: string;
          candidateBlock: string;
          conflictingBlock: string;
        }>;
      }>;
    } | null;
  }> {
    const block = await this.blocksRepo.findOne({
      where: { id },
      relations: { section: true },
    });
    if (!block) throw new NotFoundException('Schedule block not found');

    if (this.isMetadataOnlyUpdate(body)) {
      if (body.joinUrl !== undefined) {
        block.joinUrl = body.joinUrl ?? null;
      }
      if (body.startUrl !== undefined) {
        block.startUrl = body.startUrl ?? null;
      }
      if (body.zoomMeetingRecordId !== undefined) {
        block.zoomMeetingRecordId = body.zoomMeetingRecordId ?? null;
      }
      if (body.location !== undefined) {
        block.location = body.location ?? null;
      }
      if (body.referenceModality !== undefined) {
        block.referenceModality = body.referenceModality ?? null;
      }
      if (body.referenceClassroom !== undefined) {
        block.referenceClassroom = body.referenceClassroom ?? null;
      }
      return {
        block: await this.blocksRepo.save(block),
        warnings: null,
      };
    }

    const next = {
      courseName: body.courseName ?? block.courseName,
      dayOfWeek: body.dayOfWeek ?? block.dayOfWeek,
      startTime: body.startTime ?? block.startTime,
      endTime: body.endTime ?? block.endTime,
      startDate: body.startDate !== undefined ? body.startDate : block.startDate,
      endDate: body.endDate !== undefined ? body.endDate : block.endDate,
      zoomMeetingRecordId:
        body.zoomMeetingRecordId !== undefined
          ? body.zoomMeetingRecordId
          : block.zoomMeetingRecordId,
      joinUrl: body.joinUrl ?? block.joinUrl,
      startUrl: body.startUrl ?? block.startUrl,
      location: body.location ?? block.location,
    };

    if (next.startTime >= next.endTime) {
      throw new BadRequestException('La hora de inicio debe ser menor a la hora de fin');
    }
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      throw new BadRequestException('La fecha de inicio debe ser menor o igual a la fecha fin');
    }

    const nextSectionCourse = await this.sectionsService.resolveSectionCourseByName({
      sectionId: block.section.id,
      courseName: next.courseName,
    });
    if (!nextSectionCourse) {
      throw new BadRequestException(
        `No existe relacion seccion-curso para la seccion ${block.section.id} y curso ${next.courseName}`
      );
    }

    const nextSectionCourseContext =
      (await this.sectionsService.getSectionCourseById(nextSectionCourse.id)) ?? null;
    const defaultReference = this.buildReferenceDefaults(
      nextSectionCourseContext?.modality,
      nextSectionCourseContext?.classroomCode,
      nextSectionCourseContext?.classroomName
    );
    const referenceModality = this.normalizeReferenceModality(
      body.referenceModality ?? block.referenceModality ?? null,
      defaultReference.referenceModality
    );
    const referenceClassroom = this.normalizeReferenceClassroom(
      body.referenceClassroom ?? block.referenceClassroom ?? null,
      referenceModality,
      defaultReference.referenceClassroom
    );
    const ignoredSectionCourseIds =
      await this.resolveIgnoredSectionCourseIdsForWholeCourse({
        applyToWholeCourse: Boolean(body.applyToWholeCourse),
        sectionId: block.section.id,
        courseName: nextSectionCourse.courseName,
        scopeFacultyGroup: body.scopeFacultyGroup ?? null,
        scopeCampusName: body.scopeCampusName ?? null,
        scopeCourseName: body.scopeCourseName ?? null,
      });

    if (!this.isWelcomeScheduleSection(block.section)) {
      await this.assertNoOverlap({
        sectionId: block.section.id,
        dayOfWeek: next.dayOfWeek,
        startTime: next.startTime,
        endTime: next.endTime,
        excludeId: block.id,
      });

      const teacherId = await this.sectionsService.getEffectiveTeacherIdBySectionCourse(
        nextSectionCourse.id
      );
      if (teacherId) {
        await this.sectionsService.assertTeacherScheduleAvailabilityForBlock({
          teacherId,
          sectionCourseId: nextSectionCourse.id,
          dayOfWeek: next.dayOfWeek,
          startTime: next.startTime,
          endTime: next.endTime,
          startDate: next.startDate ?? null,
          endDate: next.endDate ?? null,
          excludeBlockId: block.id,
          ignoredSectionCourseIds,
        });
      }

      await this.sectionsService.assertClassroomScheduleAvailabilityForBlock({
        sectionCourseId: nextSectionCourse.id,
        dayOfWeek: next.dayOfWeek,
        startTime: next.startTime,
        endTime: next.endTime,
        startDate: next.startDate ?? null,
        endDate: next.endDate ?? null,
        excludeBlockId: block.id,
        ignoredSectionCourseIds,
      });
    }

    const activePeriodId = await this.loadActivePeriodIdOrThrow();
    const resultingBlocks = [
      ...(await this.loadSectionCourseBlocks(nextSectionCourse.id, block.id)),
      {
        dayOfWeek: next.dayOfWeek,
        startTime: next.startTime,
        endTime: next.endTime,
        startDate: next.startDate ?? null,
        endDate: next.endDate ?? null,
      },
    ];
    const studentConflicts =
      await this.sectionsService.findStudentsScheduleConflictsForSectionCourse({
      periodId: activePeriodId,
      sectionCourseId: nextSectionCourse.id,
      candidateBlocks: resultingBlocks,
    });
    const blockingConflicts = this.filterStudentScheduleConflictsByKind(
      studentConflicts,
      'COURSE'
    );
    if (blockingConflicts.length > 0) {
      throw new ConflictException(
        this.buildStudentScheduleConflictPayload(blockingConflicts)
      );
    }
    const warnings = this.buildWorkshopScheduleWarningPayload(
      this.filterStudentScheduleConflictsByKind(studentConflicts, 'WORKSHOP')
    );

    const beforeSnapshot = this.toAuditSnapshot(block);
    block.sectionCourseId = nextSectionCourse.id;
    block.courseName = nextSectionCourse.courseName;
    block.dayOfWeek = next.dayOfWeek;
    block.startTime = next.startTime;
    block.endTime = next.endTime;
    block.startDate = next.startDate ?? null;
    block.endDate = next.endDate ?? null;
    block.zoomMeetingRecordId = next.zoomMeetingRecordId ?? null;
    block.joinUrl = next.joinUrl;
    block.startUrl = next.startUrl;
    block.location = next.location;
    block.referenceModality = referenceModality;
    block.referenceClassroom = referenceClassroom;

    const savedBlock = await this.blocksRepo.save(block);
    await this.auditService.recordChange({
      moduleName: 'SCHEDULES',
      entityType: 'SECTION_SCHEDULE_BLOCK',
      entityId: savedBlock.id,
      entityLabel: `${savedBlock.courseName} | ${savedBlock.section?.id ?? block.section.id}`,
      action: 'UPDATE',
      actor: body.actor ?? null,
      before: beforeSnapshot,
      after: this.toAuditSnapshot(savedBlock),
    });
    return {
      block: savedBlock,
      warnings,
    };
  }

  private async loadSectionCourseBlocks(sectionCourseId: string, excludeBlockId?: string) {
    const rows: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
    }> = await this.blocksRepo.manager.query(
      `
      SELECT
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate
      FROM schedule_blocks
      WHERE sectionCourseId = ?
        AND (? IS NULL OR id <> ?)
      ORDER BY dayOfWeek ASC, startTime ASC
      `,
      [sectionCourseId, excludeBlockId ?? null, excludeBlockId ?? null]
    );
    return rows.map((row) => ({
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      startTime: String(row.startTime ?? ''),
      endTime: String(row.endTime ?? ''),
      startDate: row.startDate ? String(row.startDate) : null,
      endDate: row.endDate ? String(row.endDate) : null,
    }));
  }

  private isMetadataOnlyUpdate(
    body: Partial<{
      courseName: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate: string | null;
      endDate: string | null;
      zoomMeetingRecordId: string | null;
      joinUrl: string | null;
      startUrl: string | null;
      location: string | null;
      referenceModality: string | null;
      referenceClassroom: string | null;
      applyToWholeCourse: boolean;
      applyTeacherToWholeCourse: boolean;
      scopeFacultyGroup: string | null;
      scopeCampusName: string | null;
      scopeCourseName: string | null;
    }>
  ) {
    const touchesScheduleShape =
      body.courseName !== undefined ||
      body.dayOfWeek !== undefined ||
      body.startTime !== undefined ||
      body.endTime !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined ||
      body.applyToWholeCourse !== undefined ||
      body.applyTeacherToWholeCourse !== undefined ||
      body.scopeFacultyGroup !== undefined ||
      body.scopeCampusName !== undefined ||
      body.scopeCourseName !== undefined;

    return !touchesScheduleShape;
  }

  async remove(id: string, actor?: AuditActor | null) {
    const block = await this.blocksRepo.findOne({ where: { id } });
    if (!block) throw new NotFoundException('Schedule block not found');
    const beforeSnapshot = this.toAuditSnapshot(block);
    await this.blocksRepo.remove(block);
    await this.auditService.recordChange({
      moduleName: 'SCHEDULES',
      entityType: 'SECTION_SCHEDULE_BLOCK',
      entityId: id,
      entityLabel: `${block.courseName} | ${(block as any).sectionId ?? block.section?.id ?? ''}`,
      action: 'DELETE',
      actor: actor ?? null,
      before: beforeSnapshot,
      after: null,
    });
    return { ok: true };
  }

  async refreshMeetingLinks(id: string) {
    const block = await this.getByIdOrThrow(id);
    const meetingRecordId = String(block.zoomMeetingRecordId ?? '').trim();
    if (!meetingRecordId) {
      const joinUrl = String(block.joinUrl ?? '').trim();
      const startUrl = String(block.startUrl ?? '').trim();
      if (!joinUrl && !startUrl) {
        throw new BadRequestException(
          'El bloque no tiene una reunion Zoom vinculada ni enlaces guardados.',
        );
      }
      return {
        joinUrl: joinUrl || null,
        startUrl: startUrl || null,
        meetingMode: null,
      };
    }

    const refreshed = await this.meetingsService.refreshMeetingLinks(meetingRecordId);
    block.joinUrl = refreshed.joinUrl ?? null;
    block.startUrl = refreshed.startUrl ?? null;
    await this.blocksRepo.save(block);
    return refreshed;
  }

  private async loadActivePeriodIdOrThrow() {
    return this.periodsService.getOperationalPeriodIdOrThrow();
  }

  private isVirtualModality(modality: string | null | undefined) {
    return String(modality ?? '')
      .trim()
      .toUpperCase()
      .includes('VIRTUAL');
  }

  private isWelcomeScheduleSection(section: {
    facultyGroup?: string | null;
    campusName?: string | null;
    modality?: string | null;
  }) {
    const facultyGroup = String(section.facultyGroup ?? '')
      .trim()
      .toUpperCase();
    const campusName = String(section.campusName ?? '')
      .trim()
      .toUpperCase();
    return (
      facultyGroup === 'GENERAL' &&
      campusName === 'VIRTUAL' &&
      this.isVirtualModality(section.modality)
    );
  }

  private buildReferenceDefaults(
    modality: string | null | undefined,
    classroomCode: string | null | undefined,
    classroomName: string | null | undefined
  ) {
    const isVirtual = this.isVirtualModality(modality);
    if (isVirtual) {
      return {
        referenceModality: 'VIRTUAL',
        referenceClassroom: 'Sin aula',
      };
    }
    const classroomLabel =
      String(classroomCode ?? '').trim() ||
      String(classroomName ?? '').trim() ||
      'Sin aula';
    return {
      referenceModality: 'PRESENCIAL',
      referenceClassroom: classroomLabel,
    };
  }

  private normalizeReferenceModality(
    value: string | null | undefined,
    fallback: string
  ) {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (normalized === 'VIRTUAL') return 'VIRTUAL';
    if (normalized === 'PRESENCIAL') return 'PRESENCIAL';
    return fallback;
  }

  private normalizeReferenceClassroom(
    value: string | null | undefined,
    referenceModality: string,
    fallback: string
  ) {
    if (String(referenceModality ?? '').trim().toUpperCase() === 'VIRTUAL') {
      return 'Sin aula';
    }
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
    return fallback || 'Sin aula';
  }

  private async resolveIgnoredSectionCourseIdsForWholeCourse(params: {
    applyToWholeCourse: boolean;
    sectionId: string;
    courseName: string;
    scopeFacultyGroup?: string | null;
    scopeCampusName?: string | null;
    scopeCourseName?: string | null;
  }) {
    if (!params.applyToWholeCourse) return [];
    const facultyGroup = String(params.scopeFacultyGroup ?? '').trim();
    const campusName = String(params.scopeCampusName ?? '').trim();
    const scopeCourseName =
      String(params.scopeCourseName ?? '').trim() ||
      String(params.courseName ?? '').trim();
    if (!facultyGroup || !campusName || !scopeCourseName) {
      throw new BadRequestException(
        'Para aplicar horario a todo el curso se requiere facultyGroup, campusName y courseName.'
      );
    }
    if (this.courseKey(facultyGroup) !== 'general') {
      throw new BadRequestException(
        'La sincronizacion masiva desde horario de seccion esta habilitada solo para Bienvenida.'
      );
    }
    const scope = await this.sectionsService.resolveMotherAndSiblingsForScope({
      facultyGroup,
      campusName,
      courseName: scopeCourseName,
    });
    if (String(scope.mother.sectionId ?? '').trim() !== String(params.sectionId ?? '').trim()) {
      throw new BadRequestException(
        'La sincronizacion masiva solo se permite desde la seccion madre del curso.'
      );
    }
    if (
      this.courseKey(scope.mother.courseName) !==
      this.courseKey(String(params.courseName ?? ''))
    ) {
      throw new BadRequestException(
        'El curso del bloque no coincide con el alcance de sincronizacion.'
      );
    }
    return scope.scoped
      .map((item) => String(item.sectionCourseId ?? '').trim())
      .filter(Boolean);
  }

  private courseKey(value: string | null | undefined) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  private filterStudentScheduleConflictsByKind(
    students: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      conflicts: Array<{
        kind: 'COURSE' | 'WORKSHOP';
        candidateBlock: string;
        conflictingBlock: string;
      }>;
    }>,
    kind: 'COURSE' | 'WORKSHOP'
  ) {
    return students
      .map((student) => ({
        ...student,
        conflicts: student.conflicts.filter((conflict) => conflict.kind === kind),
      }))
      .filter((student) => student.conflicts.length > 0);
  }

  private buildStudentScheduleConflictPayload(
    affectedStudents: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      conflicts: Array<{
        kind: 'COURSE' | 'WORKSHOP';
        candidateBlock: string;
        conflictingBlock: string;
      }>;
    }>
  ) {
    const totalConflicts = affectedStudents.reduce(
      (acc, student) => acc + student.conflicts.length,
      0
    );
    return {
      message:
        affectedStudents.length === 1
          ? 'No se puede guardar el horario del curso: 1 alumno presentaria cruce con otro curso de nivelacion.'
          : `No se puede guardar el horario del curso: ${affectedStudents.length} alumnos presentarian cruces con otros cursos de nivelacion.`,
      code: 'SECTION_COURSE_STUDENT_SCHEDULE_CONFLICT',
      summary: {
        affectedStudents: affectedStudents.length,
        totalConflicts,
      },
      students: affectedStudents.slice(0, 10).map((student) => ({
        studentId: student.studentId,
        dni: student.dni,
        codigoAlumno: student.codigoAlumno,
        fullName: student.fullName,
        conflicts: student.conflicts.slice(0, 5).map((conflict) => ({
          kind: conflict.kind,
          reason: `${conflict.candidateBlock} cruza con ${conflict.conflictingBlock}`,
          candidateBlock: conflict.candidateBlock,
          conflictingBlock: conflict.conflictingBlock,
        })),
      })),
    };
  }

  private buildWorkshopScheduleWarningPayload(
    affectedStudents: Array<{
      studentId: string;
      dni: string | null;
      codigoAlumno: string | null;
      fullName: string;
      conflicts: Array<{
        kind: 'COURSE' | 'WORKSHOP';
        candidateBlock: string;
        conflictingBlock: string;
      }>;
    }>
  ) {
    if (affectedStudents.length <= 0) return null;
    const totalConflicts = affectedStudents.reduce(
      (acc, student) => acc + student.conflicts.length,
      0
    );
    return {
      code: 'SECTION_COURSE_WORKSHOP_SCHEDULE_WARNING',
      message:
        'Horario guardado con alerta: hay alumnos con cruce con talleres. Coordina con el encargado de taller para gestionar el cambio de grupo.',
      workshops: Array.from(
        new Set(
          affectedStudents
            .flatMap((student) => student.conflicts)
            .map((conflict) => String(conflict.conflictingBlock ?? '').split(' | ')[0]?.trim())
            .filter(Boolean)
        )
      ).slice(0, 5),
      summary: {
        affectedStudents: affectedStudents.length,
        totalConflicts,
      },
      students: affectedStudents.slice(0, 10).map((student) => ({
        studentId: student.studentId,
        dni: student.dni,
        codigoAlumno: student.codigoAlumno,
        fullName: student.fullName,
        conflicts: student.conflicts.slice(0, 5).map((conflict) => ({
          kind: 'WORKSHOP' as const,
          reason: `${conflict.candidateBlock} cruza con ${conflict.conflictingBlock}`,
          candidateBlock: conflict.candidateBlock,
          conflictingBlock: conflict.conflictingBlock,
        })),
      })),
    };
  }

  private toAuditSnapshot(block: Partial<ScheduleBlockEntity>) {
    const sectionId = (block as any).sectionId ?? block.section?.id ?? null;
    return {
      sectionId,
      sectionCourseId: block.sectionCourseId ?? null,
      courseName: block.courseName ?? null,
      dayOfWeek: Number(block.dayOfWeek ?? 0),
      startTime: block.startTime ? String(block.startTime).slice(0, 5) : null,
      endTime: block.endTime ? String(block.endTime).slice(0, 5) : null,
      startDate: block.startDate ? String(block.startDate).slice(0, 10) : null,
      endDate: block.endDate ? String(block.endDate).slice(0, 10) : null,
      referenceModality: block.referenceModality ?? null,
      referenceClassroom: block.referenceClassroom ?? null,
      location: block.location ?? null,
    };
  }
}
