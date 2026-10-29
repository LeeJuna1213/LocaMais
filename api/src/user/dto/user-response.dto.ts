import { ApiProperty } from '@nestjs/swagger';

import { ClientResponseDto } from '../../client/dto/client-response.dto.js';
import { UserType } from '../enums/user.enum.js';

/**
 * `user` + bloco `client` (quando existir) + endereço aninhado.
 * Nunca inclui `password`.
 */
export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  email: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ enum: UserType, example: UserType.CLIENTE })
  type: UserType;

  @ApiProperty({ type: ClientResponseDto, nullable: true })
  client: ClientResponseDto | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
