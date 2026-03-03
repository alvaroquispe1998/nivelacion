import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role, isAdminBackofficeRole } from '@uai/shared';
import { In } from 'typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { hashInternalPassword } from './passwords.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>
  ) {}

  async getByIdOrThrow(id: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAlumnoByDniCodigo(
    dni: string,
    codigoAlumno: string
  ): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { dni, codigoAlumno, role: Role.ALUMNO },
    });
  }

  async findAlumnoByCodigoAlumno(codigoAlumno: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { codigoAlumno, role: Role.ALUMNO },
    });
  }

  async findAdminByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ADMIN } });
  }

  async findInternalByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { dni, role: In([Role.ADMIN, Role.ADMINISTRATIVO]) },
    });
  }

  async findByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni } });
  }

  async findStaffByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { dni, role: In([Role.ADMIN, Role.ADMINISTRATIVO, Role.DOCENTE]) },
    });
  }

  async findAlumnoByDni(dni: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { dni, role: Role.ALUMNO } });
  }

  async save(user: UserEntity) {
    return this.usersRepo.save(user);
  }

  async listInternalUsers() {
    return this.usersRepo.find({
      where: { role: In([Role.ADMIN, Role.ADMINISTRATIVO]) },
      order: { role: 'ASC', fullName: 'ASC', createdAt: 'DESC' },
    });
  }

  async getInternalByIdOrThrow(id: string) {
    const user = await this.usersRepo.findOne({
      where: { id, role: In([Role.ADMIN, Role.ADMINISTRATIVO]) },
    });
    if (!user) throw new NotFoundException('Internal user not found');
    return user;
  }

  async createInternalUser(params: {
    dni: string;
    fullName: string;
    role: Role.ADMIN | Role.ADMINISTRATIVO;
    password: string;
  }) {
    const dni = String(params.dni ?? '').trim();
    const fullName = String(params.fullName ?? '').trim();
    const password = String(params.password ?? '');
    const role = params.role;

    this.assertInternalRole(role);

    const existing = await this.usersRepo.findOne({ where: { dni } });
    if (existing) {
      throw new ConflictException('User DNI already exists');
    }

    const created = this.usersRepo.create({
      dni,
      fullName,
      role,
      codigoAlumno: null,
      isActive: true,
      passwordHash: await hashInternalPassword(password),
    });

    return this.usersRepo.save(created);
  }

  async updateInternalUser(
    id: string,
    params: {
      dni?: string;
      fullName?: string;
      role?: Role.ADMIN | Role.ADMINISTRATIVO;
    }
  ) {
    const user = await this.getInternalByIdOrThrow(id);
    const nextDni = params.dni !== undefined ? String(params.dni ?? '').trim() : user.dni;
    const nextFullName =
      params.fullName !== undefined
        ? String(params.fullName ?? '').trim()
        : user.fullName;
    const nextRole = params.role ?? user.role;

    this.assertInternalRole(nextRole);

    if (nextDni !== user.dni) {
      const duplicate = await this.usersRepo.findOne({ where: { dni: nextDni } });
      if (duplicate && duplicate.id !== user.id) {
        throw new ConflictException('User DNI already exists');
      }
      user.dni = nextDni;
    }

    await this.assertCanDemoteAdmin({
      targetUser: user,
      nextRole,
    });

    user.fullName = nextFullName;
    user.role = nextRole;
    return this.usersRepo.save(user);
  }

  async updateInternalStatus(
    id: string,
    isActive: boolean,
    actorUserId: string
  ) {
    const user = await this.getInternalByIdOrThrow(id);
    if (!isActive && user.id === actorUserId) {
      throw new BadRequestException('Cannot deactivate your own user');
    }

    await this.assertCanDeactivateAdmin({
      targetUser: user,
      nextIsActive: isActive,
    });

    user.isActive = isActive;
    return this.usersRepo.save(user);
  }

  async resetInternalPassword(id: string, newPassword: string) {
    const user = await this.getInternalByIdOrThrow(id);
    user.passwordHash = await hashInternalPassword(String(newPassword ?? ''));
    return this.usersRepo.save(user);
  }

  private assertInternalRole(
    role: Role
  ): asserts role is Role.ADMIN | Role.ADMINISTRATIVO {
    if (!isAdminBackofficeRole(role)) {
      throw new BadRequestException('Role must be ADMIN or ADMINISTRATIVO');
    }
  }

  private async assertCanDeactivateAdmin(params: {
    targetUser: UserEntity;
    nextIsActive: boolean;
  }) {
    const { targetUser, nextIsActive } = params;
    if (nextIsActive || targetUser.role !== Role.ADMIN || !targetUser.isActive) return;

    const otherActiveAdmins = await this.countOtherActiveAdmins(targetUser.id);
    if (otherActiveAdmins <= 0) {
      throw new ConflictException('At least one active ADMIN must remain');
    }
  }

  private async assertCanDemoteAdmin(params: {
    targetUser: UserEntity;
    nextRole: Role.ADMIN | Role.ADMINISTRATIVO;
  }) {
    const { targetUser, nextRole } = params;
    if (targetUser.role !== Role.ADMIN || nextRole === Role.ADMIN || !targetUser.isActive) {
      return;
    }

    const otherActiveAdmins = await this.countOtherActiveAdmins(targetUser.id);
    if (otherActiveAdmins <= 0) {
      throw new ConflictException('At least one active ADMIN must remain');
    }
  }

  private async countOtherActiveAdmins(excludedUserId: string) {
    return this.usersRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: Role.ADMIN })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .andWhere('user.id <> :excludedUserId', { excludedUserId })
      .getCount();
  }
}
