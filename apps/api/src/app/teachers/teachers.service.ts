import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>
  ) {}

  async list() {
    return this.usersRepo.find({
      where: { role: Role.DOCENTE },
      order: { fullName: 'ASC' },
    });
  }

  async create(params: { dni: string; fullName: string; password: string }) {
    const dni = String(params.dni || '').trim();
    const fullName = String(params.fullName || '').trim();
    const password = String(params.password || '');
    const existing = await this.usersRepo.findOne({ where: { dni } });
    if (existing) {
      throw new ConflictException('Teacher DNI already exists');
    }
    const created = this.usersRepo.create({
      dni,
      fullName,
      role: Role.DOCENTE,
      codigoAlumno: null,
      passwordHash: await bcrypt.hash(password, 10),
    });
    return this.usersRepo.save(created);
  }

  async update(id: string, params: { dni?: string; fullName?: string; password?: string }) {
    const teacher = await this.getByIdOrThrow(id);
    const nextDni = params.dni !== undefined ? String(params.dni).trim() : teacher.dni;
    const nextFullName =
      params.fullName !== undefined
        ? String(params.fullName).trim()
        : teacher.fullName;
    const nextPassword = params.password !== undefined ? String(params.password) : null;

    if (nextDni !== teacher.dni) {
      const duplicate = await this.usersRepo.findOne({ where: { dni: nextDni } });
      if (duplicate && duplicate.id !== teacher.id) {
        throw new ConflictException('Teacher DNI already exists');
      }
      teacher.dni = nextDni;
    }

    teacher.fullName = nextFullName;
    if (nextPassword !== null && nextPassword.length > 0) {
      teacher.passwordHash = await bcrypt.hash(nextPassword, 10);
    }
    return this.usersRepo.save(teacher);
  }

  async remove(id: string) {
    const teacher = await this.getByIdOrThrow(id);
    await this.usersRepo.remove(teacher);
    return { ok: true };
  }

  async getByIdOrThrow(id: string) {
    const teacher = await this.usersRepo.findOne({
      where: { id, role: Role.DOCENTE },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }
}
