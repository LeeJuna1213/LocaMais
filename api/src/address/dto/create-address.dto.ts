import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** Endereco do cliente. Todos os campos sao obrigatorios, exceto `complemento`. */
export class CreateAddressDto {
  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  logradouro: string;

  @ApiProperty({ example: '123', description: 'Numero — string para aceitar "S/N"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @ApiProperty({ example: 'Centro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bairro: string;

  @ApiProperty({ example: 'Sao Paulo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cidade: string;

  @ApiProperty({ example: 'SP', description: 'Sigla da unidade federativa (2 letras)' })
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/, { message: 'uf deve ser a sigla do estado com 2 letras' })
  uf: string;

  @ApiProperty({ example: '01001000', description: 'Somente digitos' })
  @Matches(/^\d{8}$/, { message: 'cep deve conter exatamente 8 digitos' })
  cep: string;
}