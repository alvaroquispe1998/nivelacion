import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BulkEnrollDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dnis!: string[];
}

