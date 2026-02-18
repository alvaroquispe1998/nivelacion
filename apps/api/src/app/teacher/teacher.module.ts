import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { SectionsModule } from '../sections/sections.module';
import { TeacherController } from './teacher.controller';

@Module({
  imports: [AttendanceModule, SectionsModule],
  controllers: [TeacherController],
})
export class TeacherModule {}
