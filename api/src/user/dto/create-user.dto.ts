import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UserType } from '../enums/user.enum.js';
import { UserConsistente } from '../validators/user-consistente.validator.js';
import { CreateClientDto } from './create-client.dto.js';

/**
 * Criacao de usuario. `type` decide o que pode ser enviado junto:
 * `cliente` so e aceito (e obrigatorio) quando `type` = `cliente`.
 *
 * Quem pode chamar e responsabilidade do `UserService`, com base no papel de
 * quem esta autenticado — o DTO nao limita o `type` de proposito.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  /**
   * Maximo de 72 por causa do bcrypt: acima disso o hash passa a truncar
   * silenciosamente a senha, o que faria duas senhas diferentes gerarem o
   * mesmo hash.
   */
  @IsString()
  @MinLength(8, { message: 'password deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'password deve ter no maximo 72 caracteres' })
  password: string;

  /**
   * O constraint vive em `type` mas le o DTO inteiro via `args.object`, para
   * nao precisar de uma propriedade-fantasma (que o plugin do Swagger
   * transformaria em referencia circular).
   */
  @IsEnum(UserType, { message: 'type deve ser admin, funcionario ou cliente' })
  @UserConsistente()
  type: UserType;

  @ValidateIf((o: CreateUserDto) => o.type === UserType.CLIENTE)
  @ValidateNested()
  @Type(() => CreateClientDto)
  cliente?: CreateClientDto;
}