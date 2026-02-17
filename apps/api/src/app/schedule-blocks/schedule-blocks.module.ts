import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectionsModule } from '../sections/sections.module';
import { ScheduleBlockEntity } from './schedule-block.entity';
import { ScheduleBlocksController } from './schedule-blocks.controller';
import { ScheduleBlocksService } from './schedule-blocks.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduleBlockEntity]), SectionsModule],
  controllers: [ScheduleBlocksController],
  providers: [ScheduleBlocksService],
  exports: [TypeOrmModule, ScheduleBlocksService],
})
export class ScheduleBlocksModule {}

