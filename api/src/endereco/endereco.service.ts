import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Cliente } from '../cliente/entities/cliente.entity.js';

import { CreateEnderecoDto } from './dto/create-endereco.dto.js';
import { UpdateEnderecoDto } from './dto/update-endereco.dto.js';
import { Endereco } from './entities/endereco.entity.js';

/**
 * SERVIÇO DE ENDEREÇOS — ENDEREÇO DO CLIENTE
 *
 * O endereço pertence ao cliente (relação 1:1). Este Service atende às
 * operações isoladas de endereço (consultar, criar para cliente existente e
 * atualizar) e também fornece ao `ClienteService` a criação do endereço dentro
 * da transação que cria Usuario + Cliente + Endereco.
 *
 * O `EnderecoModule` registra apenas os Repositories que este Service usa
 * diretamente (`Endereco` e `Cliente`). A entidade `Usuario` continua carregada
 * globalmente pelo `UsuarioModule`, permitindo a relação `client.user`.
 */
@Injectable()
export class EnderecoService {
  constructor(
    @InjectRepository(Endereco)
    private readonly enderecosRepository: Repository<Endereco>,
    @InjectRepository(Cliente)
    private readonly clientesRepository: Repository<Cliente>,
  ) {}

  /** Busca o endereço pelo ID do cliente (chave única 1:1). */
  findByClientId(clientId: number): Promise<Endereco | null> {
    return this.enderecosRepository.findOne({
      where: { client_id: clientId },
      relations: { client: { user: true } },
    });
  }

  /** Busca um endereço pelo ID; lança 404 quando não existe. */
  async findOne(id: number): Promise<Endereco> {
    const address = await this.enderecosRepository.findOne({
      where: { id },
      relations: { client: { user: true } },
    });

    if (!address) {
      throw new NotFoundException(`endereco de ID ${id} nao encontrado`);
    }

    return address;
  }

  /** Lista todos os endereços com o cliente e o usuário associados. */
  findAll(): Promise<Endereco[]> {
    return this.enderecosRepository.find({
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
  async create(clientId: number, dto: CreateEnderecoDto): Promise<Endereco> {
    const client = await this.clientesRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(
        `cliente de ID ${clientId} nao encontrado`,
      );
    }

    const existing = await this.enderecosRepository.findOne({
      where: { client_id: clientId },
    });

    if (existing) {
      throw new ConflictException(
        'cliente ja possui endereco; atualize o registro existente',
      );
    }

    const address = this.enderecosRepository.create({
      ...this.buildAddressFields(dto),
      client_id: clientId,
    });

    return this.enderecosRepository.save(address);
  }

  /**
   * Cria o endereço de um cliente recém-criado dentro da transação aberta
   * pelo `ClienteService`.
   *
   * Diferente de `create()`, não consulta a existência do cliente nem do
   * endereço: o cliente acabou de ser inserido e ainda não possui endereço.
   * O EntityManager recebido garante que o endereço será confirmado ou
   * revertido junto com Usuario e Cliente.
   */
  createForClientInTransaction(
    manager: EntityManager,
    clientId: number,
    dto: CreateEnderecoDto,
  ): Promise<Endereco> {
    const repository = manager.getRepository(Endereco);

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
  async update(id: number, dto: UpdateEnderecoDto): Promise<Endereco> {
    await this.findOne(id);

    const changes: Partial<Endereco> = {};

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
      await this.enderecosRepository.update({ id }, changes);
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
    dto: CreateEnderecoDto,
  ): Pick<
    Endereco,
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
   * correto é `PATCH /api/enderecos/:id`. Quando a conta do cliente é
   * desativada, o endereço continua preservado para histórico.
   */
  async remove(id: number): Promise<void> {
    await this.findOne(id);

    throw new ConflictException(
      'endereco faz parte do cadastro do cliente e nao pode ser removido; atualize-o com PATCH',
    );
  }
}
