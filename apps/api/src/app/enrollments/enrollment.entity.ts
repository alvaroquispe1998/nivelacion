import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SectionEntity } from '../sections/section.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'enrollments' })
@Unique(['section', 'student'])
@Unique(['student'])
export class EnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SectionEntity, (s) => s.enrollments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section!: SectionEntity;

  @ManyToOne(() => UserEntity, (u) => u.enrollments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student!: UserEntity;

  @CreateDateColumn()
  createdAt!: Date;
}
