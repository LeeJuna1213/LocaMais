import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Dados aceitos em `POST /api/locacoes`.
 *
 * O cliente informa apenas a reserva de origem. `status`, `valorTotal`,
 * `dataRetirada` e `dataDevolucao` NÃO fazem parte deste DTO: o Service define
 * o status inicial (`aguardando_retirada`) e calcula os valores, e as datas
 * efetivas são preenchidas nos registros de retirada/devolução.
 *
 * O `ValidationPipe` global usa `whitelist` + `forbidNonWhitelisted`, então
 * enviar campos não listados retorna 400 em vez de ignorá-los silenciosamente.
 */
export class CreateLocacaoDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID da reserva confirmada que dará origem a esta locação.',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'reservation_id deve ser um UUID válido' })
  reservation_id: string;
}
