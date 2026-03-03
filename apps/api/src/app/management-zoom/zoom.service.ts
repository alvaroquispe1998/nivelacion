import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZoomConfigEntity } from './entities/zoom-config.entity';

// ── Zoom API response types ─────────────────────────────────────────────────

export interface ZoomMeetingResponse {
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  join_url: string;
  start_url: string;
  status: string;
  type: number;
}

interface ZoomMeetingListResponse {
  page_size: number;
  total_records: number;
  next_page_token: string;
  meetings: ZoomMeetingResponse[];
}

export interface ZoomRecordingFile {
  id: string;
  file_type: string;
  file_size: number;
  download_url: string;
  play_url: string;
  recording_start: string;
  recording_end: string;
  status: string;
}

export interface ZoomRecordingMeeting {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  total_size: number;
  recording_count: number;
  recording_files: ZoomRecordingFile[];
  host_email: string;
}

interface ZoomRecordingsResponse {
  from: string;
  to: string;
  next_page_token: string;
  page_size: number;
  total_records: number;
  meetings: ZoomRecordingMeeting[];
}

export interface ZoomUserResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  type: number;
  status: string;
}

interface ZoomUsersListResponse {
  page_size: number;
  total_records: number;
  next_page_token: string;
  users: ZoomUserResponse[];
}

// ── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private tokenCache: TokenCache | null = null;

  constructor(
    @InjectRepository(ZoomConfigEntity)
    private readonly configRepo: Repository<ZoomConfigEntity>,
  ) {}

  // ── Config helpers ──────────────────────────────────────────────────────

  async getConfig(): Promise<ZoomConfigEntity> {
    const config = await this.configRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!config) {
      throw new BadRequestException(
        'Zoom no está configurado. Configure las credenciales primero.',
      );
    }
    return config;
  }

  async getOrCreateConfig(): Promise<ZoomConfigEntity> {
    let config = await this.configRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!config) {
      config = this.configRepo.create({
        accountId: '',
        clientId: '',
        clientSecret: '',
        maxConcurrent: 2,
        pageSize: 20,
        timezone: 'America/Lima',
      });
      config = await this.configRepo.save(config);
    }
    return config;
  }

  async saveConfig(
    data: Partial<ZoomConfigEntity>,
  ): Promise<ZoomConfigEntity> {
    const config = await this.getOrCreateConfig();

    if (data.accountId !== undefined) config.accountId = data.accountId;
    if (data.clientId !== undefined) config.clientId = data.clientId;
    if (
      data.clientSecret !== undefined &&
      !data.clientSecret.startsWith('••')
    ) {
      config.clientSecret = data.clientSecret;
    }
    if (data.maxConcurrent !== undefined)
      config.maxConcurrent = data.maxConcurrent;
    if (data.pageSize !== undefined) config.pageSize = data.pageSize;
    if (data.timezone !== undefined) config.timezone = data.timezone;

    const saved = await this.configRepo.save(config);
    this.tokenCache = null; // invalidate on credential change
    return saved;
  }

  // ── OAuth S2S ──────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (
      this.tokenCache &&
      this.tokenCache.expiresAt > Date.now() + 60_000
    ) {
      return this.tokenCache.accessToken;
    }

    const config = await this.getConfig();
    if (!config.accountId || !config.clientId || !config.clientSecret) {
      throw new BadRequestException('Credenciales de Zoom incompletas.');
    }

    const credentials = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64');

    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: config.accountId,
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Zoom OAuth failed: ${res.status} ${body}`);
      throw new BadRequestException(
        `Error de autenticación con Zoom: ${res.status}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  // ── Generic Zoom API caller ────────────────────────────────────────────

  private async zoomFetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = path.startsWith('http')
      ? path
      : `https://api.zoom.us/v2${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });

    // Rate limit → retry once
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 1);
      this.logger.warn(
        `Zoom rate limit hit, retrying after ${retryAfter}s`,
      );
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.zoomFetch<T>(path, options);
    }

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Zoom API error: ${res.status} ${path} → ${body}`);
      throw new BadRequestException(
        `Error de Zoom API: ${res.status} - ${body}`,
      );
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  // ── Public API wrappers ────────────────────────────────────────────────

  /** List meetings for a user (type: live | upcoming) */
  async listUserMeetings(
    userEmail: string,
    type: 'live' | 'upcoming',
    pageSize = 20,
  ): Promise<ZoomMeetingResponse[]> {
    const all: ZoomMeetingResponse[] = [];
    let nextPageToken = '';

    do {
      const params = new URLSearchParams({
        type,
        page_size: String(pageSize),
      });
      if (nextPageToken) params.set('next_page_token', nextPageToken);

      const data = await this.zoomFetch<ZoomMeetingListResponse>(
        `/users/${encodeURIComponent(userEmail)}/meetings?${params}`,
      );
      all.push(...(data.meetings ?? []));
      nextPageToken = data.next_page_token ?? '';
    } while (nextPageToken);

    return all;
  }

  /** Create a scheduled meeting for a specific host */
  async createMeeting(
    hostEmail: string,
    body: {
      topic: string;
      agenda?: string;
      start_time: string;
      duration: number;
      timezone: string;
    },
  ): Promise<ZoomMeetingResponse> {
    return this.zoomFetch<ZoomMeetingResponse>(
      `/users/${encodeURIComponent(hostEmail)}/meetings`,
      {
        method: 'POST',
        body: JSON.stringify({
          topic: body.topic,
          type: 2, // scheduled
          start_time: body.start_time,
          duration: body.duration,
          timezone: body.timezone,
          agenda: body.agenda ?? '',
          settings: {
            join_before_host: true,
            waiting_room: false,
          },
        }),
      },
    );
  }

  /** Delete a meeting by its Zoom ID */
  async deleteMeeting(meetingId: string | number): Promise<void> {
    await this.zoomFetch<unknown>(`/meetings/${meetingId}`, {
      method: 'DELETE',
    });
  }

  /** List recordings for a user in a date range */
  async listRecordings(
    userEmail: string,
    from: string,
    to: string,
    pageSize = 20,
  ): Promise<ZoomRecordingMeeting[]> {
    const all: ZoomRecordingMeeting[] = [];
    let nextPageToken = '';

    do {
      const params = new URLSearchParams({
        from,
        to,
        page_size: String(pageSize),
      });
      if (nextPageToken) params.set('next_page_token', nextPageToken);

      const data = await this.zoomFetch<ZoomRecordingsResponse>(
        `/users/${encodeURIComponent(userEmail)}/recordings?${params}`,
      );
      all.push(...(data.meetings ?? []));
      nextPageToken = data.next_page_token ?? '';
    } while (nextPageToken);

    return all;
  }

  /** List licensed users from the Zoom account */
  async listLicensedUsers(): Promise<ZoomUserResponse[]> {
    const all: ZoomUserResponse[] = [];
    let nextPageToken = '';

    do {
      const params = new URLSearchParams({
        status: 'active',
        page_size: '300',
      });
      if (nextPageToken) params.set('next_page_token', nextPageToken);

      const data = await this.zoomFetch<ZoomUsersListResponse>(
        `/users?${params}`,
      );
      const licensed = (data.users ?? []).filter((u) => u.type === 2);
      all.push(...licensed);
      nextPageToken = data.next_page_token ?? '';
    } while (nextPageToken);

    return all;
  }

  /** Quick connectivity check */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      this.tokenCache = null;
      await this.getAccessToken();
      return { ok: true, message: 'Conexión exitosa con Zoom' };
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Error desconocido';
      return { ok: false, message: msg };
    }
  }
}
