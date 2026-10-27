import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Car } from './entities/car.entity.js';
import { StatusVeiculo } from './enums/status-veiculo.enum.js';
import { CreateCarDto } from './dto/create-car.dto.js';
import { UpdateCarDto } from './dto/update-car.dto.js';

/**
 * Regras de negócio do veículo.
 *
 * Injeção de dependência: `@InjectRepository(Car)` recebe o Repository<Car>
 * registrado por `TypeOrmModule.forFeature([Car])` no CarModule.
 */
@Injectable()
export class CarService {
  constructor(
    @InjectRepository(Car)
    private readonly carsRepository: Repository<Car>,
  ) {}

  async create(dto: CreateCarDto): Promise<Car> {
    const placaExists = await this.carsRepository.exists({
      where: { placa: dto.placa },
    });

    if (placaExists) {
      throw new ConflictException('ja existe um veiculo com esta placa');
    }

    return this.carsRepository.save(
      this.carsRepository.create({
        placa: dto.placa,
        modelo: dto.modelo,
        marca: dto.marca,
        categoria: dto.categoria,
        ano: dto.ano,
        status: dto.status ?? StatusVeiculo.DISPONIVEL,
        valorDiaria: dto.valorDiaria,
      }),
    );
  }

  findAll(): Promise<Car[]> {
    return this.carsRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Car> {
    const carro = await this.carsRepository.findOne({
      where: { id },
    });

    if (!carro) {
      throw new NotFoundException(`veiculo com ID ${id} nao encontrado`);
    }

    return carro;
  }

  async update(id: number, dto: UpdateCarDto): Promise<Car> {
    const carroExistente = await this.findOne(id);

    if (dto.placa && dto.placa !== carroExistente.placa) {
      const placaExists = await this.carsRepository.exists({
        where: { placa: dto.placa },
      });

      if (placaExists) {
        throw new ConflictException('ja existe um veiculo com esta placa');
      }
    }

    const changes: Partial<Car> = {};

    if (dto.placa !== undefined) changes.placa = dto.placa;
    if (dto.modelo !== undefined) changes.modelo = dto.modelo;
    if (dto.marca !== undefined) changes.marca = dto.marca;
    if (dto.categoria !== undefined) changes.categoria = dto.categoria;
    if (dto.ano !== undefined) changes.ano = dto.ano;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.valorDiaria !== undefined) changes.valorDiaria = dto.valorDiaria;

    if (Object.keys(changes).length > 0) {
      await this.carsRepository.update({ id }, changes);
    }

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

    await this.carsRepository.delete({ id });
  }
}
