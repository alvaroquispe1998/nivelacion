import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}
