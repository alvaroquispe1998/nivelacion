import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagementZoomModule } from '../management-zoom/management-zoom.module';
import { PeriodsModule } from '../periods/periods.module';
import { SectionsModule } from '../sections/sections.module';
import { ScheduleBlockEntity } from './schedule-block.entity';
import { ScheduleBlocksController } from './schedule-blocks.controller';
import { ScheduleBlocksService } from './schedule-blocks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduleBlockEntity]),
    ManagementZoomModule,
    SectionsModule,
    PeriodsModule,
  ],
  controllers: [ScheduleBlocksController],
  providers: [ScheduleBlocksService],
  exports: [TypeOrmModule, ScheduleBlocksService],
})
export class ScheduleBlocksModule {}
