import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Client, ClientStatus, ClientType } from '../models';

export interface ClientInput {
  name: string;
  type: ClientType;
  document: string;
  email?: string;
  phone?: string;
}

export interface OwnClientCompleteness { completo: boolean; pendencias: string[]; }
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';

interface ClienteApiResponse {
  id: number;
  tipo_pessoa: ClientType;
  cpf: string | null;
  cnpj: string | null;
  data_nascimento: string | null;
  razao_social: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    active: boolean;
    type: string;
    foto: string | null;
  } | null;
  address: {
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    state: string;
    cep: string;
    pais: string;
  } | null;
}

function mapCliente(api: ClienteApiResponse): Client {
  const user = api.user ?? null;
  return {
    id: api.id,
    name: user?.name ?? '',
    type: api.tipo_pessoa,
    status: user?.active ? 'Ativo' : 'Inativo',
    document: api.cpf ?? api.cnpj ?? '',
    email: user?.email ?? '',
    phone: '',
  };
}

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _clients = signal<Client[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly clients = this._clients.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly activeClients = computed(() =>
    this._clients().filter((client) => client.status === 'Ativo'),
  );

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const items = await firstValueFrom<ClienteApiResponse[]>(
        this.http.get<ClienteApiResponse[]>(`${this.apiUrl}/clientes`),
      );
      this._clients.set(items.map(mapCliente));
    } catch (error) {
      this._clients.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar os clientes.'));
    } finally {
      this._loading.set(false);
    }
  }

  async getOwnCompleteness(): Promise<OwnClientCompleteness> {
    try {
      return await firstValueFrom(this.http.get<OwnClientCompleteness>(`${this.apiUrl}/clientes/me/completude`));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível verificar seu cadastro.'));
    }
  }

  async list(query = ''): Promise<Client[]> {
    await this.load();
    const term = query.trim().toLowerCase();
    return this._clients().filter((client) => client.name.toLowerCase().includes(term));
  }

  async getById(id: number): Promise<Client | undefined> {
    try {
      const item = await firstValueFrom<ClienteApiResponse>(
        this.http.get<ClienteApiResponse>(`${this.apiUrl}/clientes/${id}`),
      );
      const client = mapCliente(item);
      this._clients.update((list) =>
        list.some((c) => c.id === id)
          ? list.map((c) => (c.id === id ? client : c))
          : [...list, client],
      );
      return client;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível carregar o cliente.'));
    }
  }

  findByName(name: string): Client | undefined {
    return this._clients().find((client) => client.name.toLowerCase().includes(name.toLowerCase()));
  }

  async add(input: ClientInput): Promise<Client> {
    try {
      const item = await firstValueFrom<ClienteApiResponse>(
        this.http.post<ClienteApiResponse>(`${this.apiUrl}/clientes`, {
          name: input.name,
          email: input.email ?? '',
          password: 'senha-temporaria-123',
          cliente: {
            tipo_pessoa: input.type,
            cpf: input.type === 'PF' ? input.document : undefined,
            cnpj: input.type === 'PJ' ? input.document : undefined,
            endereco: {
              logradouro: '',
              numero: '',
              bairro: '',
              cidade: '',
              state: '',
              cep: '',
              pais: 'Brasil',
            },
          },
        }),
      );
      const client = mapCliente(item);
      this._clients.update((list) => [...list, client]);
      return client;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cadastrar o cliente.'));
    }
  }

  async update(id: number, input: Partial<ClientInput>): Promise<void> {
    const clienteDto: { tipo_pessoa?: ClientType; cpf?: string; cnpj?: string } = {};
    if (input.type) clienteDto.tipo_pessoa = input.type;
    if (input.type === 'PF' && input.document) clienteDto.cpf = input.document;
    if (input.type === 'PJ' && input.document) clienteDto.cnpj = input.document;

    try {
      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/clientes/${id}`, clienteDto),
      );
      this._clients.update((clients) =>
        clients.map((client) =>
          client.id === id
            ? {
                ...client,
                ...(input.type ? { type: input.type } : {}),
                ...(input.document ? { document: input.document } : {}),
              }
            : client,
        ),
      );
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar o cliente.'));
    }
  }

  async toggleStatus(id: number): Promise<Client | undefined> {
    try {
      const item = await firstValueFrom<ClienteApiResponse>(
        this.http.patch<ClienteApiResponse>(`${this.apiUrl}/clientes/${id}`, {}),
      );
      const client = mapCliente(item);
      this._clients.update((clients) =>
        clients.map((c) => (c.id === id ? client : c)),
      );
      return client;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível alterar o status do cliente.'));
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await firstValueFrom<void>(this.http.delete<void>(`${this.apiUrl}/clientes/${id}`));
      this._clients.update((clients) => clients.filter((c) => c.id !== id));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível desativar o cliente.'));
    }
  }
}
