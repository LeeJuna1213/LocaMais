import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const ESTADOS_UF = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP',
  'SE', 'TO',
] as const;

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
  @IsString() @IsNotEmpty() @Length(2, 2) @IsIn(ESTADOS_UF, { message: 'UF deve ser uma das 26 siglas estaduais brasileiras' }) uf: string;
  @IsString() @Matches(/^\d{8}$/) cep: string;
  @IsOptional() @IsBoolean() ativa?: boolean;
}
