import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class UpdateSectionCourseCapacityByCourseNameDto {
    @IsString()
    @IsNotEmpty()
    courseName!: string;

    @IsInt()
    @Min(0)
    initialCapacity!: number;

    @IsInt()
    @Min(0)
    maxExtraCapacity!: number;
}
