import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectionCourseTeacherEntity } from './section-course-teacher.entity';
import { SectionEntity } from './section.entity';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';
import { PeriodsModule } from '../periods/periods.module';
import { UserEntity } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SectionEntity, UserEntity, SectionCourseTeacherEntity]),
    PeriodsModule,
  ],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService, TypeOrmModule],
})
export class SectionsModule {}
