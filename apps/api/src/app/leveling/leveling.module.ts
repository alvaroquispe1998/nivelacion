import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module';
import { LevelingController } from './leveling.controller';
import { LevelingService } from './leveling.service';

@Module({
  imports: [PeriodsModule],
  controllers: [LevelingController],
  providers: [LevelingService],
})
export class LevelingModule {}
