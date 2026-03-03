import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZoomConfigEntity } from './entities/zoom-config.entity';
import { ZoomHostGroupEntity } from './entities/zoom-host-group.entity';
import { ZoomHostEntity } from './entities/zoom-host.entity';
import { ZoomMeetingEntity } from './entities/zoom-meeting.entity';
import { ZoomService } from './zoom.service';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { ZoomConfigController } from './zoom-config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ZoomConfigEntity,
      ZoomHostGroupEntity,
      ZoomHostEntity,
      ZoomMeetingEntity,
    ]),
  ],
  controllers: [MeetingsController, ZoomConfigController],
  providers: [ZoomService, MeetingsService],
  exports: [ZoomService, MeetingsService],
})
export class ManagementZoomModule {}
