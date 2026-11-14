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
  ) {}

  async create(dto: CreateCarroDto): Promise<Carro> {
    const placaExists = await this.carrosRepository.exists({
      where: { placa: dto.placa },
    });

    if (placaExists) {
      throw new ConflictException('ja existe um veiculo com esta placa');
    }

    const saved = await this.carrosRepository.save(
      this.carrosRepository.create({
        placa: dto.placa,
        modelo: dto.modelo,
        marca: dto.marca,
        categoria: dto.categoria,
        ano: dto.ano,
        status: dto.status ?? StatusVeiculo.DISPONIVEL,
        valorDiaria: dto.valorDiaria,
      }),
    );

    return saved;
  }

  findAll(): Promise<Carro[]> {
    return this.carrosRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Carro> {
    const cacheKey = `locamais:carro:${id}`;

    // Redis é uma camada opcional: HIT evita a consulta ao MySQL; em MISS ou
    // falha do Redis, o banco continua sendo a fonte oficial dos dados.
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
      return cached;
    }

    // Cache MISS (ou Redis indisponível): consulta o MySQL.
    const carro = await this.carrosRepository.findOne({
      where: { id },
    });

    if (!carro) {
      throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    }

    // Gravação best-effort: a falha não altera a resposta da API.
    try {
      await this.redis.set(cacheKey, carro, 60);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache do carro ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return carro;
  }

  async update(id: number, dto: UpdateCarroDto): Promise<Carro> {
    const carroExistente = await this.findOne(id);

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

    const changes: Partial<Carro> = {};

    if (dto.placa !== undefined) changes.placa = dto.placa;
    if (dto.modelo !== undefined) changes.modelo = dto.modelo;
    if (dto.marca !== undefined) changes.marca = dto.marca;
    if (dto.categoria !== undefined) changes.categoria = dto.categoria;
    if (dto.ano !== undefined) changes.ano = dto.ano;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.valorDiaria !== undefined) changes.valorDiaria = dto.valorDiaria;

    if (Object.keys(changes).length > 0) {
      await this.carrosRepository.update({ id }, changes);
    }

    // Invalida o cache de status de revisao somente quando a placa realmente
    // mudou e a atualizacao foi confirmada no MySQL.
    if (placaMudou) {
      await this.invalidarCacheStatusRevisao(id);
    }

    // Invalida o cache do carro atualizado (qualquer campo alterado).
    await this.invalidarCacheCarro(id);

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const carro = await this.findOne(id);

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
