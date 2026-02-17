import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectionEntity } from './section.entity';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SectionEntity])],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService, TypeOrmModule],
})
export class SectionsModule {}

