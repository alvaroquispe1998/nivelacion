import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@uai/shared';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';

const ADMIN_LOGIN = 'administrador';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@UAI19';

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

    if (!usuario || !password) {
      throw new BadRequestException('usuario and password are required');
    }

    if (usuarioLower === ADMIN_LOGIN) {
      if (password !== ADMIN_PASSWORD) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const admin = await this.usersService.findAdminByDni(ADMIN_LOGIN);
      if (!admin) throw new UnauthorizedException('Invalid credentials');
      return this.buildAuthResponse(admin);
    }

    const user = await this.findUserForLogin(usuario, usuarioLower);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.role === Role.ALUMNO || user.role === Role.DOCENTE) {
      if (password !== user.dni) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return this.buildAuthResponse(user);
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  private findUserForLogin(usuario: string, usuarioLower: string) {
    if (/^[a-zA-Z]\d{5,20}$/.test(usuario)) {
      return this.usersService.findAlumnoByCodigoAlumno(usuario.toUpperCase());
    }

    return this.usersService.findByDni(usuario);
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
}
