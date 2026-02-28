import { IsNotEmpty, IsString } from 'class-validator';

export class AdminStudentReportSearchDto {
  @IsString()
  @IsNotEmpty()
  q!: string;
}
