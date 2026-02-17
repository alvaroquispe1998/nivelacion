import { IsInt, Max, Min } from 'class-validator';

export class UpdateSectionCapacityDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  initialCapacity!: number;

  // 0 means unlimited overflow for this section.
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity!: number;
}
