import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AkademicController } from './akademic.controller';
import { AkademicService } from './akademic.service';

@Module({
  imports: [ConfigModule],
  controllers: [AkademicController],
  providers: [AkademicService],
})
export class AkademicModule {}

