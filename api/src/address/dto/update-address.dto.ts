import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * DTO para atualização parcial de endereço.
 *
 * Todos os campos são opcionais (`@IsOptional`), permitindo atualizações
 * parciais via PATCH. Apenas os campos enviados serão alterados.
 *
 * `client_id` não aparece de propósito: o dono do endereço não muda em uma
 * atualização. Para mover um endereço para outro cliente, crie um novo.
 */
export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Rua das Flores' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  logradouro?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bairro?: string;

  @ApiPropertyOptional({ example: 'Sao Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cidade?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'uf deve ser a sigla do estado com 2 letras',
  })
  uf?: string;

  @ApiPropertyOptional({ example: '01001000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'cep deve conter exatamente 8 digitos' })
  cep?: string;
}
