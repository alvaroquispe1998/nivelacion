import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuditActor, AuditService } from '../audit/audit.service';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly auditService: AuditService
  ) {}

  async list() {
    return this.usersRepo.find({
      where: { role: Role.DOCENTE },
      order: { fullName: 'ASC' },
    });
  }

  async create(params: { dni: string; fullName: string; actor?: AuditActor | null }) {
    const dni = String(params.dni || '').trim();
    const fullName = String(params.fullName || '').trim();
    const existing = await this.usersRepo.findOne({ where: { dni } });
    if (existing) {
      throw new ConflictException('Teacher DNI already exists');
    }
    const created = this.usersRepo.create({
      dni,
      fullName,
      role: Role.DOCENTE,
      codigoAlumno: null,
      passwordHash: await bcrypt.hash(dni, 10),
    });
    const saved = await this.usersRepo.save(created);
    await this.auditService.recordChange({
      moduleName: 'TEACHERS',
      entityType: 'TEACHER',
      entityId: saved.id,
      entityLabel: saved.fullName,
      action: 'CREATE',
      actor: params.actor ?? null,
      before: null,
      after: this.toAuditSnapshot(saved),
    });
    return saved;
  }

  async update(
    id: string,
    params: { dni?: string; fullName?: string; actor?: AuditActor | null }
  ) {
    const teacher = await this.getByIdOrThrow(id);
    const before = this.toAuditSnapshot(teacher);
    const nextDni = params.dni !== undefined ? String(params.dni).trim() : teacher.dni;
    const nextFullName =
      params.fullName !== undefined
        ? String(params.fullName).trim()
        : teacher.fullName;

    if (nextDni !== teacher.dni) {
      const duplicate = await this.usersRepo.findOne({ where: { dni: nextDni } });
      if (duplicate && duplicate.id !== teacher.id) {
        throw new ConflictException('Teacher DNI already exists');
      }
      teacher.dni = nextDni;
      teacher.passwordHash = await bcrypt.hash(nextDni, 10);
    }

    teacher.fullName = nextFullName;
    const saved = await this.usersRepo.save(teacher);
    await this.auditService.recordChange({
      moduleName: 'TEACHERS',
      entityType: 'TEACHER',
      entityId: saved.id,
      entityLabel: saved.fullName,
      action: 'UPDATE',
      actor: params.actor ?? null,
      before,
      after: this.toAuditSnapshot(saved),
    });
    return saved;
  }

  async remove(id: string, actor?: AuditActor | null) {
    const teacher = await this.getByIdOrThrow(id);
    const before = this.toAuditSnapshot(teacher);
    await this.usersRepo.remove(teacher);
    await this.auditService.recordChange({
      moduleName: 'TEACHERS',
      entityType: 'TEACHER',
      entityId: before.id,
      entityLabel: before.fullName,
      action: 'DELETE',
      actor: actor ?? null,
      before,
      after: null,
    });
    return { ok: true };
  }

  async getByIdOrThrow(id: string) {
    const teacher = await this.usersRepo.findOne({
      where: { id, role: Role.DOCENTE },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }

  private toAuditSnapshot(teacher: UserEntity) {
    return {
      id: teacher.id,
      dni: teacher.dni,
      fullName: teacher.fullName,
      role: teacher.role,
    };
  }
}
