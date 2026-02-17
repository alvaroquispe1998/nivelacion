import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectionsModule } from '../sections/sections.module';
import { UsersModule } from '../users/users.module';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { EnrollmentEntity } from './enrollment.entity';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EnrollmentEntity, ScheduleBlockEntity]),
    UsersModule,
    SectionsModule,
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService, TypeOrmModule],
})
export class EnrollmentsModule {}

