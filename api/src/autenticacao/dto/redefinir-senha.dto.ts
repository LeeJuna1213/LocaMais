import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedefinirSenhaDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(8, { message: 'novaSenha deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'novaSenha deve ter no maximo 72 caracteres' })
  novaSenha: string;
}
