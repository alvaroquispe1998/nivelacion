import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async login(body: { usuario: string; password: string }) {
    const usuario = String(body.usuario ?? '').trim();
    const password = String(body.password ?? '');
    const usuarioLower = usuario.toLowerCase();
    const isAdminLogin = usuarioLower === 'administrador';
    const isNumericLogin = /^\d{8,15}$/.test(usuario);
    const isStudentCodeLogin = /^[a-zA-Z]\d{5,20}$/.test(usuario);

    if (!usuario || !password) {
      throw new BadRequestException('usuario and password are required');
    }

    if (!isAdminLogin && !isNumericLogin && !isStudentCodeLogin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let alumno: UserEntity | null = null;
    let user: UserEntity | null = null;

    // Fast path: avoid expensive lookups that do not apply to this login input.
    if (isAdminLogin) {
      user = await this.usersService.findAdminByDni('administrador');
    } else if (isNumericLogin) {
      [user, alumno] = await Promise.all([
        this.usersService.findStaffByDni(usuario),
        this.usersService.findAlumnoByDni(usuario),
      ]);
    } else {
      alumno = await this.usersService.findAlumnoByCodigoAlumno(
        usuario.toUpperCase()
      );
    }

    if (alumno) {
      if (password !== alumno.dni) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return this.buildAuthResponse(alumno);
    }

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

  async me(userId: string) {
    const user = await this.usersService.getByIdOrThrow(userId);
    return { user: this.toAuthUser(user) };
  }

  private async buildAuthResponse(user: UserEntity) {
    const payload = {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserEntity) {
    return {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      dni: user.dni,
      codigoAlumno: user.codigoAlumno ?? null,
      email: user.email ?? null,
      names: user.names ?? null,
      paternalLastName: user.paternalLastName ?? null,
      maternalLastName: user.maternalLastName ?? null,
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
