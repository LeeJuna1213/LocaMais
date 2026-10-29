import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UserType } from '../user/enums/user.enum.js';

import { CheckAvailabilityDto } from './dto/check-availability.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import type { Reservation } from './entities/reservation.entity.js';
import type { ReservationAvailability } from './reservation.service.js';
import { ReservationService } from './reservation.service.js';

/**
 * Rotas de reservas.
 *
 * O Controller só recebe a requisição, aplica validação de DTO/param e delega
 * ao ReservationService. Regras como disponibilidade, cálculo do valor e
 * transições de status ficam no Service, que conhece os repositórios.
 */
@ApiTags('reservations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  /**
   * Cria uma reserva PENDENTE. O cliente autenticado só pode reservar para o
   * próprio cadastro; admin/funcionário podem informar qualquer cliente.
   */
  @Post()
  @ApiOperation({
    summary: 'Cria uma reserva',
    description:
      'O status inicial e sempre "pendente" e o valor total e calculado pelo servidor com base no valorDiaria do veiculo. O periodo precisa estar livre.',
  })
  @ApiCreatedResponse({ description: 'Reserva criada com sucesso.' })
  @ApiBadRequestResponse({ description: 'Dados ou periodo invalidos.' })
  @ApiNotFoundResponse({ description: 'Cliente ou veiculo nao encontrado.' })
  @ApiConflictResponse({
    description:
      'Veiculo indisponivel no periodo, cliente inativo ou conflito com outra reserva.',
  })
  @ApiForbiddenResponse({
    description: 'Cliente tentando reservar para outro cliente.',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateReservationDto,
  ): Promise<Reservation> {
    return this.reservationService.create(actor, dto);
  }

  /** Lista todas as reservas para staff e apenas as próprias para cliente. */
  @Get()
  @ApiOperation({
    summary: 'Lista reservas',
    description:
      'Admin/funcionario veem todas as reservas; cliente ve apenas as reservas do proprio cadastro.',
  })
  @ApiOkResponse({ description: 'Lista de reservas retornada com sucesso.' })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<Reservation[]> {
    return this.reservationService.findAllForActor(actor);
  }

  /**
   * Consulta de disponibilidade por período.
   *
   * Precisa ser declarada antes de `GET :id`; caso contrário, o Nest tentaria
   * interpretar "availability" como um UUID e devolveria 400.
   */
  @Get('availability')
  @ApiOperation({
    summary: 'Consulta disponibilidade de um veiculo em um periodo',
    description:
      'Retorna disponivel=true/false. Reservas canceladas nao bloqueiam o periodo. O fim de uma reserva pode coincidir com o inicio de outra.',
  })
  @ApiOkResponse({
    description: 'Consulta de disponibilidade realizada.',
    schema: {
      example: {
        car_id: 1,
        dataRetirada: '2026-11-10T10:00:00.000Z',
        dataDevolucao: '2026-11-12T10:00:00.000Z',
        disponivel: false,
        motivo: 'conflito',
        conflito: {
          id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          dataRetirada: '2026-11-10T10:00:00.000Z',
          dataDevolucao: '2026-11-12T10:00:00.000Z',
          status: 'pendente',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Periodo invalido.' })
  @ApiNotFoundResponse({ description: 'Veiculo nao encontrado.' })
  checkAvailability(
    @Query() dto: CheckAvailabilityDto,
  ): Promise<ReservationAvailability> {
    return this.reservationService.checkAvailability(dto);
  }

  /** Consulta uma reserva por UUID, com controle de acesso. */
  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma reserva pelo UUID' })
  @ApiParam({
    name: 'id',
    description: 'UUID da reserva.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Reserva encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Reserva nao encontrada.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando acessar reserva de outro cliente.',
  })
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Reservation> {
    return this.reservationService.findOneForActor(actor, id);
  }

  /**
   * Cancela uma reserva sem apagá-la.
   *
   * Fica antes de `PATCH :id` por clareza de roteamento. Staff pode cancelar
   * qualquer reserva; o cliente só as próprias.
   */
  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancela uma reserva',
    description:
      'Muda o status para "cancelada". A reserva cancelada deixa de bloquear o veiculo e nao pode ser cancelada novamente.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da reserva.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Reserva cancelada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Reserva nao encontrada.' })
  @ApiConflictResponse({
    description: 'Reserva ja cancelada ou concluida.',
  })
  @ApiForbiddenResponse({
    description: 'Cliente tentando cancelar reserva de outro cliente.',
  })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Reservation> {
    return this.reservationService.cancel(actor, id);
  }

  /**
   * Atualização controlada. Somente admin/funcionário pode alterar período,
   * cliente, carro ou status; o Service valida as transições permitidas.
   */
  @Patch(':id')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza uma reserva quando permitido',
    description:
      'Reserva pendente pode ter periodo/cliente/carro alterados e ser confirmada. Reserva confirmada so pode ser concluida. Cancelada/concluida nao pode ser alterada.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da reserva.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Reserva atualizada com sucesso.' })
  @ApiNotFoundResponse({
    description: 'Reserva, cliente ou veiculo nao encontrado.',
  })
  @ApiConflictResponse({
    description:
      'Status nao permite alteracao, transicao invalida ou veiculo indisponivel.',
  })
  @ApiBadRequestResponse({
    description:
      'Dados invalidos ou tentativa de usar /cancel via PATCH generico.',
  })
  @ApiForbiddenResponse({
    description: 'Acesso restrito a admin/funcionario.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationDto,
  ): Promise<Reservation> {
    return this.reservationService.update(id, dto);
  }
}
