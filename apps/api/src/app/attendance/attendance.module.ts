import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
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
      EnrollmentEntity,
    ]),
    UsersModule,
    EnrollmentsModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}

