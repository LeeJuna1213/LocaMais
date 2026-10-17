import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JWT_SETTINGS, type JwtSettings } from './jwt.settings.js';
import type { JwtPayload } from '../common/interfaces/authenticated-user.interface.js';

/** Mesma mensagem para e-mail inexistente e senha errada: nao revela quais e-mails existem. */
const INVALID_CREDENTIALS = 'email ou senha invalidos';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    @Inject(JWT_SETTINGS) private readonly jwtSettings: JwtSettings,
  ) {}

  /** Auto-cadastro: sempre cria um cliente. */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.registerClient(dto);
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // `user?.password` e undefined quando o e-mail nao existe; comparar
    // mesmo assim contra um hash fixo evita que o tempo de resposta revele
    // quais e-mails estao cadastrados.
    const hash = user?.password ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await this.usersService.comparePassword(
      dto.password,
      hash,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!user.active) {
      throw new UnauthorizedException('usuario desativado');
    }

    return this.issueToken(user);
  }

  private async issueToken(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, type: user.type };
    const accessToken = await this.jwtService.signAsync(payload);

    // Recarrega para devolver o usuario com `cliente`/`endereco` e sem hash.
    const full = await this.usersService.findOneOrFail(user.id);

    this.logger.log(`token emitido para ${full.email} (${full.type})`);

    return {
      access_token: accessToken,
      expires_in: this.jwtSettings.expiresIn,
      token_type: 'Bearer',
      user: full,
    };
  }
}