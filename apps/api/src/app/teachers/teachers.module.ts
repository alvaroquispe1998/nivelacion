import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService, TypeOrmModule],
})
export class TeachersModule {}
