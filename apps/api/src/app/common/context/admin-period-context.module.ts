import { Global, Module } from '@nestjs/common';
import { AdminPeriodContextService } from './admin-period-context.service';

@Global()
@Module({
  providers: [AdminPeriodContextService],
  exports: [AdminPeriodContextService],
})
export class AdminPeriodContextModule {}

