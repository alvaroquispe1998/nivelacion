import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTypeOrmOptionsFromConfig } from './typeorm.options';
import { MigrationRunnerService } from './migration-runner.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createTypeOrmOptionsFromConfig,
    }),
  ],
  providers: [MigrationRunnerService],
})
export class DatabaseModule {}

