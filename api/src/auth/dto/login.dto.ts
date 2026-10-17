import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail()
  @MaxLength(180)
  email: string;

  @ApiProperty({ example: 'senha-secreta' })
  @IsString()
  @MinLength(1, { message: 'password e obrigatorio' })
  @MaxLength(72)
  password: string;
}