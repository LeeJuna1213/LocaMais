import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

import { CreateAddressDto } from './create-address.dto.js';

/**
 * Endereço enviado diretamente para `POST /api/addresses`.
 *
 * Diferente de `CreateAddressDto` (usado aninhado em `CreateClientDto`), aqui
 * o `client_id` é obrigatório, pois o endereço está sendo criado sozinho para
 * um cliente que já existe. Manter os dois DTOs separados evita que o
 * `client_id` vire um campo obrigatório no cadastro completo de cliente.
 */
export class CreateAddressForClientDto extends CreateAddressDto {
  @ApiProperty({ example: 1, description: 'ID do cliente que receberá o endereço' })
  @IsInt()
  @IsPositive()
  client_id: number;
}
