import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PeriodEntity } from './period.entity';
import { PeriodsController } from './periods.controller';
import { PeriodsPublicController } from './periods-public.controller';
import { PeriodsService } from './periods.service';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodEntity]), AuditModule],
  controllers: [PeriodsController, PeriodsPublicController],
  providers: [PeriodsService],
  exports: [PeriodsService, TypeOrmModule],
})
export class PeriodsModule {}
