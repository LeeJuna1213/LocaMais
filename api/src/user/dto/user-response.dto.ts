import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../enums/user.enum.js';

export class AddressResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() logradouro: string;
  @ApiProperty() numero: string;
  @ApiPropertyOptional({ nullable: true }) complemento: string | null;
  @ApiProperty() bairro: string;
  @ApiProperty() cidade: string;
  @ApiProperty() uf: string;
  @ApiProperty() cep: string;
  @ApiProperty() pais: string;
}

export class ClientResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: ['PF', 'PJ'] }) tipo_pessoa: string;
  @ApiPropertyOptional({ nullable: true }) cpf: string | null;
  @ApiPropertyOptional({ nullable: true }) cnpj: string | null;
  @ApiPropertyOptional({ nullable: true }) data_nascimento: string | null;
  @ApiPropertyOptional({ nullable: true }) razao_social: string | null;
  @ApiProperty({ type: AddressResponseDto }) address: AddressResponseDto | null;
}

/** `user` + `cliente` + `endereco` aninhado. Nunca inclui `password`. */
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