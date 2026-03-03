import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsString()
  @IsNotEmpty()
  start_time!: string;

  @IsString()
  @IsNotEmpty()
  end_time!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;
}
