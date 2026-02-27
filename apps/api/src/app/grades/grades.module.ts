import { Module } from '@nestjs/common';
import { SectionsModule } from '../sections/sections.module';
import { PeriodsModule } from '../periods/periods.module';
import { GradesService } from './grades.service';
import { AdminGradesController } from './admin-grades.controller';
import { TeacherGradesController } from './teacher-grades.controller';
import { StudentGradesController } from './student-grades.controller';

@Module({
  imports: [PeriodsModule, SectionsModule],
  controllers: [
    AdminGradesController,
    TeacherGradesController,
    StudentGradesController,
  ],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}

