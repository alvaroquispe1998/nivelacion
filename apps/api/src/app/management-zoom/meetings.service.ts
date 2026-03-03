import {
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
import { ZoomMeetingEntity } from './entities/zoom-meeting.entity';

// ── Helper types ─────────────────────────────────────────────────────────────

interface OverlapCheckMeeting {
  id: number;
  start_time: string;
  duration: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Host Groups CRUD
  // ═══════════════════════════════════════════════════════════════════════════

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
    if (result.affected === 0)
      throw new NotFoundException('Grupo no encontrado');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Hosts CRUD
  // ═══════════════════════════════════════════════════════════════════════════

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
    if (data.email !== undefined)
      host.email = data.email.trim().toLowerCase();
    if (data.status !== undefined) host.status = data.status;
    return this.hostsRepo.save(host);
  }

  async deleteHost(id: string) {
    const result = await this.hostsRepo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException('Host no encontrado');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Timezone helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a local datetime string (e.g. "2026-03-03T09:30") in a given
   * IANA timezone to an absolute UTC Date.
   * Example: localToUtc("2026-03-03T09:30", "America/Lima") → 2026-03-03T14:30:00Z
   */
  private localToUtc(localDateStr: string, timezone: string): Date {
    const clean = localDateStr.replace(/Z$/i, '');
    // Treat the string as if it were UTC temporarily
    const asUtc = new Date(clean + 'Z');
    if (isNaN(asUtc.getTime())) return asUtc; // let caller handle NaN

    // Measure the offset between UTC and the target timezone
    const utcRepr = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzRepr  = new Date(asUtc.toLocaleString('en-US', { timeZone: timezone }));
    const offsetMs = utcRepr.getTime() - tzRepr.getTime();

    // local + offset = UTC
    return new Date(asUtc.getTime() + offsetMs);
  }

  /**
   * Ensure a datetime string has seconds so Zoom API parses it correctly.
   * "2026-03-03T09:30" → "2026-03-03T09:30:00"
   */
  private formatLocalTime(dateStr: string): string {
    const clean = dateStr.replace(/Z$/i, '').replace(/\.\d+$/, '');
    if (/T\d{2}:\d{2}$/.test(clean)) return clean + ':00';
    return clean;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto Meeting Creation (Smart Host Selection)
  // ═══════════════════════════════════════════════════════════════════════════

  async createAutoMeeting(params: {
    topic: string;
    agenda?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
    groupId?: string;
    periodId?: string;
  }) {
    const config = await this.zoomService.getConfig();
    const tz = params.timezone ?? config.timezone ?? 'America/Lima';
    const maxConcurrent = config.maxConcurrent ?? 2;

    // Convert local times (in the given timezone) → real UTC
    const startUtc = this.localToUtc(params.startTime, tz);
    const endUtc = this.localToUtc(params.endTime, tz);
    if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
      throw new ConflictException('Fechas inválidas');
    }

    const durationMin = Math.round(
      (endUtc.getTime() - startUtc.getTime()) / 60_000,
    );
    if (durationMin <= 0) {
      throw new ConflictException(
        'La fecha de fin debe ser posterior a la de inicio',
      );
    }

    // Load active hosts (optionally filtered by group)
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

    const hostsChecked: string[] = [];

    for (const host of hosts) {
      hostsChecked.push(host.email);

      try {
        // Fetch LIVE + UPCOMING meetings from Zoom
        const [liveMeetings, upcomingMeetings] = await Promise.all([
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
        ]);

        // Deduplicate by Zoom meeting ID
        const seenIds = new Set<number>();
        const allMeetings: OverlapCheckMeeting[] = [];
        for (const m of [...liveMeetings, ...upcomingMeetings]) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            allMeetings.push({
              id: m.id,
              start_time: m.start_time,
              duration: m.duration,
            });
          }
        }

        // Calculate overlaps: overlap = (startA < endB) && (startB < endA)
        let overlaps = 0;
        for (const m of allMeetings) {
          const mStart = new Date(m.start_time);
          const mEnd = new Date(
            mStart.getTime() + m.duration * 60_000,
          );
          if (startUtc < mEnd && mStart < endUtc) {
            overlaps++;
          }
        }

        if (overlaps < maxConcurrent) {
          // Host is available → create meeting
          // Send local time WITH seconds and WITHOUT 'Z' so Zoom
          // interprets it in the provided timezone parameter
          const localStart = this.formatLocalTime(params.startTime);
          const zoomResponse = await this.zoomService.createMeeting(
            host.email,
            {
              topic: params.topic,
              agenda: params.agenda,
              start_time: localStart,
              duration: durationMin,
              timezone: tz,
            },
          );

          // Persist in our DB
          const meeting = this.meetingsRepo.create({
            periodId: params.periodId ?? null,
            hostEmail: host.email,
            zoomMeetingId: String(zoomResponse.id),
            topic: params.topic,
            agenda: params.agenda ?? null,
            startTime: startUtc,
            endTime: endUtc,
            duration: durationMin,
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
          };
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Error checking host ${host.email}: ${msg}`);
        continue;
      }
    }

    throw new ConflictException({
      error:
        'Límite de concurrencia alcanzado para todos los hosts',
      hosts_checked: hostsChecked,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Delete Meeting
  // ═══════════════════════════════════════════════════════════════════════════

  async deleteMeeting(id: string) {
    const meeting = await this.meetingsRepo.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');

    try {
      await this.zoomService.deleteMeeting(meeting.zoomMeetingId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error desconocido';
      this.logger.warn(
        `Could not delete Zoom meeting ${meeting.zoomMeetingId}: ${msg}`,
      );
    }

    meeting.status = 'DELETED';
    await this.meetingsRepo.save(meeting);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // List / Search Meetings
  // ═══════════════════════════════════════════════════════════════════════════

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

    return qb.getMany();
  }

  async searchByTopic(topic: string, limit = 20) {
    return this.meetingsRepo
      .createQueryBuilder('m')
      .where('m.topic LIKE :topic', { topic: `%${topic}%` })
      .andWhere('m.status != :deleted', { deleted: 'DELETED' })
      .orderBy('m.startTime', 'DESC')
      .limit(limit)
      .getMany();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Recordings (Zoom API pass-through)
  // ═══════════════════════════════════════════════════════════════════════════

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
          ...recordings.map((r) => ({ ...r, host_email: email })),
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(
          `Error fetching recordings for ${email}: ${msg}`,
        );
      }
    }

    return allRecordings;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Licensed Users
  // ═══════════════════════════════════════════════════════════════════════════

  async listLicensedUsers() {
    const users = await this.zoomService.listLicensedUsers();
    return { total: users.length, users };
  }
}
