import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LevelingModule } from './leveling/leveling.module';
import { PeriodsModule } from './periods/periods.module';
import { ScheduleBlocksModule } from './schedule-blocks/schedule-blocks.module';
import { SectionsModule } from './sections/sections.module';
import { StudentModule } from './student/student.module';
import { TeachersModule } from './teachers/teachers.module';
import { TeacherModule } from './teacher/teacher.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    PeriodsModule,
    SectionsModule,
    ScheduleBlocksModule,
    AttendanceModule,
    StudentModule,
    IntegrationsModule,
    LevelingModule,
    TeachersModule,
    TeacherModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
