import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Atualizacao de usuario.
 *
 * `type` e `cliente` ficam de fora de proposito: trocar o proprio papel e o
 * caminho classico de escalonamento de privilegio. O `active` so pode ser
 * alternado por um admin (checado no service).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'password deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'password deve ter no maximo 72 caracteres' })
  password?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}