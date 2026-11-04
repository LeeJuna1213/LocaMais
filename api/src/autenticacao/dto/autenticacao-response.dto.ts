import { ApiProperty } from '@nestjs/swagger';
import { UsuarioResponseDto } from '../../usuario/dto/usuario-response.dto.js';

/** Resposta do login e do registro. */
export class AutenticacaoResponseDto {
  @ApiProperty({
    description: 'Access token JWT. Enviar como `Authorization: Bearer <token>`.',
  })
  access_token: string;

  @ApiProperty({ example: 'PT1H' })
  expires_in: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ type: UsuarioResponseDto })
  user: UsuarioResponseDto;
}