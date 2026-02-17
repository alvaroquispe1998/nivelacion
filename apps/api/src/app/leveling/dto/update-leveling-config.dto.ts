import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateLevelingConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  initialCapacity!: number;

  // 0 means unlimited overflow.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity!: number;
}
