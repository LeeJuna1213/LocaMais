import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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

@ApiTags('auth')
@Controller('auth')
export class AutenticacaoController {
  constructor(
    private readonly autenticacaoService: AutenticacaoService,
    private readonly usuariosService: UsuarioService,
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

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuario autenticado' })
  @ApiOkResponse({ type: UsuarioResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
  me(@CurrentUser() actor: UsuarioAutenticado) {
    return this.usuariosService.findOneOrFail(actor.id);
  }
}