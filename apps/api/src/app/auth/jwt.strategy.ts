import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  role: string;
  fullName: string;
  dni: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev_secret_change_me'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersService.getByIdOrThrow(payload.sub);
    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    return {
      sub: user.id,
      role: user.role,
      fullName: user.fullName,
      dni: user.dni,
    };
  }
}
