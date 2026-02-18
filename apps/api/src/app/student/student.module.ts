import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecordEntity } from '../attendance/attendance-record.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduleBlockEntity, AttendanceRecordEntity]),
  ],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
