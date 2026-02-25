import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassroomEntity } from './classroom.entity';
import { PavilionEntity } from './pavilion.entity';
import { ClassroomsController } from './classrooms.controller';
import { ClassroomsService } from './classrooms.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClassroomEntity, PavilionEntity])],
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [TypeOrmModule, ClassroomsService],
})
export class ClassroomsModule {}
