import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { UserType } from '../enums/user.enum.js';

/**
 * DTO de criação de conta administrativa ou de funcionário.
 *
 * Clientes NÃO são criados por este DTO: o cadastro completo (conta + dados
 * PF/PJ + endereço) pertence ao `CreateClientAccountDto`, em `client/dto`.
 * Essa separação impede que uma conta de cliente seja criada sem o registro
 * cadastral correspondente.
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
   * Máximo de 72 por causa do bcrypt: acima disso o hash trunca a senha
   * silenciosamente, fazendo senhas diferentes gerarem o mesmo hash.
   */
  @IsString()
  @MinLength(8, { message: 'password deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'password deve ter no maximo 72 caracteres' })
  password: string;

  @IsIn([UserType.ADMIN, UserType.FUNCIONARIO], {
    message:
      'type deve ser admin ou funcionario; clientes sao cadastrados em /api/clients',
  })
  type: UserType;
}
