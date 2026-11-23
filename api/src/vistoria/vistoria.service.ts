import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { LocacaoService } from '../locacao/locacao.service.js';
import { StatusLocacao } from '../locacao/enums/status-locacao.enum.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { RedisService } from '../redis/redis.service.js';

import { CreateVistoriaDto } from './dto/create-vistoria.dto.js';
import { UpdateVistoriaDto } from './dto/update-vistoria.dto.js';
import { Vistoria } from './entities/vistoria.entity.js';
import { TipoVistoria } from './enums/tipo-vistoria.enum.js';
import { Carro } from '../carro/entities/carro.entity.js';
import { CacheInvalidationService } from '../redis/cache-invalidation.service.js';
import { CreateVistoriaVeiculoDto } from './dto/create-vistoria-veiculo.dto.js';
import { VistoriaCustosQueryDto } from './dto/vistoria-custos-query.dto.js';

export interface VistoriaCustosPorVeiculo {
  carro_id: number;
  modelo: string;
  placa: string;
  quantidade: number;
  total: number;
  vistorias: Array<{ id: string; data: Date; descricao: string; km: number; valor: number }>;
}

export interface VistoriaCustosRelatorio {
  porVeiculo: VistoriaCustosPorVeiculo[];
  totalGeral: number;
  quantidadeGeral: number;
  de: string | null;
  ate: string | null;
}

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
  private readonly logger = new Logger(VistoriaService.name);

  constructor(
    @InjectRepository(Vistoria)
    private readonly vistoriasRepository: Repository<Vistoria>,
    private readonly locacaoService: LocacaoService,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /** Registra uma vistoria periódica concluída e configura o próximo limite individual. */
  async createForVehicle(dto: CreateVistoriaVeiculoDto): Promise<Vistoria> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const carro = await manager.findOne(Carro, { where: { id: dto.carroId } });
      if (!carro) throw new NotFoundException(`veiculo com ID ${dto.carroId} nao encontrado`);
      if (dto.km < carro.quilometragem) {
        throw new ConflictException(`a quilometragem da vistoria (${dto.km} km) não pode ser inferior ao odômetro atual (${carro.quilometragem} km).`);
      }
      if (dto.proximaVistoriaKm <= dto.km) {
        throw new ConflictException('o próximo limite de vistoria deve ser maior que a quilometragem desta inspeção.');
      }

      const vistoria = this.vistoriasRepository.create({
        tipo: TipoVistoria.PERIODICA,
        data: new Date(dto.data),
        observacoes: dto.descricao.trim(),
        fotos: '[]',
        locacao_id: null,
        locacao: null,
        carro_id: carro.id,
        carro,
        km: dto.km,
        valor: dto.valor,
      });
      carro.quilometragem = dto.km;
      carro.proximaVistoriaKm = dto.proximaVistoriaKm;
      await manager.save(vistoria);
      await manager.save(carro);
      return vistoria;
    });

    // Após o commit no banco, invalida os dados do carro e reservas relacionadas.
    try {
      await this.redis.del(`locamais:carro:${dto.carroId}`);
    } catch (error) {
      this.logger.error(`Falha ao invalidar cache do carro ${dto.carroId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.cacheInvalidation.invalidateCarDependents(dto.carroId);
    return saved;
  }

  /** Histórico periódico restrito a um único veículo; rota protegida para staff. */
  async findByCarro(actor: UsuarioAutenticado, carroId: number): Promise<Vistoria[]> {
    if (!this.isStaff(actor)) throw new ForbiddenException('gerenciamento de vistorias restrito a admin/funcionário');
    const carro = await this.dataSource.getRepository(Carro).findOne({ where: { id: carroId } });
    if (!carro) throw new NotFoundException(`veiculo com ID ${carroId} nao encontrado`);
    return this.vistoriasRepository.find({
      where: { carro_id: carroId, tipo: TipoVistoria.PERIODICA },
      order: { data: 'DESC' },
    });
  }

  /** Relatório de despesas efetivamente concluídas, separado das revisões. */
  async resumirCustosPorVeiculo(query: VistoriaCustosQueryDto = {}): Promise<VistoriaCustosRelatorio> {
    const builder = this.vistoriasRepository.createQueryBuilder('vistoria')
      .leftJoinAndSelect('vistoria.carro', 'carro')
      .where('vistoria.tipo = :tipo', { tipo: TipoVistoria.PERIODICA })
      .andWhere('vistoria.carro_id IS NOT NULL');
    if (query.de) builder.andWhere('vistoria.data >= :de', { de: new Date(`${query.de}T00:00:00.000Z`) });
    if (query.ate) builder.andWhere('vistoria.data <= :ate', { ate: new Date(`${query.ate}T23:59:59.999Z`) });
    const rows = await builder.orderBy('vistoria.data', 'DESC').getMany() as Vistoria[];
    const grouped = new Map<number, VistoriaCustosPorVeiculo>();
    for (const item of rows) {
      if (!item.carro_id || !item.carro || item.km === null || item.valor === null) continue;
      const group = grouped.get(item.carro_id) ?? {
        carro_id: item.carro_id,
        modelo: `${item.carro.marca} ${item.carro.modelo}`,
        placa: item.carro.placa,
        quantidade: 0,
        total: 0,
        vistorias: [],
      };
      const valor = Number(item.valor);
      group.quantidade += 1;
      group.total += valor;
      group.vistorias.push({ id: item.id, data: item.data, descricao: item.observacoes ?? '', km: item.km, valor });
      grouped.set(item.carro_id, group);
    }
    const porVeiculo = [...grouped.values()];
    return {
      porVeiculo,
      totalGeral: porVeiculo.reduce((total, item) => total + item.total, 0),
      quantidadeGeral: porVeiculo.reduce((total, item) => total + item.quantidade, 0),
      de: query.de ?? null,
      ate: query.ate ?? null,
    };
  }

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
    actor: UsuarioAutenticado,
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

    return this.findOneFromDatabase(actor, saved.id);
  }

  /**
   * Lista vistorias conforme o papel do usuário.
   *
   * Admin/funcionário veem todas; cliente vê apenas as vistorias ligadas às
   * suas próprias locações (via `reservation.client.user_id`).
   */
  findAll(actor: UsuarioAutenticado): Promise<Vistoria[]> {
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
   *
   * Utiliza cache Redis (TTL 600s) na chave `locamais:vistoria:{id}`.
   * A autorização e verificada sobre os dados do cache antes de retorná-los,
   * garantindo que o cache nao contorne verificacoes de acesso.
   */
  async findOne(
    actor: UsuarioAutenticado,
    id: string,
  ): Promise<Vistoria> {
    const cacheKey = `locamais:vistoria:${id}`;

    // Tenta recuperar do cache primeiro.
    // A entidade Vistoria possui toJSON() que serializa os relacionamentos
    // carregados (locacao > reservation > client) sem causar ciclos, pois as
    // relacoes aninhadas (user, address, car, reservations) nao sao
    // carregadas nesta consulta.
    let cached: Vistoria | null = null;
    try {
      cached = await this.redis.get<Vistoria>(cacheKey);
    } catch (error) {
      this.logger.error(
        `Falha ao ler cache da vistoria ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (cached) {
      // Verifica autorizacao sobre os dados do cache (fora do try/catch do
      // Redis, para nao capturar ForbiddenException).
      this.assertCanRead(actor, cached);
      return cached;
    }

    // Cache miss: consulta o MySQL
    const vistoria = await this.vistoriasRepository.findOne({
      where: { id },
      relations: { locacao: { reservation: { client: true } } },
    });

    if (!vistoria) {
      throw new NotFoundException(`vistoria de ID ${id} nao encontrada`);
    }

    this.assertCanRead(actor, vistoria);

    // Armazena no cache com TTL de 600 segundos (10 minutos)
    try {
      await this.redis.set(cacheKey, vistoria, 600);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache da vistoria ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return vistoria;
  }

  /**
   * Consulta todas as vistorias de uma locação específica.
   *
   * Primeiro valida a existência da locação e o controle de acesso; depois
   * retorna o histórico de vistorias daquela locação.
   */
  async findByLocacao(
    actor: UsuarioAutenticado,
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
    actor: UsuarioAutenticado,
    id: string,
    dto: UpdateVistoriaDto,
  ): Promise<Vistoria> {
    const current = await this.findOneFromDatabase(actor, id);

    if (dto.observacoes !== undefined) {
      current.observacoes = dto.observacoes;
    }
    if (dto.fotos !== undefined) {
      current.fotos = dto.fotos;
    }

    const saved = await this.vistoriasRepository.save(current);

    // Invalida o cache da vistoria atualizada somente apos a gravacao no MySQL.
    try {
      await this.redis.del(`locamais:vistoria:${id}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache da vistoria ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return saved;
  }

  private async findOneFromDatabase(
    actor: UsuarioAutenticado,
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

  /** Staff enxerga tudo; cliente só enxerga as próprias vistorias. */
  private assertCanRead(actor: UsuarioAutenticado, vistoria: Vistoria): void {
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

  private isStaff(actor: UsuarioAutenticado): boolean {
    return (
      actor.type === TipoUsuario.ADMIN || actor.type === TipoUsuario.FUNCIONARIO
    );
  }
}
