import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Client } from '../client/entities/client.entity.js';

import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';
import { Address } from './entities/address.entity.js';

/**
 * ADDRESS SERVICE — ENDEREÇO DO CLIENTE
 *
 * O endereço pertence ao cliente (relação 1:1). Este Service atende às
 * operações isoladas de endereço (consultar, criar para cliente existente e
 * atualizar) e também fornece ao `ClientService` a criação do endereço dentro
 * da transação que cria User + Client + Address.
 *
 * O `AddressModule` registra apenas os Repositories que este Service usa
 * diretamente (`Address` e `Client`). A entidade `User` continua carregada
 * globalmente pelo `UserModule`, permitindo a relação `client.user`.
 */
@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
  ) {}

  /** Busca o endereço pelo ID do cliente (chave única 1:1). */
  findByClientId(clientId: number): Promise<Address | null> {
    return this.addressesRepository.findOne({
      where: { client_id: clientId },
      relations: { client: { user: true } },
    });
  }

  /** Busca um endereço pelo ID; lança 404 quando não existe. */
  async findOne(id: number): Promise<Address> {
    const address = await this.addressesRepository.findOne({
      where: { id },
      relations: { client: { user: true } },
    });

    if (!address) {
      throw new NotFoundException(`endereco de ID ${id} nao encontrado`);
    }

    return address;
  }

  /** Lista todos os endereços com o cliente e o usuário associados. */
  findAll(): Promise<Address[]> {
    return this.addressesRepository.find({
      relations: { client: { user: true } },
      order: { id: 'ASC' },
    });
  }

  /**
   * Cria o endereço de um cliente existente.
   *
   * Como a relação é 1:1, um cliente que já possui endereço não pode receber
   * outro: nesse caso o correto é atualizar o endereço existente.
   */
  async create(clientId: number, dto: CreateAddressDto): Promise<Address> {
    const client = await this.clientsRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(
        `cliente de ID ${clientId} nao encontrado`,
      );
    }

    const existing = await this.addressesRepository.findOne({
      where: { client_id: clientId },
    });

    if (existing) {
      throw new ConflictException(
        'cliente ja possui endereco; atualize o registro existente',
      );
    }

    const address = this.addressesRepository.create({
      ...this.buildAddressFields(dto),
      client_id: clientId,
    });

    return this.addressesRepository.save(address);
  }

  /**
   * Cria o endereço de um cliente recém-criado dentro da transação aberta
   * pelo `ClientService`.
   *
   * Diferente de `create()`, não consulta a existência do cliente nem do
   * endereço: o cliente acabou de ser inserido e ainda não possui endereço.
   * O EntityManager recebido garante que o endereço será confirmado ou
   * revertido junto com User e Client.
   */
  createForClientInTransaction(
    manager: EntityManager,
    clientId: number,
    dto: CreateAddressDto,
  ): Promise<Address> {
    const repository = manager.getRepository(Address);

    return repository.save(
      repository.create({
        ...this.buildAddressFields(dto),
        client_id: clientId,
      }),
    );
  }

  /**
   * Atualização parcial do endereço.
   *
   * `client_id` não é alterável pelo DTO: o vínculo com o cliente é imutável.
   */
  async update(id: number, dto: UpdateAddressDto): Promise<Address> {
    await this.findOne(id);

    const changes: Partial<Address> = {};

    if (dto.logradouro !== undefined) changes.logradouro = dto.logradouro.trim();
    if (dto.numero !== undefined) changes.numero = dto.numero.trim();
    if (dto.complemento !== undefined) {
      changes.complemento = dto.complemento.trim() || null;
    }
    if (dto.bairro !== undefined) changes.bairro = dto.bairro.trim();
    if (dto.cidade !== undefined) changes.cidade = dto.cidade.trim();
    if (dto.uf !== undefined) changes.uf = dto.uf.toUpperCase();
    if (dto.cep !== undefined) changes.cep = dto.cep;

    if (Object.keys(changes).length > 0) {
      await this.addressesRepository.update({ id }, changes);
    }

    return this.findOne(id);
  }

  /**
   * Centraliza a normalização dos campos do endereço.
   *
   * É usado tanto na criação isolada quanto na criação transacional do
   * cliente, evitando duas regras diferentes para os mesmos dados.
   */
  private buildAddressFields(
    dto: CreateAddressDto,
  ): Pick<
    Address,
    | 'logradouro'
    | 'numero'
    | 'complemento'
    | 'bairro'
    | 'cidade'
    | 'uf'
    | 'cep'
  > {
    return {
      logradouro: dto.logradouro.trim(),
      numero: dto.numero.trim(),
      complemento: dto.complemento?.trim() || null,
      bairro: dto.bairro.trim(),
      cidade: dto.cidade.trim(),
      uf: dto.uf.toUpperCase(),
      cep: dto.cep,
    };
  }

  /**
   * Remoção de endereço é bloqueada de propósito.
   *
   * Todo cliente precisa de endereço para o contrato de locação. Apagar a
   * linha deixaria o cliente incompleto. Se o cliente mudou de endereço, o
   * correto é `PATCH /api/addresses/:id`. Quando a conta do cliente é
   * desativada, o endereço continua preservado para histórico.
   */
  async remove(id: number): Promise<void> {
    await this.findOne(id);

    throw new ConflictException(
      'endereco faz parte do cadastro do cliente e nao pode ser removido; atualize-o com PATCH',
    );
  }
}
