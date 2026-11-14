import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CarroService } from '../carro/carro.service.js';
import { RedisService } from '../redis/redis.service.js';
import { Revisao } from './entities/revisao.entity.js';
import { StatusRevisao } from './enums/status-revisao.enum.js';
import { CreateRevisaoDto } from './dto/create-revisao.dto.js';
import { UpdateRevisaoDto } from './dto/update-revisao.dto.js';

/**
 * Intervalo configurado (em km) para a revisão periódica de um veículo.
 *
 * Esse valor foi adotado inicialmente pois o diagrama UML não define um
 * intervalo específico. Pode ser alterado futuramente sem impacto na
 * estrutura do banco de dados.
 */
const INTERVALO_REVISAO_KM = 10000;

/**
 * Margem (em km) antes do limite para classificar uma revisão como `PROXIMA`.
 *
 * Quando a quilometragem atual está dentro dessa margem do próximo limite,
 * o veículo é considerado "próximo da revisão".
 */
const MARGEM_PROXIMA_KM = 1000;

/** Formato da resposta do status de revisão periódica de um veículo. */
export interface RevisaoPeriodicaStatus {
  carroId: number;
  placa: string;
  quilometragemAtual: number;
  ultimaRevisaoKm: number | null;
  proximaRevisaoPrevista: number | null;
  situacao: StatusRevisao;
}

/**
 * Regras de negócio de revisão de veículos.
 *
 * O `RevisaoService` é responsável por:
 * - registrar revisões vinculadas a um carro;
 * - consultar revisões por ID, por carro e listar todas;
 * - atualizar informações permitidas de uma revisão;
 * - excluir revisões quando permitido;
 * - calcular a situação de revisão periódica de um veículo
 *   (`EM_DIA`, `PROXIMA`, `PENDENTE`, `SEM_HISTORICO`);
 * - consultar a situação de revisão de todos os veículos.
 *
 * Injeção de dependência:
 * - `Repository<Revisao>` é registrado por `TypeOrmModule.forFeature([Revisao])`;
 * - `CarroService` (exportado por `CarroModule`) valida a existência do
 *   veículo e permite consultar todos os veículos;
 * - `DataSource` abre transações quando uma operação altera mais de uma
 *   entidade (ex: revisão + quilometragem do carro).
 *
 * Não há dependência circular: `RevisaoModule` importa `CarroModule`, mas
 * `CarroModule` não importa `RevisaoModule`.
 */
@Injectable()
export class RevisaoService {
  private readonly logger = new Logger(RevisaoService.name);

