import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AKADEMIC_SECCIONES_FIXTURE } from './fixtures/secciones.fixture';

@Injectable()
export class AkademicService {
  private readonly logger = new Logger(AkademicService.name);

  constructor(private readonly config: ConfigService) {}

  async getSecciones(courseId?: string) {
    const mode = this.config.get<string>('AKADEMIC_MODE', 'mock');
    if (mode === 'mock') return AKADEMIC_SECCIONES_FIXTURE;

    if (mode !== 'real') {
      throw new ServiceUnavailableException('Invalid AKADEMIC_MODE');
    }

    const cookie = this.config.get<string>('AKADEMIC_COOKIE');
    if (!cookie) {
      throw new BadGatewayException('AKADEMIC_COOKIE is missing or expired');
    }

    const url = this.config.get<string>('AKADEMIC_SECCIONES_URL');
    if (!url) {
      throw new ServiceUnavailableException('AKADEMIC_SECCIONES_URL is not configured');
    }

    try {
      const res = await axios.get(url, {
        params: courseId ? { courseId } : undefined,
        headers: { Cookie: cookie },
        timeout: 15000,
      });
      return res.data;
    } catch (err: any) {
      const status = err?.response?.status;
      this.logger.warn(`Akademic proxy error status=${status ?? 'unknown'}`);
      if (status === 401 || status === 403) {
        throw new BadGatewayException('Akademic cookie expired');
      }
      throw new BadGatewayException('Akademic proxy failed');
    }
  }
}

