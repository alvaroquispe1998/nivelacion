import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BulkApplyFromMotherDto {
  @IsString()
  @IsNotEmpty()
  facultyGroup!: string;

  @IsString()
  @IsNotEmpty()
  campusName!: string;

  @IsString()
  @IsNotEmpty()
  courseName!: string;

  @IsOptional()
  @IsString()
  modality?: string | null;
}

