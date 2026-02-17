import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { ScheduleBlockEntity } from '../schedule-blocks/schedule-block.entity';

@Entity({ name: 'sections' })
export class SectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 30, unique: true, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  akademicSectionId!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  facultyGroup!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  facultyName!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  campusName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  modality!: string | null;

  @Column({ type: 'int', unsigned: true, default: 45 })
  initialCapacity!: number;

  // 0 means no hard max extra capacity (unlimited overflow).
  @Column({ type: 'int', unsigned: true, default: 0 })
  maxExtraCapacity!: number;

  @Column({ type: 'boolean', default: false })
  isAutoLeveling!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => EnrollmentEntity, (e) => e.section)
  enrollments!: EnrollmentEntity[];

  @OneToMany(() => ScheduleBlockEntity, (b) => b.section)
  scheduleBlocks!: ScheduleBlockEntity[];
}
