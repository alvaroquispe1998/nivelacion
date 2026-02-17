import { Module } from '@nestjs/common';
import { AkademicModule } from './akademic/akademic.module';

@Module({
  imports: [AkademicModule],
})
export class IntegrationsModule {}

