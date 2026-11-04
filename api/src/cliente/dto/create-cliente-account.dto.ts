import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CreateClienteDto } from './create-cliente.dto.js';

/**
 * Cadastro completo de uma conta de cliente: dados de login (name/email/
 * password) + dados específicos de cliente + endereço.
 *
 * É usado pelo endpoint `POST /api/clients`, que é uma porta de entrada
 * focada em clientes para admin/funcionário. O `type` do usuário NÃO é
 * enviado: o `ClienteService` impõe `TipoUsuario.CLIENTE`, evitando que o
 * cliente de API escolha um papel privilegiado.
 *
 * O auto-cadastro público continua em `POST /api/auth/register` (RegistroDto).
 */
export class CreateClienteAccountDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail()
  @MaxLength(180)
  email: string;

  @ApiProperty({ example: 'senha-secreta', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'password deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'password deve ter no maximo 72 caracteres' })
  password: string;

  @ApiProperty({ type: CreateClienteDto })
  @IsDefined({ message: 'cliente e obrigatorio' })
  @ValidateNested()
  @Type(() => CreateClienteDto)
  cliente: CreateClienteDto;
}
