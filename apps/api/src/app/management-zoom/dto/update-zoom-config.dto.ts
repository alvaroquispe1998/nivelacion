import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateZoomConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  clientSecret?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
