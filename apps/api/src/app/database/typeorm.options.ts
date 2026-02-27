import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { AttendanceSessionEntity } from '../attendance/attendance-session.entity';
import { ClassroomEntity } from '../classrooms/classroom.entity';
import { PavilionEntity } from '../classrooms/pavilion.entity';
import { PeriodEntity } from '../periods/period.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { LevelingRunEntity } from '../leveling/leveling-run.entity';
import { LevelingRunStudentCourseDemandEntity } from '../leveling/leveling-run-student-course-demand.entity';
import { SectionCourseTeacherEntity } from '../sections/section-course-teacher.entity';
import { SectionEntity } from '../sections/section.entity';
import { TeacherEntity } from '../teachers/teacher.entity';
import { UserEntity } from '../users/user.entity';
import { Init001Migration1760000000000 } from './migrations/001-init.migration';
import { AcademicCatalogs002Migration1761000000000 } from './migrations/002-academic-catalogs.migration';
import { AcademicCatalogsEnglish003Migration1761100000000 } from './migrations/003-academic-catalogs-english.migration';
import { AcademicSeedAndCourses004Migration1761200000000 } from './migrations/004-academic-seed-and-courses.migration';
import { SeedCampuses005Migration1761300000000 } from './migrations/005-seed-campuses.migration';
import { SectionLevelingFields006Migration1761400000000 } from './migrations/006-section-leveling-fields.migration';
import { LevelingConfig007Migration1761500000000 } from './migrations/007-leveling-config.migration';
import { OneSectionPerStudent008Migration1761600000000 } from './migrations/008-one-section-per-student.migration';
import { CoursesAkademicAndSectionCourses009Migration1761700000000 } from './migrations/009-courses-akademic-and-section-courses.migration';
import { AllowMultiSectionPerStudent010Migration1761800000000 } from './migrations/010-allow-multi-section-per-student.migration';
import { TeachersAndSectionTeacher011Migration1761900000000 } from './migrations/011-teachers-and-section-teacher.migration';
import { SectionStudentCourses012Migration1762000000000 } from './migrations/012-section-student-courses.migration';
import { ScheduleBlockValidity013Migration1762100000000 } from './migrations/013-schedule-block-validity.migration';
import { SectionCourseTeachers014Migration1762200000000 } from './migrations/014-section-course-teachers.migration';
import { SectionCourseRefactorAndDocenteUser015Migration1762300000000 } from './migrations/015-section-course-refactor-and-docente-user.migration';
import { CatalogsUuid016Migration1762400000000 } from './migrations/016-catalogs-uuid.migration';
import { PeriodsAndSectionCourses017Migration1762500000000 } from './migrations/017-periods-and-section-courses.migration';
import { UsersStudentProfileFields018Migration1762600000000 } from './migrations/018-users-student-profile-fields.migration';
import { SeedDefaultAdmin019Migration1762700000000 } from './migrations/019-seed-default-admin.migration';
import { RemoveLegacyDemoAdmin020Migration1762800000000 } from './migrations/020-remove-legacy-demo-admin.migration';
import { PeriodKindSpanishValues021Migration1762900000000 } from './migrations/021-period-kind-spanish-values.migration';
import { LevelingRunsAndStaging022Migration1763000000000 } from './migrations/022-leveling-runs-and-staging.migration';
import { LevelingRunSectionCourseCapacities023Migration1763100000000 } from './migrations/023-leveling-run-section-course-capacities.migration';
import { SectionCourseCapacity024Migration1763200000000 } from './migrations/024-section-course-capacity.migration';
import { LevelingRunReports025Migration1763300000000 } from './migrations/025-leveling-run-reports.migration';
import { UsersCareerName026Migration1763400000000 } from './migrations/026-users-career-name.migration';
import { StudentsExamDate027Migration1771682907120 } from './migrations/027-students-exam-date.migration';
import { LevelingRunDemandExamAndModality028Migration1772500000000 } from './migrations/028-leveling-run-demand-exam-and-modality.migration';
import { ClassroomsAndPhysicalCapacity029Migration1773500000000 } from './migrations/029-classrooms-and-physical-capacity.migration';
import { ClassroomsCampusRelation030Migration1773600000000 } from './migrations/030-classrooms-campus-relation.migration';
import { PavilionsAndClassroomLevel031Migration1773700000000 } from './migrations/031-pavilions-and-classroom-level.migration';
import { RenameFicaFacultyName032Migration1773800000000 } from './migrations/032-rename-fica-faculty-name.migration';
import { ScheduleBlockReferenceFields033Migration1773900000000 } from './migrations/033-schedule-block-reference-fields.migration';
import { GradesCore034Migration1774000000000 } from './migrations/034-grades-core.migration';

export const TYPEORM_ENTITIES = [
  UserEntity,
  PeriodEntity,
  SectionEntity,
  SectionCourseTeacherEntity,
  ClassroomEntity,
  PavilionEntity,
  TeacherEntity,
  ScheduleBlockEntity,
  LevelingRunEntity,
  LevelingRunStudentCourseDemandEntity,
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
  CoursesAkademicAndSectionCourses009Migration1761700000000,
  AllowMultiSectionPerStudent010Migration1761800000000,
  TeachersAndSectionTeacher011Migration1761900000000,
  SectionStudentCourses012Migration1762000000000,
  ScheduleBlockValidity013Migration1762100000000,
  SectionCourseTeachers014Migration1762200000000,
  SectionCourseRefactorAndDocenteUser015Migration1762300000000,
  CatalogsUuid016Migration1762400000000,
  PeriodsAndSectionCourses017Migration1762500000000,
  UsersStudentProfileFields018Migration1762600000000,
  SeedDefaultAdmin019Migration1762700000000,
  RemoveLegacyDemoAdmin020Migration1762800000000,
  PeriodKindSpanishValues021Migration1762900000000,
  LevelingRunsAndStaging022Migration1763000000000,
  LevelingRunSectionCourseCapacities023Migration1763100000000,
  SectionCourseCapacity024Migration1763200000000,
  LevelingRunReports025Migration1763300000000,
  UsersCareerName026Migration1763400000000,
  StudentsExamDate027Migration1771682907120,
  LevelingRunDemandExamAndModality028Migration1772500000000,
  ClassroomsAndPhysicalCapacity029Migration1773500000000,
  ClassroomsCampusRelation030Migration1773600000000,
  PavilionsAndClassroomLevel031Migration1773700000000,
  RenameFicaFacultyName032Migration1773800000000,
  ScheduleBlockReferenceFields033Migration1773900000000,
  GradesCore034Migration1774000000000,
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
