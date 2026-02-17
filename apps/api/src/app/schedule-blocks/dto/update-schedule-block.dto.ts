import { PartialType } from '@nestjs/swagger';
import { CreateScheduleBlockDto } from './create-schedule-block.dto';

// sectionId is ignored on update (we keep it optional in DTO for simplicity)
export class UpdateScheduleBlockDto extends PartialType(CreateScheduleBlockDto) {}

