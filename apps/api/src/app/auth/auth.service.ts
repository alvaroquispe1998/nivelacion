import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async login(body: { usuario: string; password: string }) {
    const usuario = String(body.usuario ?? '').trim();
    const password = String(body.password ?? '');

    if (!usuario || !password) {
      throw new BadRequestException('usuario and password are required');
    }

    const alumno = await this.usersService.findAlumnoByCodigoAlumno(usuario);
    if (alumno) {
      if (password !== alumno.dni) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return this.buildAuthResponse(alumno);
    }

    const user = await this.usersService.findStaffByDni(usuario);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.role === Role.DOCENTE) {
      if (password !== user.dni) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return this.buildAuthResponse(user);
    }

    if (
      user.role !== Role.ADMIN ||
      user.dni !== 'administrador' ||
      !user.passwordHash
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.verifyPassword(user.id, user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: {
    id: string;
    role: Role;
    fullName: string;
    dni: string;
  }) {
    const payload = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, fullName: user.fullName, role: user.role },
    };
  }

  private async verifyPassword(
    userId: string,
    passwordHash: string,
    plainPassword: string
  ) {
    if (passwordHash.startsWith('PLAIN:')) {
      const expected = passwordHash.slice('PLAIN:'.length);
      if (plainPassword !== expected) return false;
      const user = await this.usersService.getByIdOrThrow(userId);
      user.passwordHash = await bcrypt.hash(plainPassword, 10);
      await this.usersService.save(user);
      return true;
    }
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
