import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { UsuarioResponseDto } from '../usuario/dto/usuario-response.dto.js';
import { UsuarioService } from '../usuario/usuario.service.js';
import { AutenticacaoService } from './autenticacao.service.js';
import { AutenticacaoResponseDto } from './dto/autenticacao-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegistroDto } from './dto/registro.dto.js';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordRecoveryRateLimitGuard } from './password-recovery-rate-limit.guard.js';

@ApiTags('autenticacao')
@Controller('autenticacao')
export class AutenticacaoController {
  constructor(
    private readonly autenticacaoService: AutenticacaoService,
    private readonly usuariosService: UsuarioService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Auto-cadastro de cliente',
    description:
      'Rota publica. Cria sempre um usuario do tipo `cliente` — o tipo nao pode ser enviado no payload.',
  })
  @ApiCreatedResponse({ type: AutenticacaoResponseDto })
  register(@Body() dto: RegistroDto): Promise<AutenticacaoResponseDto> {
    return this.autenticacaoService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica e retorna um access token JWT' })
  @ApiOkResponse({ type: AutenticacaoResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciais invalidas' })
  login(@Body() dto: LoginDto): Promise<AutenticacaoResponseDto> {
    return this.autenticacaoService.login(dto);
  }

  @Public()
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordRecoveryRateLimitGuard)
  @ApiOperation({ summary: 'Solicita recuperação de senha sem revelar se o e-mail está cadastrado' })
  @ApiOkResponse({ description: 'Resposta genérica de solicitação de recuperação' })
  requestPasswordRecovery(@Body() dto: RecuperarSenhaDto) {
    return this.passwordRecoveryService.request(dto.email);
  }

  @Public()
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordRecoveryRateLimitGuard)
  @ApiOperation({ summary: 'Redefine a senha com token temporário de uso único' })
  @ApiOkResponse({ description: 'Senha redefinida' })
  resetPassword(@Body() dto: RedefinirSenhaDto) {
    return this.passwordRecoveryService.reset(dto.token, dto.novaSenha);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuario autenticado' })
  @ApiOkResponse({ type: UsuarioResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
  me(@CurrentUser() actor: UsuarioAutenticado) {
    return this.usuariosService.findOneOrFail(actor.id);
  }
}
