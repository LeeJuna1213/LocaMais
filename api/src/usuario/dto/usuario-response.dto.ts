import { ApiProperty } from '@nestjs/swagger';

import { ClienteResponseDto } from '../../cliente/dto/cliente-response.dto.js';
import { TipoUsuario } from '../enums/usuario.enum.js';

/**
 * `user` + bloco `client` (quando existir) + endereço aninhado.
 * Nunca inclui `password`.
 */
export class UsuarioResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  email: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ enum: TipoUsuario, example: TipoUsuario.CLIENTE })
  type: TipoUsuario;

  @ApiProperty({ type: ClienteResponseDto, nullable: true })
  client: ClienteResponseDto | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
