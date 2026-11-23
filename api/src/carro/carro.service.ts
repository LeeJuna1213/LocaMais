import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Carro } from './entities/carro.entity.js';
import { StatusVeiculo } from './enums/status-veiculo.enum.js';
import { CreateCarroDto } from './dto/create-carro.dto.js';
import { UpdateCarroDto } from './dto/update-carro.dto.js';
import { Reserva } from '../reserva/entities/reserva.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { CacheInvalidationService } from '../redis/cache-invalidation.service.js';
import { CarroFotoStorage } from './carro-foto.storage.js';
import { CategoriaVeiculoService } from './categoria.service.js';

/**
 * Regras de negócio do veículo.
 *
 * Injeção de dependência: `@InjectRepository(Carro)` recebe o Repository<Carro>
 * registrado por `TypeOrmModule.forFeature([Carro, Reserva])` no CarroModule.
 * O Repository<Reserva> é usado apenas para impedir a remoção de um carro
 * que já possui histórico de reservas.
 */
@Injectable()
export class CarroService {
  private readonly logger = new Logger(CarroService.name);

  constructor(
    @InjectRepository(Carro)
    private readonly carrosRepository: Repository<Carro>,
    @InjectRepository(Reserva)
    private readonly reservasRepository: Repository<Reserva>,
    private readonly redis: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly fotoStorage: CarroFotoStorage,
    private readonly categorias: CategoriaVeiculoService,
  ) {}

  async create(dto: CreateCarroDto): Promise<Carro> {
    const placaExists = await this.carrosRepository.exists({
      where: { placa: dto.placa },
    });

    if (placaExists) {
      throw new ConflictException('ja existe um veiculo com esta placa');
    }

    const categoria = await this.categorias.resolveForVehicle(dto.categoria_id, dto.categoria);

    const saved = await this.carrosRepository.save(
      this.carrosRepository.create({
        placa: dto.placa,
        modelo: dto.modelo,
        marca: dto.marca,
        categoria: categoria.nome,
        categoria_id: categoria.id,
        categoriaEntity: categoria,
        lugares: dto.lugares ?? null,
        descricao: dto.descricao ?? null,
        cambio: dto.cambio ?? null,
        ano: dto.ano,
        status: dto.status ?? StatusVeiculo.DISPONIVEL,
        valorDiaria: dto.valorDiaria,
      }),
    );

    return saved;
  }

