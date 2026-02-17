import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Injectable()
export class MigrationRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationRunnerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap() {
    const flag = this.config.get<string>('DB_RUN_MIGRATIONS');
    const enabled =
      flag === undefined
        ? this.config.get<string>('NODE_ENV') !== 'production'
        : flag === 'true';

    if (!enabled) return;

    this.logger.log('Running database migrations...');
    await this.dataSource.runMigrations();
    this.logger.log('Database migrations completed.');
  }
}

