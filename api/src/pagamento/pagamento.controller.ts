import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';

import { PagamentoService } from './pagamento.service.js';
import { CreatePagamentoDto } from './dto/create-pagamento.dto.js';
import type { Pagamento } from './entities/pagamento.entity.js';
import { ConfirmacaoPagamentoDto } from './dto/confirmacao-pagamento.dto.js';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto.js';
import { StatusPagamento } from './enums/status-pagamento.enum.js';

/**
 * Rotas de pagamentos.
 *
 * O Controller só recebe a requisição, aplica validação de DTO/param e delega
 * ao PagamentoService. Regras como validação de saldo restante, processamento
 * simulado pelo gateway e prevenção de pagamentos duplicados ficam no Service.
 *
 * As rotas `GET /pagamentos/locacao/:locacaoId` e
 * `GET /pagamentos/locacao/:locacaoId/saldo` são declaradas antes de
 * `GET /pagamentos/:id` para evitar que o Nest interprete "locacao" ou "saldo"
 * como um UUID.
 *
 * Nenhum dado sensível (credenciais, tokens bancários, etc.) é exposto nas
 * respostas da API.
 */
@ApiTags('pagamentos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('pagamentos')
export class PagamentoController {
  constructor(private readonly pagamentoService: PagamentoService) {}

  /**
   * Registra um novo pagamento vinculado a uma locação.
   *
   * O pagamento inicia com status PENDENTE. A confirmação é feita por meio
   * da rota PATCH /pagamentos/:id/confirmar.
   */
  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Registra um novo pagamento',
    description:
      'Registra um pagamento vinculado a uma locação. O pagamento inicia com status pendente e deve ser confirmado posteriormente.',
  })
  @ApiCreatedResponse({ description: 'Pagamento registrado com sucesso.' })
  @ApiConflictResponse({
    description:
      'Locacao inexistente ou cancelada, ou valor excede o saldo restante.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  create(@Body() dto: CreatePagamentoDto): Promise<Pagamento> {
    return this.pagamentoService.create(dto);
  }

  /**
   * Lista todos os pagamentos registrados.
   */
  @Get()
  @ApiOperation({ summary: 'Lista todos os pagamentos' })
  @ApiOkResponse({ description: 'Lista de pagamentos retornada com sucesso.' })
  findAll(@CurrentUser() _actor: UsuarioAutenticado): Promise<Pagamento[]> {
    return this.pagamentoService.findAll();
  }

  /**
   * Consulta o saldo restante de uma locação.
   *
   * Retorna o valor total, o valor pago (aprovado) e o saldo restante.
   */
  @Get('locacao/:locacaoId/saldo')
  @ApiOperation({
    summary: 'Consulta o saldo restante de uma locação',
  })
  @ApiParam({
    name: 'locacaoId',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({
    description: 'Saldo restante da locação retornado com sucesso.',
  })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  async consultarSaldoRestante(
    @Param('locacaoId', ParseUUIDPipe) locacaoId: string,
  ): Promise<{
    locacaoId: string;
    valorTotal: number;
    valorPago: number;
    saldoRestante: number;
  }> {
    return this.pagamentoService.consultarSaldoRestante(locacaoId);
  }

  /**
   * Consulta o histórico de pagamentos de uma locação.
   */
  @Get('locacao/:locacaoId')
  @ApiOperation({
    summary: 'Consulta o histórico de pagamentos de uma locação',
  })
  @ApiParam({
    name: 'locacaoId',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({
    description: 'Histórico de pagamentos da locação retornado com sucesso.',
  })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  findByLocacao(
    @Param('locacaoId', ParseUUIDPipe) locacaoId: string,
  ): Promise<Pagamento[]> {
    return this.pagamentoService.findByLocacao(locacaoId);
  }

  /**
   * Consulta um pagamento pelo identificador.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Consulta um pagamento pelo ID' })
  @ApiParam({
    name: 'id',
    description: 'Identificador único do pagamento (UUID).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({ description: 'Pagamento encontrado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Pagamento com o ID informado não existe.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Pagamento> {
    return this.pagamentoService.findOne(id);
  }

  /**
   * Confirma e processa um pagamento simulado.
   *
   * Chama o gateway simulado para processar a transação e atualiza o status
   * para APROVADO ou RECUSADO conforme o resultado.
   *
   * Não permite confirmação duplicada: um pagamento já aprovado retorna o
   * registro existente.
   */
  @Patch(':id/confirmar')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Confirma e processa um pagamento simulado',
    description:
      'Chama o gateway simulado para processar a transação. O status passa para aprovado ou recusado conforme o resultado.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador único do pagamento (UUID).',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Pagamento confirmado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado.' })
  @ApiConflictResponse({
    description:
      'Pagamento não está pendente, já foi confirmado, ou valor excede o saldo restante.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  async confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmacaoPagamentoDto,
  ): Promise<Pagamento> {
    return this.pagamentoService.confirmar(id, dto);
  }

  /**
   * Consulta o recibo (comprovante) de um pagamento aprovado.
   *
   * O recibo só pode ser gerado para pagamentos com status APROVADO.
   * Contém um aviso de que se trata de um pagamento simulado.
   */
  @Get(':id/comprovante')
  @ApiOperation({
    summary: 'Consulta o recibo de um pagamento aprovado',
    description:
      'Retorna o recibo demonstrativo do pagamento. Apenas pagamentos aprovados podem gerar recibo.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador único do pagamento (UUID).',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({
    description: 'Recibo do pagamento retornado com sucesso.',
  })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado.' })
  @ApiConflictResponse({
    description: 'O pagamento não está aprovado.',
  })
  async gerarComprovante(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    empresa: string;
    reciboId: string;
    pagamentoId: string;
    locacaoId: string;
    cliente?: string;
    veiculo?: string;
    valorPago: number;
    metodoPagamento: string;
    dataConfirmacao: Date;
    status: StatusPagamento;
    aviso: string;
  }> {
    return this.pagamentoService.gerarComprovante(id);
  }

  /**
   * Atualiza informações permitidas de um pagamento.
   *
   * Apenas o valor pode ser atualizado, e somente quando o pagamento ainda
   * está pendente.
   */
  @Patch(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza parcialmente um pagamento',
    description:
      'Atualiza apenas o valor. Apenas pagamentos pendentes podem ser atualizados.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador único do pagamento (UUID).',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Pagamento atualizado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado.' })
  @ApiConflictResponse({
    description: 'Pagamento não está pendente ou valor excede o saldo restante.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePagamentoDto,
  ): Promise<Pagamento> {
    return this.pagamentoService.update(id, dto);
  }

  /**
   * Exclui um pagamento.
   *
   * Apenas pagamentos pendentes podem ser excluídos.
   */
  @Delete(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({ summary: 'Exclui um pagamento' })
  @ApiParam({
    name: 'id',
    description: 'Identificador único do pagamento (UUID).',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Pagamento excluído com sucesso.' })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado.' })
  @ApiConflictResponse({
    description: 'Apenas pagamentos pendentes podem ser excluídos.',
  })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.pagamentoService.remove(id);
  }
}
