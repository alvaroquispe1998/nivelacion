import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { PeriodEntity } from '../periods/period.entity';

@Entity({ name: 'student_enrollments' })
@Index('UQ_student_enrollment_period_student', ['period', 'student'], { unique: true })
export class StudentEnrollmentEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ManyToOne(() => PeriodEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'periodId' })
    period!: PeriodEntity;

    @Column({ type: 'char', length: 36 })
    periodId!: string;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'studentId' })
    student!: UserEntity;

    @Column({ type: 'char', length: 36 })
    studentId!: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    facultyGroup!: string | null;

    @Column({ type: 'varchar', length: 120, nullable: true })
    campusName!: string | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    careerName!: string | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
