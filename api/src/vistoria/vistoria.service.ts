import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { LocacaoService } from '../locacao/locacao.service.js';
import { StatusLocacao } from '../locacao/enums/status-locacao.enum.js';
import { UserType } from '../user/enums/user.enum.js';

import { CreateVistoriaDto } from './dto/create-vistoria.dto.js';
import { UpdateVistoriaDto } from './dto/update-vistoria.dto.js';
import { Vistoria } from './entities/vistoria.entity.js';
import { TipoVistoria } from './enums/tipo-vistoria.enum.js';

/**
 * Regras de negócio das vistorias.
 *
 * Uma vistoria registra as condições do veículo em um momento específico,
 * preservando evidências (observações e fotos) para retirada e devolução.
 *
 * Injeção de dependência:
 * - `Repository<Vistoria>` vem do `TypeOrmModule.forFeature([Vistoria])`;
 * - `LocacaoService` (exportado por `LocacaoModule`) é reaproveitado para
 *   validar a existência da locação, o seu status e o controle de acesso do
 *   cliente autenticado;
 * - Não há dependência circular: `LocacaoModule` não importa `VistoriaModule`.
 *
 * Responsabilidades FORA do escopo deste módulo: cálculo de multas, cobranças
 * e pagamentos pertencem aos módulos `Locacao` e `Payment`.
 */
@Injectable()
export class VistoriaService {
  constructor(
    @InjectRepository(Vistoria)
    private readonly vistoriasRepository: Repository<Vistoria>,
    private readonly locacaoService: LocacaoService,
  ) {}

  /**
   * Registra uma nova vistoria vinculada a uma locação.
   *
   * Regras:
   * - A locação deve existir (404 caso contrário);
   * - O cliente autenticado só pode vistoriar a própria locação;
   *   admin/funcionário podem vistoriar qualquer locação;
   * - O tipo deve ser compatível com o status da locação:
   *   - RETIRADA exige locacao em AGUARDANDO_RETIRADA;
   *   - DEVOLUCAO exige locacao em EM_ANDAMENTO;
   * - `data` é registrada automaticamente pelo backend (não vem do cliente);
   * - A vistoria é vinculada à locação.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateVistoriaDto,
  ): Promise<Vistoria> {
    // Valida existência da locação e controle de acesso (dono/staff).
    const locacao = await this.locacaoService.findOne(actor, dto.locacaoId);

    this.assertTipoCompativelComLocacao(dto.tipo, locacao.status);

    const vistoria = this.vistoriasRepository.create({
      tipo: dto.tipo,
      observacoes: dto.observacoes ?? null,
      fotos: dto.fotos,
      locacao_id: locacao.id,
      locacao,
    });

    // A data/horário é registrada pelo backend no momento da vistoria.
    vistoria.registrarVistoria();

    const saved = await this.vistoriasRepository.save(vistoria);

    return this.findOne(actor, saved.id);
  }

  /**
   * Lista vistorias conforme o papel do usuário.
   *
   * Admin/funcionário veem todas; cliente vê apenas as vistorias ligadas às
   * suas próprias locações (via `reservation.client.user_id`).
   */
  findAll(actor: AuthenticatedUser): Promise<Vistoria[]> {
    const queryBuilder = this.vistoriasRepository
      .createQueryBuilder('vistoria')
      .leftJoinAndSelect('vistoria.locacao', 'locacao')
      .leftJoinAndSelect('locacao.reservation', 'reservation')
      .leftJoinAndSelect('reservation.client', 'client')
      .orderBy('vistoria.data', 'DESC');

    if (!this.isStaff(actor)) {
      queryBuilder.where('client.user_id = :userId', {
        userId: actor.id,
      });
    }

    return queryBuilder.getMany();
  }

  /**
   * Consulta uma vistoria por ID, carregando a locação, reserva e cliente.
   * Lança 404 quando não existe e 403 quando o cliente não é o dono.
   */
  async findOne(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Vistoria> {
    const vistoria = await this.vistoriasRepository.findOne({
      where: { id },
      relations: { locacao: { reservation: { client: true } } },
    });

    if (!vistoria) {
      throw new NotFoundException(`vistoria de ID ${id} nao encontrada`);
    }

    this.assertCanRead(actor, vistoria);
    return vistoria;
  }

  /**
   * Consulta todas as vistorias de uma locação específica.
   *
   * Primeiro valida a existência da locação e o controle de acesso; depois
   * retorna o histórico de vistorias daquela locação.
   */
  async findByLocacao(
    actor: AuthenticatedUser,
    locacaoId: string,
  ): Promise<Vistoria[]> {
    // Garante que a locação exista e que o ator tem acesso a ela.
    await this.locacaoService.findOne(actor, locacaoId);

    return this.vistoriasRepository.find({
      where: { locacao_id: locacaoId },
      relations: { locacao: true },
      order: { data: 'ASC' },
    });
  }

  /**
   * Atualização parcial de observações e fotos.
   *
   * `tipo`, `data` e o vinculo com a locação são imutáveis após a realização
   * da vistoria, preservando o histórico.
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateVistoriaDto,
  ): Promise<Vistoria> {
    const current = await this.findOne(actor, id);

    if (dto.observacoes !== undefined) {
      current.observacoes = dto.observacoes;
    }
    if (dto.fotos !== undefined) {
      current.fotos = dto.fotos;
    }

    const saved = await this.vistoriasRepository.save(current);

    return this.findOne(actor, saved.id);
  }

  /** Staff enxerga tudo; cliente só enxerga as próprias vistorias. */
  private assertCanRead(actor: AuthenticatedUser, vistoria: Vistoria): void {
    if (this.isStaff(actor)) return;

    if (
      !vistoria.locacao ||
      !vistoria.locacao.reservation ||
      vistoria.locacao.reservation.client.user_id !== actor.id
    ) {
      throw new ForbiddenException(
        'clientes so podem acessar as proprias vistorias',
      );
    }
  }

  /** Valida a compatibilidade do tipo de vistoria com o status da locação. */
  private assertTipoCompativelComLocacao(
    tipo: TipoVistoria,
    locacaoStatus: StatusLocacao,
  ): void {
    if (tipo === TipoVistoria.RETIRADA) {
      if (locacaoStatus !== StatusLocacao.AGUARDANDO_RETIRADA) {
        throw new ConflictException(
          `nao e possivel registrar vistoria de retirada: a locacao esta com status "${locacaoStatus}". A retirada exige a locacao aguardando retirada.`,
        );
      }
      return;
    }

    if (tipo === TipoVistoria.DEVOLUCAO) {
      if (locacaoStatus !== StatusLocacao.EM_ANDAMENTO) {
        throw new ConflictException(
          `nao e possivel registrar vistoria de devolucao: a locacao esta com status "${locacaoStatus}". A devolucao exige a locacao em andamento.`,
        );
      }
      return;
    }

    throw new ConflictException('tipo de vistoria nao suportado');
  }

  private isStaff(actor: AuthenticatedUser): boolean {
    return (
      actor.type === UserType.ADMIN || actor.type === UserType.FUNCIONARIO
    );
  }
}
