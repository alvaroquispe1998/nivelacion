import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZoomService } from './zoom.service';
import { ZoomHostEntity } from './entities/zoom-host.entity';
import { ZoomHostGroupEntity } from './entities/zoom-host-group.entity';
import {
  ZoomMeetingEntity,
  ZoomMeetingMode,
  ZoomRecurrenceEndMode,
  ZoomRecurrenceType,
} from './entities/zoom-meeting.entity';

interface CreateRecurrenceInput {
  type: 'WEEKLY';
  repeat_interval: number;
  weekly_days: number[];
  end_mode: 'UNTIL_DATE' | 'BY_COUNT';
  end_date?: string;
  end_times?: number;
}

interface NormalizedRecurrence {
  type: ZoomRecurrenceType;
  repeatInterval: number;
  weeklyDays: number[];
  endMode: ZoomRecurrenceEndMode;
  endDate: string | null;
  endTimes: number | null;
}

interface RequestedOccurrence {
  startUtc: Date;
  endUtc: Date;
}

interface StoredOccurrence {
  startUtc: Date;
  endUtc: Date;
  zoomMeetingId: string;
}

interface LocalDateTimeParts {
  datePart: string;
  timePart: string;
  normalized: string;
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly zoomService: ZoomService,
    @InjectRepository(ZoomHostEntity)
    private readonly hostsRepo: Repository<ZoomHostEntity>,
    @InjectRepository(ZoomHostGroupEntity)
    private readonly groupsRepo: Repository<ZoomHostGroupEntity>,
    @InjectRepository(ZoomMeetingEntity)
    private readonly meetingsRepo: Repository<ZoomMeetingEntity>,
  ) {}

  async listGroups() {
    const groups = await this.groupsRepo.find({
      order: { name: 'ASC' },
    });
    const hosts = await this.hostsRepo.find({
      order: { email: 'ASC' },
    });
    return groups.map((g) => ({
      ...g,
      hosts: hosts.filter((h) => h.groupId === g.id),
    }));
  }

  async createGroup(name: string) {
    const group = this.groupsRepo.create({ name, status: 'ACTIVO' });
    return this.groupsRepo.save(group);
  }

  async updateGroup(
    id: string,
    data: { name?: string; status?: 'ACTIVO' | 'INACTIVO' },
  ) {
    const group = await this.groupsRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    if (data.name !== undefined) group.name = data.name;
    if (data.status !== undefined) group.status = data.status;
    return this.groupsRepo.save(group);
  }

  async deleteGroup(id: string) {
    const result = await this.groupsRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Grupo no encontrado');
    }
  }

  async addHost(groupId: string, email: string) {
    const group = await this.groupsRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    const host = this.hostsRepo.create({
      groupId,
      email: email.trim().toLowerCase(),
      status: 'ACTIVO',
    });
    return this.hostsRepo.save(host);
  }

  async updateHost(
    id: string,
    data: { email?: string; status?: 'ACTIVO' | 'INACTIVO' },
  ) {
    const host = await this.hostsRepo.findOne({ where: { id } });
    if (!host) throw new NotFoundException('Host no encontrado');
    if (data.email !== undefined) {
      host.email = data.email.trim().toLowerCase();
    }
    if (data.status !== undefined) host.status = data.status;
    return this.hostsRepo.save(host);
  }

  async deleteHost(id: string) {
    const result = await this.hostsRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Host no encontrado');
    }
  }

  private localToUtc(localDateStr: string, timezone: string): Date {
    const clean = localDateStr.replace(/Z$/i, '');
    const asUtc = new Date(clean + 'Z');
    if (isNaN(asUtc.getTime())) return asUtc;

    const utcRepr = new Date(
      asUtc.toLocaleString('en-US', { timeZone: 'UTC' }),
    );
    const tzRepr = new Date(
      asUtc.toLocaleString('en-US', { timeZone: timezone }),
    );
    const offsetMs = utcRepr.getTime() - tzRepr.getTime();

    return new Date(asUtc.getTime() + offsetMs);
  }

  private formatLocalTime(dateStr: string): string {
    const clean = dateStr.replace(/Z$/i, '').replace(/\.\d+$/, '');
    if (/T\d{2}:\d{2}$/.test(clean)) return clean + ':00';
    return clean;
  }

  private splitLocalDateTime(dateStr: string): LocalDateTimeParts {
    const normalized = this.formatLocalTime(dateStr);
    const match =
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(normalized);
    if (!match) {
      throw new BadRequestException('Fecha y hora invalidas');
    }

    const timePart = match[2].length === 5 ? `${match[2]}:00` : match[2];
    return {
      datePart: match[1],
      timePart,
      normalized: `${match[1]}T${timePart}`,
    };
  }

  private compareDateParts(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private addDays(datePart: string, days: number): string {
    const base = new Date(`${datePart}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
  }

  private zoomWeekdayFromDate(datePart: string): number {
    const date = new Date(`${datePart}T00:00:00Z`);
    const day = date.getUTCDay();
    return day === 0 ? 1 : day + 1;
  }

  private localDateToUtcIso(
    datePart: string,
    timePart: string,
    timezone: string,
  ): string {
    return this.localToUtc(`${datePart}T${timePart}`, timezone)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private localDateEndToUtcIso(datePart: string, timezone: string): string {
    return this.localDateToUtcIso(datePart, '23:59:59', timezone);
  }

  private serializeWeeklyDays(days: number[]): string {
    return days.join(',');
  }

  private parseWeeklyDays(value: string | null | undefined): number[] {
    return String(value ?? '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
      .sort((a, b) => a - b);
  }

  private normalizeMeetingMode(mode?: ZoomMeetingMode): ZoomMeetingMode {
    return mode === 'RECURRING' ? 'RECURRING' : 'ONE_TIME';
  }

  private normalizeRecurrence(
    meetingMode: ZoomMeetingMode,
    recurrence: CreateRecurrenceInput | undefined,
    startTime: string,
    endTime: string,
  ): NormalizedRecurrence | null {
    if (meetingMode === 'ONE_TIME') return null;
    if (!recurrence) {
      throw new BadRequestException(
        'La recurrencia es obligatoria para reuniones recurrentes',
      );
    }
    if (recurrence.type !== 'WEEKLY') {
      throw new BadRequestException('Solo se admite recurrencia semanal');
    }

    const repeatInterval = Number(recurrence.repeat_interval);
    if (!Number.isInteger(repeatInterval) || repeatInterval < 1 || repeatInterval > 12) {
      throw new BadRequestException(
        'repeat_interval debe estar entre 1 y 12',
      );
    }

    const weeklyDays = Array.from(new Set(recurrence.weekly_days ?? []))
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
      .sort((a, b) => a - b);
    if (weeklyDays.length === 0) {
      throw new BadRequestException('weekly_days es obligatorio');
    }

    const startParts = this.splitLocalDateTime(startTime);
    const endParts = this.splitLocalDateTime(endTime);
    if (startParts.datePart !== endParts.datePart) {
      throw new BadRequestException(
        'Las reuniones recurrentes deben usar la misma fecha para inicio y fin',
      );
    }

    const startWeekday = this.zoomWeekdayFromDate(startParts.datePart);
    if (!weeklyDays.includes(startWeekday)) {
      throw new BadRequestException(
        'La fecha de inicio debe coincidir con uno de los dias seleccionados',
      );
    }

    if (recurrence.end_mode !== 'UNTIL_DATE' && recurrence.end_mode !== 'BY_COUNT') {
      throw new BadRequestException('end_mode invalido');
    }

    if (recurrence.end_mode === 'UNTIL_DATE') {
      if (!recurrence.end_date) {
        throw new BadRequestException('end_date es obligatorio');
      }
      if (this.compareDateParts(recurrence.end_date, startParts.datePart) < 0) {
        throw new BadRequestException(
          'La fecha fin de recurrencia no puede ser anterior al inicio',
        );
      }

      return {
        type: 'WEEKLY',
        repeatInterval,
        weeklyDays,
        endMode: 'UNTIL_DATE',
        endDate: recurrence.end_date,
        endTimes: null,
      };
    }

    const endTimes = Number(recurrence.end_times);
    if (!Number.isInteger(endTimes) || endTimes < 1) {
      throw new BadRequestException('end_times debe ser un entero positivo');
    }

    return {
      type: 'WEEKLY',
      repeatInterval,
      weeklyDays,
      endMode: 'BY_COUNT',
      endDate: null,
      endTimes,
    };
  }

  private buildOccurrences(
    firstStart: string,
    firstEnd: string,
    timezone: string,
    recurrence: NormalizedRecurrence | null,
  ): RequestedOccurrence[] {
    if (!recurrence) {
      const startUtc = this.localToUtc(firstStart, timezone);
      const endUtc = this.localToUtc(firstEnd, timezone);
      return [{ startUtc, endUtc }];
    }

    const startParts = this.splitLocalDateTime(firstStart);
    const endParts = this.splitLocalDateTime(firstEnd);
    const firstDate = startParts.datePart;
    const firstWeekday = this.zoomWeekdayFromDate(firstDate);
    const weekStart = this.addDays(firstDate, -(firstWeekday - 1));
    const occurrences: RequestedOccurrence[] = [];
    const maxIterations = 520;
    let created = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const currentWeekStart = this.addDays(
        weekStart,
        iteration * recurrence.repeatInterval * 7,
      );

      if (
        recurrence.endMode === 'UNTIL_DATE' &&
        recurrence.endDate &&
        this.compareDateParts(currentWeekStart, recurrence.endDate) > 0
      ) {
        break;
      }

      for (const weekday of recurrence.weeklyDays) {
        const occurrenceDate = this.addDays(currentWeekStart, weekday - 1);

        if (this.compareDateParts(occurrenceDate, firstDate) < 0) continue;
        if (
          recurrence.endMode === 'UNTIL_DATE' &&
          recurrence.endDate &&
          this.compareDateParts(occurrenceDate, recurrence.endDate) > 0
        ) {
          continue;
        }

        const startUtc = this.localToUtc(
          `${occurrenceDate}T${startParts.timePart}`,
          timezone,
        );
        const endUtc = this.localToUtc(
          `${occurrenceDate}T${endParts.timePart}`,
          timezone,
        );
        occurrences.push({ startUtc, endUtc });
        created++;

        if (
          recurrence.endMode === 'BY_COUNT' &&
          recurrence.endTimes !== null &&
          created >= recurrence.endTimes
        ) {
          return occurrences;
        }
      }
    }

    if (occurrences.length === 0) {
      throw new BadRequestException(
        'La recurrencia no genero ninguna ocurrencia valida',
      );
    }

    if (
      recurrence.endMode === 'BY_COUNT' &&
      recurrence.endTimes !== null &&
      occurrences.length < recurrence.endTimes
    ) {
      throw new BadRequestException(
        'No se pudieron generar todas las ocurrencias solicitadas',
      );
    }

    return occurrences;
  }

  private rangesOverlap(
    aStart: Date,
    aEnd: Date,
    bStart: Date,
    bEnd: Date,
  ): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  private buildRecurrenceSummary(meeting: ZoomMeetingEntity): string {
    if (meeting.meetingMode !== 'RECURRING') return 'Unica';

    const days = this.parseWeeklyDays(meeting.weeklyDays);
    const labels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const daysLabel = days
      .map((day) => labels[day - 1] ?? `Dia ${day}`)
      .join('/');
    const everyLabel =
      meeting.repeatInterval === 1
        ? 'cada 1 semana'
        : `cada ${meeting.repeatInterval} semanas`;

    if (meeting.recurrenceEndMode === 'UNTIL_DATE' && meeting.recurrenceEndDate) {
      return `Recurrente: ${daysLabel}, ${everyLabel}, hasta ${meeting.recurrenceEndDate}`;
    }

    if (meeting.recurrenceEndMode === 'BY_COUNT' && meeting.recurrenceEndTimes) {
      return `Recurrente: ${daysLabel}, ${everyLabel}, ${meeting.recurrenceEndTimes} veces`;
    }

    return `Recurrente: ${daysLabel}, ${everyLabel}`;
  }

  private toMeetingView(meeting: ZoomMeetingEntity) {
    const weeklyDays = this.parseWeeklyDays(meeting.weeklyDays);
    const recurrence =
      meeting.meetingMode === 'RECURRING' && meeting.recurrenceType === 'WEEKLY'
        ? {
            type: 'WEEKLY' as const,
            repeatInterval: meeting.repeatInterval ?? 1,
            weeklyDays,
            endMode: (meeting.recurrenceEndMode ?? 'BY_COUNT') as
              | 'UNTIL_DATE'
              | 'BY_COUNT',
            endDate: meeting.recurrenceEndDate ?? null,
            endTimes: meeting.recurrenceEndTimes ?? null,
          }
        : null;

    return {
      id: meeting.id,
      periodId: meeting.periodId,
      hostEmail: meeting.hostEmail,
      zoomMeetingId: meeting.zoomMeetingId,
      topic: meeting.topic,
      agenda: meeting.agenda,
      startTime: meeting.startTime instanceof Date
        ? meeting.startTime.toISOString()
        : String(meeting.startTime),
      endTime: meeting.endTime instanceof Date
        ? meeting.endTime.toISOString()
        : String(meeting.endTime),
      duration: meeting.duration,
      meetingMode: meeting.meetingMode ?? 'ONE_TIME',
      recurrence,
      recurrenceSummary: this.buildRecurrenceSummary(meeting),
      timezone: meeting.timezone,
      joinUrl: meeting.joinUrl,
      startUrl: meeting.startUrl,
      status: meeting.status,
      createdAt: meeting.createdAt instanceof Date
        ? meeting.createdAt.toISOString()
        : String(meeting.createdAt),
    };
  }

  private expandStoredRecurringMeeting(
    meeting: ZoomMeetingEntity,
    windowStart: Date,
    windowEnd: Date,
  ): StoredOccurrence[] {
    if (
      meeting.meetingMode !== 'RECURRING' ||
      meeting.recurrenceType !== 'WEEKLY' ||
      !meeting.startTime ||
      !meeting.endTime
    ) {
      return [];
    }

    const recurrence: NormalizedRecurrence = {
      type: 'WEEKLY',
      repeatInterval: meeting.repeatInterval ?? 1,
      weeklyDays: this.parseWeeklyDays(meeting.weeklyDays),
      endMode: (meeting.recurrenceEndMode ?? 'BY_COUNT') as ZoomRecurrenceEndMode,
      endDate: meeting.recurrenceEndDate ?? null,
      endTimes: meeting.recurrenceEndTimes ?? null,
    };
    if (recurrence.weeklyDays.length === 0) return [];

    const firstStartLocal = this.toLocalDateTimeString(meeting.startTime, meeting.timezone);
    const firstEndLocal = this.toLocalDateTimeString(meeting.endTime, meeting.timezone);
    const occurrences = this.buildOccurrences(
      firstStartLocal,
      firstEndLocal,
      meeting.timezone,
      recurrence,
    );

    return occurrences
      .filter((occurrence) =>
        this.rangesOverlap(
          occurrence.startUtc,
          occurrence.endUtc,
          windowStart,
          windowEnd,
        ),
      )
      .map((occurrence) => ({
        startUtc: occurrence.startUtc,
        endUtc: occurrence.endUtc,
        zoomMeetingId: meeting.zoomMeetingId,
      }));
  }

  private toLocalDateTimeString(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter
      .formatToParts(date)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }

  async createAutoMeeting(params: {
    topic: string;
    agenda?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
    meetingMode?: ZoomMeetingMode;
    recurrence?: CreateRecurrenceInput;
    groupId?: string;
    periodId?: string;
  }) {
    const config = await this.zoomService.getConfig();
    const tz = params.timezone ?? config.timezone ?? 'America/Lima';
    const maxConcurrent = config.maxConcurrent ?? 2;
    const meetingMode = this.normalizeMeetingMode(params.meetingMode);
    const recurrence = this.normalizeRecurrence(
      meetingMode,
      params.recurrence,
      params.startTime,
      params.endTime,
    );
    const requestedOccurrences = this.buildOccurrences(
      params.startTime,
      params.endTime,
      tz,
      recurrence,
    );

    if (requestedOccurrences.length === 0) {
      throw new ConflictException('No se generaron ocurrencias validas');
    }

    const startUtc = requestedOccurrences[0].startUtc;
    const endUtc = requestedOccurrences[0].endUtc;
    if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
      throw new ConflictException('Fechas invalidas');
    }

    const durationMin = Math.round(
      (endUtc.getTime() - startUtc.getTime()) / 60_000,
    );
    if (durationMin <= 0) {
      throw new ConflictException(
        'La fecha de fin debe ser posterior a la de inicio',
      );
    }

    const hostQuery = this.hostsRepo
      .createQueryBuilder('h')
      .innerJoin('zoom_host_groups', 'g', 'g.id = h.groupId')
      .where('h.status = :hStatus', { hStatus: 'ACTIVO' })
      .andWhere('g.status = :gStatus', { gStatus: 'ACTIVO' });

    if (params.groupId) {
      hostQuery.andWhere('h.groupId = :groupId', {
        groupId: params.groupId,
      });
    }

    const hosts = await hostQuery.getMany();
    if (hosts.length === 0) {
      throw new ConflictException('No hay hosts activos disponibles');
    }

    const requestWindowStart = requestedOccurrences[0].startUtc;
    const requestWindowEnd =
      requestedOccurrences[requestedOccurrences.length - 1].endUtc;
    const hostsChecked: string[] = [];

    for (const host of hosts) {
      hostsChecked.push(host.email);

      try {
        const [liveMeetings, upcomingMeetings, storedMeetings] = await Promise.all([
          this.zoomService.listUserMeetings(
            host.email,
            'live',
            config.pageSize,
          ),
          this.zoomService.listUserMeetings(
            host.email,
            'upcoming',
            config.pageSize,
          ),
          this.meetingsRepo.find({
            where: {
              hostEmail: host.email,
            },
          }),
        ]);

        const activeStoredMeetings = storedMeetings.filter(
          (meeting) => meeting.status !== 'DELETED',
        );
        const managedRecurringIds = new Set(
          activeStoredMeetings
            .filter((meeting) => meeting.meetingMode === 'RECURRING')
            .map((meeting) => String(meeting.zoomMeetingId)),
        );

        const seenIds = new Set<number>();
        const zoomOccurrences: StoredOccurrence[] = [];
        for (const meeting of [...liveMeetings, ...upcomingMeetings]) {
          if (managedRecurringIds.has(String(meeting.id))) continue;
          if (seenIds.has(meeting.id)) continue;
          seenIds.add(meeting.id);

          const start = new Date(meeting.start_time);
          const end = new Date(start.getTime() + meeting.duration * 60_000);
          zoomOccurrences.push({
            startUtc: start,
            endUtc: end,
            zoomMeetingId: String(meeting.id),
          });
        }

        const storedRecurringOccurrences = activeStoredMeetings.flatMap((meeting) =>
          this.expandStoredRecurringMeeting(
            meeting,
            requestWindowStart,
            requestWindowEnd,
          ),
        );

        const allExistingOccurrences = [
          ...zoomOccurrences,
          ...storedRecurringOccurrences,
        ];

        const exceedsConcurrency = requestedOccurrences.some((requested) => {
          let overlaps = 0;
          for (const existing of allExistingOccurrences) {
            if (
              this.rangesOverlap(
                requested.startUtc,
                requested.endUtc,
                existing.startUtc,
                existing.endUtc,
              )
            ) {
              overlaps++;
            }
          }
          return overlaps >= maxConcurrent;
        });

        if (exceedsConcurrency) {
          continue;
        }

        const localStart = this.formatLocalTime(params.startTime);
        const zoomResponse = await this.zoomService.createMeeting(host.email, {
          topic: params.topic,
          agenda: params.agenda,
          start_time: localStart,
          duration: durationMin,
          timezone: tz,
          meeting_mode: meetingMode,
          recurrence: recurrence
            ? {
                type: 'WEEKLY',
                repeat_interval: recurrence.repeatInterval,
                weekly_days: recurrence.weeklyDays,
                end_mode: recurrence.endMode,
                ...(recurrence.endMode === 'UNTIL_DATE' && recurrence.endDate
                  ? {
                      end_date: this.localDateEndToUtcIso(
                        recurrence.endDate,
                        tz,
                      ),
                    }
                  : {}),
                ...(recurrence.endMode === 'BY_COUNT' &&
                recurrence.endTimes !== null
                  ? { end_times: recurrence.endTimes }
                  : {}),
              }
            : undefined,
        });

        const meeting = this.meetingsRepo.create({
          periodId: params.periodId ?? null,
          hostEmail: host.email,
          zoomMeetingId: String(zoomResponse.id),
          topic: params.topic,
          agenda: params.agenda ?? null,
          startTime: startUtc,
          endTime: endUtc,
          duration: durationMin,
          meetingMode,
          recurrenceType: recurrence?.type ?? null,
          repeatInterval: recurrence?.repeatInterval ?? null,
          weeklyDays: recurrence
            ? this.serializeWeeklyDays(recurrence.weeklyDays)
            : null,
          recurrenceEndMode: recurrence?.endMode ?? null,
          recurrenceEndDate: recurrence?.endDate ?? null,
          recurrenceEndTimes: recurrence?.endTimes ?? null,
          timezone: tz,
          joinUrl: zoomResponse.join_url ?? '',
          startUrl: zoomResponse.start_url ?? '',
          status: 'SCHEDULED',
        });
        const saved = await this.meetingsRepo.save(meeting);

        return {
          id: saved.id,
          host: host.email,
          zoomMeetingId: zoomResponse.id,
          topic: saved.topic,
          start_time: saved.startTime,
          end_time: saved.endTime,
          duration: saved.duration,
          join_url: saved.joinUrl,
          start_url: saved.startUrl,
          meetingMode: saved.meetingMode,
          recurrenceSummary: this.buildRecurrenceSummary(saved),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Error checking host ${host.email}: ${msg}`);
        continue;
      }
    }

    throw new ConflictException({
      error: 'Limite de concurrencia alcanzado para todos los hosts',
      hosts_checked: hostsChecked,
    });
  }

  async deleteMeeting(id: string) {
    const meeting = await this.meetingsRepo.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunion no encontrada');

    try {
      await this.zoomService.deleteMeeting(meeting.zoomMeetingId);
    } catch (err: unknown) {
      const msg = this.getZoomDeleteErrorMessage(err);
      if (!this.isZoomMeetingAlreadyDeleted(msg)) {
        this.logger.warn(
          `Could not delete Zoom meeting ${meeting.zoomMeetingId}: ${msg}`,
        );
        throw new BadGatewayException(
          'No se pudo eliminar la reunion en Zoom. El registro local no fue modificado.',
        );
      }

      this.logger.warn(
        `Zoom meeting ${meeting.zoomMeetingId} was already missing remotely. Marking local meeting as deleted.`,
      );
    }

    meeting.status = 'DELETED';
    await this.meetingsRepo.save(meeting);
  }

  async refreshMeetingLinks(id: string) {
    const meeting = await this.meetingsRepo.findOne({ where: { id } });
    if (!meeting || meeting.status === 'DELETED') {
      throw new NotFoundException('Reunion Zoom no encontrada');
    }

    try {
      const remote = await this.zoomService.getMeeting(meeting.zoomMeetingId);
      meeting.joinUrl = String(remote.join_url ?? '').trim() || meeting.joinUrl;
      meeting.startUrl = String(remote.start_url ?? '').trim() || meeting.startUrl;
      await this.meetingsRepo.save(meeting);
      return {
        joinUrl: meeting.joinUrl || null,
        startUrl: meeting.startUrl || null,
        meetingMode: meeting.meetingMode ?? 'ONE_TIME',
      };
    } catch (err: unknown) {
      const msg = this.getZoomDeleteErrorMessage(err);
      if (this.isZoomMeetingAlreadyDeleted(msg)) {
        meeting.status = 'DELETED';
        await this.meetingsRepo.save(meeting);
        throw new NotFoundException(
          'La reunion Zoom asociada ya no existe. Debes crearla nuevamente.',
        );
      }
      throw new BadGatewayException(
        'No se pudieron renovar los enlaces de la reunion en Zoom.',
      );
    }
  }

  private getZoomDeleteErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error ?? 'Error desconocido');
  }

  private isZoomMeetingAlreadyDeleted(message: string) {
    const normalized = String(message ?? '').toLowerCase();
    return (
      normalized.includes('404') ||
      normalized.includes('3001') ||
      normalized.includes('meeting does not exist') ||
      normalized.includes('reunion no encontrada')
    );
  }

  async listMeetings(params: {
    hostEmails?: string;
    from?: string;
    to?: string;
    periodId?: string;
  }) {
    const qb = this.meetingsRepo
      .createQueryBuilder('m')
      .where('m.status != :deleted', { deleted: 'DELETED' })
      .orderBy('m.startTime', 'DESC');

    if (params.periodId) {
      qb.andWhere('m.periodId = :periodId', {
        periodId: params.periodId,
      });
    }

    if (params.hostEmails) {
      const emails = params.hostEmails
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      if (emails.length > 0) {
        qb.andWhere('m.hostEmail IN (:...emails)', { emails });
      }
    }

    if (params.from) {
      qb.andWhere('m.startTime >= :from', { from: params.from });
    }
    if (params.to) {
      qb.andWhere('m.startTime <= :to', { to: params.to });
    }

    const meetings = await qb.getMany();
    return meetings.map((meeting) => this.toMeetingView(meeting));
  }

  async searchByTopic(topic: string, limit = 20) {
    const meetings = await this.meetingsRepo
      .createQueryBuilder('m')
      .where('m.topic LIKE :topic', { topic: `%${topic}%` })
      .andWhere('m.status != :deleted', { deleted: 'DELETED' })
      .orderBy('m.startTime', 'DESC')
      .limit(limit)
      .getMany();

    return meetings.map((meeting) => this.toMeetingView(meeting));
  }

  async listRecordings(params: {
    hostEmails?: string;
    from: string;
    to: string;
  }) {
    const config = await this.zoomService.getConfig();

    let emails: string[] = [];
    if (params.hostEmails) {
      emails = params.hostEmails
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
    } else {
      const hosts = await this.hostsRepo.find({
        where: { status: 'ACTIVO' },
      });
      emails = hosts.map((h) => h.email);
    }

    const allRecordings: Record<string, unknown>[] = [];
    for (const email of emails) {
      try {
        const recordings = await this.zoomService.listRecordings(
          email,
          params.from,
          params.to,
          config.pageSize,
        );
        allRecordings.push(
          ...recordings.map((recording) => ({
            ...recording,
            host_email: email,
          })),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Error fetching recordings for ${email}: ${msg}`);
      }
    }

    return allRecordings;
  }

  async listLicensedUsers() {
    const users = await this.zoomService.listLicensedUsers();
    return { total: users.length, users };
  }
}
