import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ZoomHostStatus = 'ACTIVO' | 'INACTIVO';

@Entity({ name: 'zoom_hosts' })
export class ZoomHostEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'char', length: 36 })
  groupId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'enum', enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' })
  status!: ZoomHostStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
