import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateLojaDto {
  @IsString() @IsNotEmpty() @MaxLength(30) codigo: string;
  @IsString() @IsNotEmpty() @MaxLength(150) nome: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{8,20}$/) telefone: string;
  @IsEmail() @MaxLength(180) email: string;
  @IsString() @IsNotEmpty() @MaxLength(200) logradouro: string;
  @IsString() @IsNotEmpty() @MaxLength(20) numero: string;
  @IsOptional() @IsString() @MaxLength(100) complemento?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(100) bairro: string;
  @IsString() @IsNotEmpty() @MaxLength(100) cidade: string;
  @IsString() @Length(2, 2) @Matches(/^[A-Za-z]{2}$/) uf: string;
  @IsString() @Matches(/^\d{8}$/) cep: string;
  @IsOptional() @IsBoolean() ativa?: boolean;
}
