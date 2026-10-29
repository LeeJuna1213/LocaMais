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
// O DTO de cliente pertence ao módulo `client`. A extensão `.js` é a
// convenção do projeto (moduleResolution: nodenext), mesmo para fontes `.ts`.
import { CreateClientDto } from '../../client/dto/create-client.dto.js';

/**
 * Auto-cadastro de cliente.
 *
 * O DTO é separado de `CreateUserDto` porque o auto-cadastro não escolhe
 * `type` (o servidor impõe `cliente`) e sempre exige o bloco `cliente` com os
 * dados PF/PJ + endereço.
 *
 * A conta e o cadastro cadastral são criados juntos pelo `ClientService`.
 */
export class RegisterDto {
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

  // `@IsDefined` impede que o auto-cadastro chegue sem o bloco `cliente`:
  // sem ele, `@ValidateNested` simplesmente ignora `undefined` e o Service
  // quebraria ao ler `cliente.tipo_pessoa`.
  @ApiProperty({ type: CreateClientDto })
  @IsDefined({ message: 'cliente e obrigatorio' })
  @ValidateNested()
  @Type(() => CreateClientDto)
  cliente: CreateClientDto;
}