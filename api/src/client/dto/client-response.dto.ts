import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AddressResponseDto } from '../../address/dto/address-response.dto.js';

/**
 * Formato público dos dados cadastrais do cliente.
 *
 * Fica no módulo `client` porque descreve uma resposta específica de cliente;
 * `UserResponseDto` o reutiliza para representar o bloco `client` da conta.
 */
export class ClientResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: ['PF', 'PJ'] }) tipo_pessoa: string;
  @ApiPropertyOptional({ nullable: true }) cpf: string | null;
  @ApiPropertyOptional({ nullable: true }) cnpj: string | null;
  @ApiPropertyOptional({ nullable: true }) data_nascimento: string | null;
  @ApiPropertyOptional({ nullable: true }) razao_social: string | null;
  @ApiProperty({ type: AddressResponseDto })
  address: AddressResponseDto | null;
}
