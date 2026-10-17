import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/authenticated-user.interface.js';
import { UserService } from '../../user/user.service.js';
import { JWT_SETTINGS, type JwtSettings } from '../jwt.settings.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(JWT_SETTINGS) settings: JwtSettings,
    private readonly usersService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: settings.secret,
    });
  }

  /**
   * Recarrega o usuario a cada request em vez de confiar no token.
   *
   * Isso permite desativar um usuario ou trocar o papel dele sem esperar o
   * token expirar — o token sozinho nao concede acesso.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findOneOrFail(payload.sub).catch(() => {
      throw new UnauthorizedException('usuario inexistente');
    });

    if (!user.active) {
      throw new UnauthorizedException('usuario desativado');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
    };
  }
}