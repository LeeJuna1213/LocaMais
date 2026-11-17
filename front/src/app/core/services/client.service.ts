import { Injectable, computed, signal } from '@angular/core';
import { seedClients } from '../data';
import { Client, ClientType } from '../models';

export interface ClientInput {
  name: string;
  type: ClientType;
  document: string;
  email?: string;
  phone?: string;
}

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly _clients = signal<Client[]>(seedClients());

  readonly clients = this._clients.asReadonly();
  readonly activeClients = computed(() => this._clients().filter((client) => client.status === 'Ativo'));

  async list(query = ''): Promise<Client[]> {
    const term = query.trim().toLowerCase();
    return this._clients().filter((client) => client.name.toLowerCase().includes(term));
  }

  getById(id: number): Client | undefined {
    return this._clients().find((client) => client.id === id);
  }

  findByName(name: string): Client | undefined {
    return this._clients().find((client) => client.name === name);
  }

  async add(input: ClientInput): Promise<Client> {
    const clients = this._clients();
    const client: Client = {
      id: clients.length ? Math.max(...clients.map((c) => c.id)) + 1 : 0,
      name: input.name,
      type: input.type,
      document: input.document,
      status: 'Ativo',
      email: input.email ?? '',
      phone: input.phone ?? '',
    };
    this._clients.update((list) => [...list, client]);
    return client;
  }

  async update(id: number, input: Partial<ClientInput>): Promise<void> {
    this._clients.update((clients) => clients.map((client) => (client.id === id ? { ...client, ...input } : client)));
  }

  async toggleStatus(id: number): Promise<Client | undefined> {
    let updated: Client | undefined;
    this._clients.update((clients) =>
      clients.map((client) => {
        if (client.id !== id) {
          return client;
        }
        updated = { ...client, status: client.status === 'Ativo' ? 'Inativo' : 'Ativo' };
        return updated;
      }),
    );
    return updated;
  }
}
