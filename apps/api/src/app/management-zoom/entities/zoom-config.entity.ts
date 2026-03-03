import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'zoom_config' })
export class ZoomConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  accountId!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  clientId!: string;

  @Column({ type: 'varchar', length: 512, default: '' })
  clientSecret!: string;

  @Column({ type: 'int', unsigned: true, default: 2 })
  maxConcurrent!: number;

  @Column({ type: 'int', unsigned: true, default: 20 })
  pageSize!: number;

  @Column({ type: 'varchar', length: 60, default: 'America/Lima' })
  timezone!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
