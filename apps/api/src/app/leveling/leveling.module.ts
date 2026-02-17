import { Module } from '@nestjs/common';
import { LevelingController } from './leveling.controller';
import { LevelingService } from './leveling.service';

@Module({
  controllers: [LevelingController],
  providers: [LevelingService],
})
export class LevelingModule {}
