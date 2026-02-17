import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  akademicSectionId?: string;

  @IsOptional()
  @IsString()
  facultyGroup?: string;

  @IsOptional()
  @IsString()
  facultyName?: string;

  @IsOptional()
  @IsString()
  campusName?: string;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  initialCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  maxExtraCapacity?: number;

  @IsOptional()
  isAutoLeveling?: boolean;
}
