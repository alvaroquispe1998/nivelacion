import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ZoomMeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'DELETED';

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
