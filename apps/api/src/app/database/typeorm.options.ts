import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { AttendanceSessionEntity } from '../attendance/attendance-session.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';
import { Init001Migration1760000000000 } from './migrations/001-init.migration';
import { AcademicCatalogs002Migration1761000000000 } from './migrations/002-academic-catalogs.migration';
import { AcademicCatalogsEnglish003Migration1761100000000 } from './migrations/003-academic-catalogs-english.migration';
import { AcademicSeedAndCourses004Migration1761200000000 } from './migrations/004-academic-seed-and-courses.migration';
import { SeedCampuses005Migration1761300000000 } from './migrations/005-seed-campuses.migration';
import { SectionLevelingFields006Migration1761400000000 } from './migrations/006-section-leveling-fields.migration';
import { LevelingConfig007Migration1761500000000 } from './migrations/007-leveling-config.migration';
import { OneSectionPerStudent008Migration1761600000000 } from './migrations/008-one-section-per-student.migration';

export const TYPEORM_ENTITIES = [
  UserEntity,
  SectionEntity,
  EnrollmentEntity,
  ScheduleBlockEntity,
  AttendanceSessionEntity,
  AttendanceRecordEntity,
];

export const TYPEORM_MIGRATIONS = [
  Init001Migration1760000000000,
  AcademicCatalogs002Migration1761000000000,
  AcademicCatalogsEnglish003Migration1761100000000,
  AcademicSeedAndCourses004Migration1761200000000,
  SeedCampuses005Migration1761300000000,
  SectionLevelingFields006Migration1761400000000,
  LevelingConfig007Migration1761500000000,
  OneSectionPerStudent008Migration1761600000000,
];

export function createDataSourceOptionsFromEnv(): DataSourceOptions {
  return {
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME ?? 'uai',
    entities: TYPEORM_ENTITIES,
    migrations: TYPEORM_MIGRATIONS,
    synchronize: false,
  };
}

export function createTypeOrmOptionsFromConfig(
  config: ConfigService
): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '3306')),
    username: config.get<string>('DB_USER', 'root'),
    password: config.get<string>('DB_PASS', ''),
    database: config.get<string>('DB_NAME', 'uai'),
    entities: TYPEORM_ENTITIES,
    migrations: TYPEORM_MIGRATIONS,
    synchronize: false,
    logging: config.get<string>('DB_LOGGING', 'false') === 'true',
  };
}
