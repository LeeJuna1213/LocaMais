import { IsEmail, MaxLength } from 'class-validator';

export class RecuperarSenhaDto {
  @IsEmail()
  @MaxLength(180)
  email: string;
}
