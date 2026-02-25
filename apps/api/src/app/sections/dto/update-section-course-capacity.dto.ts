import { IsInt, Max, Min } from 'class-validator';

export class UpdateSectionCourseCapacityDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  initialCapacity!: number;

  // 0 means no extra seats above initial capacity.
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity!: number;
}
