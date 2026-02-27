import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class LevelingPlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  initialCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes';
    }
    return false;
  })
  @IsBoolean()
  apply?: boolean;

  @IsOptional()
  @IsString()
  groupModalityOverrides?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['REPLACE', 'APPEND'])
  mode?: 'REPLACE' | 'APPEND';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes' || v === 'si';
    }
    return false;
  })
  @IsBoolean()
  includeWelcomeCourse?: boolean;

  @ValidateIf((dto: LevelingPlanDto) => Boolean(dto.includeWelcomeCourse))
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @IsNotEmpty()
  welcomeCourseName?: string;

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsIn(['BY_SIZE', 'SINGLE_GROUP'])
  welcomeGroupingMode?: 'BY_SIZE' | 'SINGLE_GROUP';

  @ValidateIf(
    (dto: LevelingPlanDto) =>
      Boolean(dto.includeWelcomeCourse) &&
      String(dto.welcomeGroupingMode ?? 'BY_SIZE').trim().toUpperCase() ===
        'BY_SIZE'
  )
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  welcomeGroupSize?: number;
}
