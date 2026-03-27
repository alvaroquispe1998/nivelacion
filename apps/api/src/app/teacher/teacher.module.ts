import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { GradesModule } from '../grades/grades.module';
import { ScheduleBlocksModule } from '../schedule-blocks/schedule-blocks.module';
import { SectionsModule } from '../sections/sections.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { TeacherController } from './teacher.controller';

@Module({
  imports: [
    AttendanceModule,
    GradesModule,
    ScheduleBlocksModule,
    SectionsModule,
    WorkshopsModule,
  ],
  controllers: [TeacherController],
})
export class TeacherModule {}
