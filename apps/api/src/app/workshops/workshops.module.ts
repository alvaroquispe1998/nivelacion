import { Module } from '@nestjs/common';
import { WorkshopsController } from './workshops.controller';
import { WorkshopsService } from './workshops.service';
import { PeriodsModule } from '../periods/periods.module';
import { ManagementZoomModule } from '../management-zoom/management-zoom.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PeriodsModule, ManagementZoomModule, AuditModule],
  controllers: [WorkshopsController],
  providers: [WorkshopsService],
  exports: [WorkshopsService],
})
export class WorkshopsModule {}
