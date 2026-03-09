import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ScheduleBlocksModule } from '../schedule-blocks/schedule-blocks.module';
import { SectionsModule } from '../sections/sections.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { TeacherController } from './teacher.controller';

@Module({
  imports: [AttendanceModule, ScheduleBlocksModule, SectionsModule, WorkshopsModule],
  controllers: [TeacherController],
})
export class TeacherModule {}