  findAll(): Promise<Carro[]> {
    return this.carrosRepository.find({
      relations: { categoriaEntity: true },
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Carro> {
    const cacheKey = `locamais:carro:${id}`;

    // Redis acelera os dados gerais. A foto é sempre confirmada no MySQL em HIT.
    let cached: Carro | null = null;
    try {
      cached = await this.redis.get<Carro>(cacheKey);
    } catch (error) {
      this.logger.error(
        `Falha ao ler cache do carro ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (cached) {
      const fotoCarro = await this.buscarFoto(id);
      if (!fotoCarro) {
        throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
      }
      // Nunca confiar em `foto` presente em uma chave antiga do Redis.
      return { ...cached, categoria: fotoCarro.categoria, categoria_id: fotoCarro.categoria_id, foto: fotoCarro.foto } as Carro;
    }

    // Cache MISS (ou Redis indisponível): consulta o MySQL.
    const carro = await this.carrosRepository.findOne({
      where: { id },
      relations: { categoriaEntity: true },
    });

    if (!carro) {
      throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    }

    // Gravação best-effort: a falha não altera a resposta da API.
    try {
      const { foto: _foto, ...dadosGerais } = carro;
      await this.redis.set(cacheKey, dadosGerais, 60);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache do carro ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return carro;
  }

  /** Consulta somente ID e foto; usada para completar dados gerais cacheados. */
  private buscarFoto(
    id: number,
  ): Promise<Pick<Carro, 'id' | 'foto' | 'categoria' | 'categoria_id'> | null> {
    return this.carrosRepository.findOne({
      where: { id },
      select: { id: true, foto: true, categoria: true, categoria_id: true },
    });
  }

  /** Enriquece um carro aninhado com o caminho atual consultado no MySQL. */
  async enriquecerFoto<T extends { id: number }>(carro: T): Promise<T & { foto: string | null }> {
    const atual = await this.buscarFoto(carro.id);
    if (!atual) {
      throw new NotFoundException(`veiculo com ID ${carro.id} nao encontrado`);
    }
    return { ...carro, foto: atual.foto };
  }

  async update(id: number, dto: UpdateCarroDto): Promise<Carro> {
    const carroExistente = await this.carrosRepository.findOne({ where: { id } });
    if (!carroExistente) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);

    if (dto.placa && dto.placa !== carroExistente.placa) {
      const placaExists = await this.carrosRepository.exists({
        where: { placa: dto.placa },
      });

      if (placaExists) {
        throw new ConflictException('ja existe um veiculo com esta placa');
      }
    }

    // A placa e um dos campos do status de revisao em cache, entao ela so pode
    // tornar a entrada antiga invalida se realmente foi alterada.
    const placaMudou =
      dto.placa !== undefined && dto.placa !== carroExistente.placa;

    const categoria = dto.categoria_id !== undefined || dto.categoria !== undefined
      ? await this.categorias.resolveForVehicle(dto.categoria_id, dto.categoria)
      : undefined;

    const changes: Partial<Carro> = {};

    if (dto.placa !== undefined) changes.placa = dto.placa;
    if (dto.modelo !== undefined) changes.modelo = dto.modelo;
    if (dto.marca !== undefined) changes.marca = dto.marca;
    if (categoria) {
      changes.categoria = categoria.nome;
      changes.categoria_id = categoria.id;
    }
    if (dto.lugares !== undefined) changes.lugares = dto.lugares;
    if (dto.descricao !== undefined) changes.descricao = dto.descricao;
    if (dto.cambio !== undefined) changes.cambio = dto.cambio;
    if (dto.ano !== undefined) changes.ano = dto.ano;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.valorDiaria !== undefined) changes.valorDiaria = dto.valorDiaria;

    if (Object.keys(changes).length > 0) {
      await this.carrosRepository.update({ id }, changes);
    }

    // Invalida o cache de status de revisao somente quando a placa realmente
    // mudou e a atualizacao foi confirmada no MySQL.
    if (Object.keys(changes).length > 0) {
      if (placaMudou) {
        await this.invalidarCacheStatusRevisao(id);
      }

      await this.invalidarCacheCarro(id);
      await this.cacheInvalidation.invalidateCarDependents(id);
    }

    const updated = await this.carrosRepository.findOne({ where: { id }, relations: { categoriaEntity: true } });
    if (!updated) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    return updated;
  }

  async remove(id: number): Promise<void> {
    // Decisões de escrita usam sempre o estado atual do MySQL, nunca o cache.
    const carro = await this.carrosRepository.findOne({ where: { id } });
    if (!carro) {
      throw new NotFoundException(`carro ${id} nao encontrado`);
    }

    // Regra de negócio: um veículo alugado ou em manutenção não pode
    // desaparecer do sistema, pois contratos futuros dependem dele.
    if (carro.status !== StatusVeiculo.DISPONIVEL) {
      throw new ConflictException(
        `nao e possivel remover veiculo com status "${carro.status}". Apenas "disponivel" podem ser removidos.`,
      );
    }

    // A reserva guarda o histórico do veículo. Remover o carro fisicamente
    // apagaria/órfãsaria esse histórico, então a remoção é bloqueada assim que
    // existir qualquer reserva (inclusive cancelada ou concluída). O banco
    // também usa ON DELETE RESTRICT como segunda barreira.
    const possuiReservas = await this.reservasRepository.exists({
      where: { car_id: id },
    });

    if (possuiReservas) {
      throw new ConflictException(
        'veiculo possui reservas e nao pode ser removido fisicamente',
      );
    }

    try {
      await this.carrosRepository.delete({ id });
    } catch (error) {
      // Corrida entre a checagem acima e uma reserva recém-criada: o banco
      // bloqueia pela FK e convertemos a violação em 409, sem ocultar outros
      // erros de persistência.
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'veiculo possui reservas e nao pode ser removido fisicamente',
        );
      }

      throw error;
    }

    // Invalida o cache de status de revisao somente apos a exclusao ser
    // confirmada no MySQL.
    await this.invalidarCacheStatusRevisao(id);

    // Invalida o cache do carro removido.
    await this.invalidarCacheCarro(id);
    await this.cacheInvalidation.invalidateCarDependents(id);
  }

  async enviarFoto(id: number, arquivo: Express.Multer.File): Promise<Carro> {
    this.fotoStorage.validar(arquivo);
    const atual = await this.carrosRepository.findOne({ where: { id } });
    if (!atual) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    const novoCaminho = await this.fotoStorage.salvar(arquivo);
    try {
      await this.carrosRepository.update({ id }, { foto: novoCaminho });
    } catch (error) {
      await this.fotoStorage.remover(novoCaminho).catch(() => undefined);
      throw error;
    }

    await this.invalidarCacheCarro(id);
    await this.cacheInvalidation.invalidateCarDependents(id);
    if (atual.foto) {
      await this.fotoStorage.remover(atual.foto).catch(() => undefined);
    }
    const atualizado = await this.carrosRepository.findOne({ where: { id } });
    if (!atualizado) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    return atualizado;
  }

  async removerFoto(id: number): Promise<Carro> {
    const carro = await this.carrosRepository.findOne({ where: { id } });
    if (!carro) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);

    await this.carrosRepository.update({ id }, { foto: null });
    await this.invalidarCacheCarro(id);
    await this.cacheInvalidation.invalidateCarDependents(id);
    await this.fotoStorage.remover(carro.foto).catch(() => undefined);

    const atualizado = await this.carrosRepository.findOne({ where: { id } });
    if (!atualizado) throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    return atualizado;
  }

  /** Identifica violação de FK sem depender de um único driver. */
  private isForeignKeyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError = (error.driverError ?? {}) as {
      code?: string;
      errno?: number;
      message?: string;
    };

    return (
      driverError.code === 'ER_ROW_IS_REFERENCED_2' ||
      driverError.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
      driverError.errno === 1451 ||
      /foreign key constraint/i.test(driverError.message ?? '')
    );
  }

  /**
   * Invalida o cache de `GET /revisoes/carro/:carroId/status` para um veiculo.
   *
   * Falhas no Redis sao registradas porem nao desfazem a operacao ja concluida
   * no MySQL: a entrada antiga permanece ate expirar pelo TTL de 300 segundos.
   */
  private async invalidarCacheStatusRevisao(carroId: number): Promise<void> {
    try {
      await this.redis.del(`locamais:revisao:carro:${carroId}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache de revisao do carro ${carroId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Invalida o cache de `GET /carros/:id` para um veiculo.
   *
   * Falhas no Redis sao registradas porem nao desfazem a operacao ja concluida
   * no MySQL: a entrada antiga permanece ate expirar pelo TTL de 60 segundos.
   */
  private async invalidarCacheCarro(carroId: number): Promise<void> {
    try {
      await this.redis.del(`locamais:carro:${carroId}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache do carro ${carroId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
