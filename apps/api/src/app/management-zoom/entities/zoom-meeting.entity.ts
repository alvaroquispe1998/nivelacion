import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ZoomMeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'DELETED';
export type ZoomMeetingMode = 'ONE_TIME' | 'RECURRING';
export type ZoomRecurrenceType = 'WEEKLY';
export type ZoomRecurrenceEndMode = 'UNTIL_DATE' | 'BY_COUNT';

@Entity({ name: 'zoom_meetings' })
export class ZoomMeetingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  periodId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  hostEmail!: string;

  @Column({ type: 'bigint' })
  zoomMeetingId!: string;

  @Column({ type: 'varchar', length: 255 })
  topic!: string;

  @Column({ type: 'text', nullable: true })
  agenda!: string | null;

  @Column({ type: 'datetime' })
  startTime!: Date;

  @Column({ type: 'datetime' })
  endTime!: Date;

  @Column({ type: 'int', unsigned: true })
  duration!: number;

  @Column({
    type: 'enum',
    enum: ['ONE_TIME', 'RECURRING'],
    default: 'ONE_TIME',
  })
  meetingMode!: ZoomMeetingMode;

  @Column({ type: 'varchar', length: 20, nullable: true })
  recurrenceType!: ZoomRecurrenceType | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  repeatInterval!: number | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  weeklyDays!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  recurrenceEndMode!: ZoomRecurrenceEndMode | null;

  @Column({ type: 'date', nullable: true })
  recurrenceEndDate!: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  recurrenceEndTimes!: number | null;

  @Column({ type: 'varchar', length: 60, default: 'America/Lima' })
  timezone!: string;

  @Column({ type: 'varchar', length: 1024, default: '' })
  joinUrl!: string;

  @Column({ type: 'varchar', length: 2048, default: '' })
  startUrl!: string;

  @Column({
    type: 'enum',
    enum: ['SCHEDULED', 'LIVE', 'ENDED', 'DELETED'],
    default: 'SCHEDULED',
  })
  status!: ZoomMeetingStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
