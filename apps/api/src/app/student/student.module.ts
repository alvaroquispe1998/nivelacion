import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';
import { WorkshopsModule } from '../workshops/workshops.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduleBlockEntity]),
    WorkshopsModule,
  ],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
