import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { UpdateEnderecoDto } from '../../endereco/dto/update-endereco.dto.js';
import { IsEnum } from 'class-validator';
import { MetodoPagamento } from '../../pagamento/enums/metodo-pagamento.enum.js';

export class UpdateOwnClientDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,20}$/)
  telefone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  cnh_numero?: string;

  @IsOptional()
  @IsDateString()
  cnh_validade?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEnderecoDto)
  endereco?: UpdateEnderecoDto;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(MetodoPagamento)
  metodo_pagamento_preferido?: MetodoPagamento | null;
}
