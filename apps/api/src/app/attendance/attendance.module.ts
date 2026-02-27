import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodsModule } from '../periods/periods.module';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { UsersModule } from '../users/users.module';
import { AttendanceRecordEntity } from './attendance-record.entity';
import { AttendanceSessionEntity } from './attendance-session.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceSessionEntity,
      AttendanceRecordEntity,
      ScheduleBlockEntity,
    ]),
    PeriodsModule,
    UsersModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
