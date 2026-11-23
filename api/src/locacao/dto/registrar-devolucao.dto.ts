import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegistrarDevolucaoDto {
  @ApiPropertyOptional({
    example: 'Risco profundo na porta traseira direita e pequeno amassado próximo à maçaneta.',
    description: 'Descrição opcional das avarias observadas na devolução, preservada como observação da vistoria.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString({ message: 'descricaoAvaria deve ser uma string' })
  @MaxLength(2000, { message: 'descricaoAvaria deve ter no máximo 2000 caracteres' })
  descricaoAvaria?: string | null;
}
