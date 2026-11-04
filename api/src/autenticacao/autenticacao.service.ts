import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClienteService } from '../cliente/cliente.service.js';
import type { Usuario } from '../usuario/entities/usuario.entity.js';
import { UsuarioService } from '../usuario/usuario.service.js';
import { AutenticacaoResponseDto } from './dto/autenticacao-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegistroDto } from './dto/registro.dto.js';
import { JWT_SETTINGS, type JwtSettings } from './jwt.settings.js';
import type { JwtPayload } from '../common/interfaces/usuario-autenticado.interface.js';

/** Mesma mensagem para e-mail inexistente e senha errada: nao revela quais e-mails existem. */
const INVALID_CREDENTIALS = 'email ou senha invalidos';

@Injectable()
export class AutenticacaoService {
  private readonly logger = new Logger(AutenticacaoService.name);

  constructor(
    private readonly usuariosService: UsuarioService,
    private readonly clientesService: ClienteService,
    private readonly jwtService: JwtService,
    @Inject(JWT_SETTINGS) private readonly jwtSettings: JwtSettings,
  ) {}

  /**
   * Auto-cadastro público: sempre cria um cliente.
   *
   * A conta e o cadastro cadastral pertencem a modulos diferentes. O
   * `ClienteService` cria Usuario + Cliente + Endereco na mesma transacao; o
   * AutenticacaoService apenas recebe o usuario e emite o token.
   */
  async register(dto: RegistroDto): Promise<AutenticacaoResponseDto> {
    const user = await this.clientesService.registrarCliente(dto);
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AutenticacaoResponseDto> {
    const user = await this.usuariosService.findByEmailWithPassword(dto.email);

    // `user?.password` e undefined quando o e-mail nao existe; comparar
    // mesmo assim contra um hash fixo evita que o tempo de resposta revele
    // quais e-mails estao cadastrados.
    const hash = user?.password ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await this.usuariosService.comparePassword(
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

  private async issueToken(user: Usuario): Promise<AutenticacaoResponseDto> {
    const payload: JwtPayload = { sub: user.id, type: user.type };
    const accessToken = await this.jwtService.signAsync(payload);

    // Recarrega para devolver o usuario com `cliente`/`endereco` e sem hash.
    const full = await this.usuariosService.findOneOrFail(user.id);

    this.logger.log(`token emitido para ${full.email} (${full.type})`);

    return {
      access_token: accessToken,
      expires_in: this.jwtSettings.expiresIn,
      token_type: 'Bearer',
      user: full,
    };
  }
}