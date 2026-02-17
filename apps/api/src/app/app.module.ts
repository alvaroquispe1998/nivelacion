import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LevelingModule } from './leveling/leveling.module';
import { ScheduleBlocksModule } from './schedule-blocks/schedule-blocks.module';
import { SectionsModule } from './sections/sections.module';
import { StudentModule } from './student/student.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    SectionsModule,
    EnrollmentsModule,
    ScheduleBlocksModule,
    AttendanceModule,
    StudentModule,
    IntegrationsModule,
    LevelingModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
