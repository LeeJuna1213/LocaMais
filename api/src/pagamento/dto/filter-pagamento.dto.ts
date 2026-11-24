import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { StatusPagamento } from '../enums/status-pagamento.enum.js';

export class FilterPagamentoDto {
  @IsOptional()
  @IsEnum(StatusPagamento)
  status?: StatusPagamento;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}
