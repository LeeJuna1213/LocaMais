import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteService } from '../cliente/cliente.service.js';
import { CarroService } from '../carro/carro.service.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { Favorito } from './favorito.entity.js';

@Injectable()
export class FavoritoService {
  constructor(
    @InjectRepository(Favorito) private readonly favoritos: Repository<Favorito>,
    private readonly clientes: ClienteService,
    private readonly carros: CarroService,
  ) {}

  async list(actor: UsuarioAutenticado): Promise<Favorito[]> {
    const client = await this.clientes.findByUserId(actor.id);
    if (!client) return [];
    return this.favoritos.find({ where: { client_id: client.id }, relations: { car: true }, order: { created_at: 'DESC' } });
  }

  async add(actor: UsuarioAutenticado, carId: number): Promise<Favorito> {
    const client = await this.clientes.findByUserId(actor.id);
    if (!client) throw new NotFoundException('cadastro de cliente não encontrado');
    const car = await this.carros.findOne(carId);
    const existing = await this.favoritos.findOne({ where: { client_id: client.id, car_id: carId }, relations: { car: true } });
    if (existing) return existing;
    return this.favoritos.save(this.favoritos.create({ client_id: client.id, client, car_id: car.id, car }));
  }

  async remove(actor: UsuarioAutenticado, carId: number): Promise<void> {
    const client = await this.clientes.findByUserId(actor.id);
    if (!client) throw new NotFoundException('cadastro de cliente não encontrado');
    await this.favoritos.delete({ client_id: client.id, car_id: carId });
  }
}