  constructor(
    @InjectRepository(Revisao)
    private readonly revisoesRepository: Repository<Revisao>,
    private readonly dataSource: DataSource,
    private readonly carroService: CarroService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Registra uma nova revisão vinculada a um veículo.
   *
   * Regras de negócio aplicadas:
   * 1. Verificar se o carro informado existe (404 caso contrário).
   * 2. Buscar a última revisão registrada para o mesmo veículo.
   * 3. Impedir que a quilometragem informada seja inferior à da última
   *    revisão (garante consistência do histórico).
   * 4. Registrar a revisão com data, descrição, quilometragem e valor.
   * 5. Atualizar a quilometragem atual do carro com o `km` informado.
   * 6. Persistir revisão e carro na mesma transação.
   *
   * @param dto Dados da revisão a ser criada.
   * @returns A revisão criada.
   */
  async create(dto: CreateRevisaoDto): Promise<any> {
    // 1. Verifica se o carro existe.
    const carro = await this.carroService.findOne(dto.carroId);

    // 2. Busca a última revisão registrada para este carro (ordena por data decrescente).
    const ultimaRevisao = await this.revisoesRepository.findOne({
      where: { carro_id: carro.id },
      order: { data: 'DESC' },
    });

    // 3. Valida a quilometragem: não permite valor inferior à última revisão.
    if (ultimaRevisao && dto.km < ultimaRevisao.km) {
      throw new ConflictException(
        `não é possível registrar revisão com km ${dto.km} inferior à última revisão registrada (${ultimaRevisao.km} km).`,
      );
    }

    // 4. Cria a revisão em memória.
    const revisao = this.revisoesRepository.create({
      data: new Date(dto.data),
      descricao: dto.descricao,
      km: dto.km,
      valor: dto.valor,
      carro_id: carro.id,
    });

    // 5. Atualiza a quilometragem atual do carro com o km informado na revisão.
    carro.quilometragem = dto.km;

    // 6. Persiste revisão e carro na mesma transação para garantir consistência.
    const revisaoSalva = await this.dataSource.transaction(async (manager) => {
      const salva = await manager.save(revisao);
      await manager.save(carro);
      return salva;
    });

    // 7. Invalida o status do carro somente após o commit no MySQL. A criação
    // altera a última revisão e a quilometragem do veículo.
    await this.invalidateStatusCache(carro.id);

    return revisaoSalva;
  }

  /**
   * Consulta todas as revisões registradas no sistema.
   *
   * @returns Lista de todas as revisões.
   */
  async findAll(): Promise<any[]> {
    return this.revisoesRepository.find({
      order: { data: 'DESC' },
    });
  }

  /**
   * Consulta uma revisão pelo seu identificador.
   *
   * @param id UUID da revisão.
   * @returns A revisão encontrada.
   * @throws NotFoundException quando a revisão não existe.
   */
  async findOne(id: string): Promise<any> {
    const revisao = await this.revisoesRepository.findOne({
      where: { id },
    });

    if (!revisao) {
      throw new NotFoundException(`revisão com ID ${id} não encontrada`);
    }

    return revisao;
  }

  /**
   * Consulta o histórico de revisões de um carro específico.
   *
   * O histórico é ordenado por data (mais recente primeiro) para facilitar a
   * leitura da evolução do veículo.
   *
   * @param carroId ID do veículo.
   * @returns Lista de revisões do carro.
   */
  async findByCarro(carroId: number): Promise<any[]> {
    // Verifica se o carro existe antes de consultar o histórico.
    await this.carroService.findOne(carroId);

    return this.revisoesRepository.find({
      where: { carro_id: carroId },
      order: { data: 'DESC' },
    });
  }

  /**
   * Atualiza informações permitidas de uma revisão.
   *
   * Apenas `descricao`, `valor` e `data` podem ser alterados. `km` e
   * `carroId` são imutáveis após o registro para preservar a integridade
   * do histórico e do controle de revisão periódica.
   *
   * @param id UUID da revisão.
   * @param dto Campos a serem atualizados.
   * @returns A revisão atualizada.
   */
  async update(id: string, dto: UpdateRevisaoDto): Promise<any> {
    const revisao = await this.findOne(id); // verifica existência (lança 404 se não existir)

    const changes: Partial<any> = {};

    if (dto.descricao !== undefined) changes.descricao = dto.descricao;
    if (dto.valor !== undefined) changes.valor = dto.valor;
    if (dto.data !== undefined) changes.data = new Date(dto.data);

    if (Object.keys(changes).length > 0) {
      await this.revisoesRepository.update({ id }, changes);
    }

    // Invalida o status do carro após a gravação no MySQL. A data pode alterar
    // qual revisão é considerada a última no cálculo periódico.
    await this.invalidateStatusCache(revisao.carro_id);

    return this.findOne(id);
  }

  /**
   * Exclui uma revisão.
   *
   * A exclusão é permitida apenas quando a revisão existe. Como o histórico
   * de manutenção é importante para o controle de revisão periódica, avalie
   * cuidadosamente antes de excluir registros em produção.
   *
   * @param id UUID da revisão.
   */
  async remove(id: string): Promise<void> {
    const revisao = await this.findOne(id);

    await this.revisoesRepository.remove(revisao);

    // Invalida o status do carro após a exclusão no MySQL: a revisão removida
    // pode ser a última considerada no cálculo periódico.
    await this.invalidateStatusCache(revisao.carro_id);
  }

  /**
   * Consulta a situação de revisão periódica de um veículo.
   *
   * Regras:
   * - SEM_HISTORICO: o veículo não possui nenhuma revisão registrada.
   * - PENDENTE: quilometragem atual >= última_km + INTERVALO_REVISAO_KM.
   * - PROXIMA: quilometragem atual >= última_km + INTERVALO_REVISAO_KM - MARGEM_PROXIMA_KM.
   * - EM_DIA: nenhum dos casos acima.
   *
   * @param carroId ID do veículo.
   * @returns Objeto com a situação e detalhes do cálculo.
   */
  async verificarRevisaoPeriodica(
    carroId: number,
  ): Promise<RevisaoPeriodicaStatus> {
    const cacheKey = `locamais:revisao:carro:${carroId}`;

    // Tenta recuperar do cache. O valor armazenado é exatamente o objeto de
    // resposta do endpoint (sem entidades e sem dados do veículo além dos
    // campos já retornados), portanto não há risco de ciclo ou vazamento.
    let cached: RevisaoPeriodicaStatus | null = null;
    try {
      cached = await this.redis.get<RevisaoPeriodicaStatus>(cacheKey);
    } catch (error) {
      this.logger.error(
        `Falha ao ler cache do status de revisao do carro ${carroId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (cached) {
      return cached;
    }

    // Cache miss: consulta o MySQL
    const carro = await this.carroService.findOne(carroId);

    const ultimaRevisao = await this.revisoesRepository.findOne({
      where: { carro_id: carro.id },
      order: { data: 'DESC' },
    });

    let resultado: RevisaoPeriodicaStatus;

    // Veículo sem histórico de revisão.
    if (!ultimaRevisao) {
      resultado = {
        carroId: carro.id,
        placa: carro.placa,
        quilometragemAtual: carro.quilometragem,
        ultimaRevisaoKm: null,
        proximaRevisaoPrevista: null,
        situacao: StatusRevisao.SEM_HISTORICO,
      };
    } else {
      const proximaRevisaoPrevista = ultimaRevisao.km + INTERVALO_REVISAO_KM;
      const limiteProxima = proximaRevisaoPrevista - MARGEM_PROXIMA_KM;

      let situacao: StatusRevisao;

      if (carro.quilometragem >= proximaRevisaoPrevista) {
        situacao = StatusRevisao.PENDENTE;
      } else if (carro.quilometragem >= limiteProxima) {
        situacao = StatusRevisao.PROXIMA;
      } else {
        situacao = StatusRevisao.EM_DIA;
      }

      resultado = {
        carroId: carro.id,
        placa: carro.placa,
        quilometragemAtual: carro.quilometragem,
        ultimaRevisaoKm: ultimaRevisao.km,
        proximaRevisaoPrevista,
        situacao,
      };
    }

    // Armazena no cache com TTL de 300 segundos (5 minutos)
    try {
      await this.redis.set(cacheKey, resultado, 300);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache do status de revisao do carro ${carroId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return resultado;
  }

  /**
   * Consulta a situação de revisão de todos os veículos.
   *
   * Útil para identificar rapidamente quais veículos precisam de manutenção.
   *
   * @returns Lista com a situação de revisão de cada veículo.
   */
  async consultarSituacaoRevisaoVeiculos(): Promise<RevisaoPeriodicaStatus[]> {
    const carros = await this.carroService.findAll();

    const resultado = [];

    for (const carro of carros) {
      const situacao = await this.verificarRevisaoPeriodica(carro.id);
      resultado.push(situacao);
    }

    return resultado;
  }

  /**
   * Invalida o cache de status de um ou mais veículos.
   *
   * Aceita uma lista para cobrir operações futuras que alterem revisões de
   * vários carros. Cada falha é registrada individualmente e não interrompe
   * as demais invalidações nem o retorno da operação principal.
   */
  private async invalidateStatusCache(
    carroIds: number | number[],
  ): Promise<void> {
    const ids = Array.isArray(carroIds) ? carroIds : [carroIds];

    for (const carroId of ids) {
      try {
        await this.redis.del(`locamais:revisao:carro:${carroId}`);
      } catch (error) {
        this.logger.error(
          `Falha ao invalidar cache do status de revisao do carro ${carroId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
