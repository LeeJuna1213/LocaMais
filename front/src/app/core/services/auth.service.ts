import { Injectable, computed, inject, signal } from '@angular/core';
import { defaultProfile } from '../data';
import { Account, ClientType, UserProfile, UserRole } from '../models';
import { deriveNameFromEmail } from '../utils';
import { ClientService } from './client.service';
import { ReservationService } from './reservation.service';

export interface RegisterInput {
  name: string;
  type: ClientType;
  email: string;
  phone: string;
  document: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly clientService = inject(ClientService);
  private readonly reservationService = inject(ReservationService);

  private readonly _role = signal<UserRole | null>(null);
  private readonly _profile = signal<UserProfile>(defaultProfile());
  private readonly accounts: Account[] = [];

  readonly role = this._role.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly isLoggedIn = computed(() => this._role() !== null);
  readonly isAdmin = computed(() => this._role() === 'admin');

  home(): string {
    return this._role() === 'admin' ? '/admin/painel' : '/client/veiculos';
  }

  async login(identifier: string, password: string, role: UserRole): Promise<void> {
    const email = identifier.trim();
    if (!email || !password) {
      throw new Error('Informe e-mail e senha');
    }

    if (role === 'admin') {
      this._profile.set({ ...defaultProfile(), name: 'Funcionário', email });
      this._role.set('admin');
      return;
    }

    const account = this.accounts.find((item) => item.email === email.toLowerCase());
    if (account && account.password !== password) {
      throw new Error('Senha incorreta');
    }

    const name = account ? account.name : deriveNameFromEmail(email);
    this._profile.set({
      ...defaultProfile(),
      name: name || email,
      email,
      phone: account?.phone ?? '',
    });
    this._role.set('client');
    await this.reservationService.renameMine(this._profile().name);
  }

  async register(input: RegisterInput): Promise<void> {
    if (!input.name || !input.email || !input.password) {
      throw new Error('Preencha nome, e-mail e senha');
    }

    await this.clientService.add({
      name: input.name,
      type: input.type,
      document: input.document,
      email: input.email.trim(),
      phone: input.phone,
    });

    this.accounts.push({
      email: input.email.trim().toLowerCase(),
      name: input.name,
      type: input.type,
      password: input.password,
      phone: input.phone,
    });

    this._profile.set({
      ...defaultProfile(),
      name: input.name,
      email: input.email.trim(),
      phone: input.phone,
    });
    this._role.set('client');
    await this.reservationService.renameMine(input.name);
  }

  async updateProfile(partial: Partial<UserProfile>): Promise<void> {
    const previousName = this._profile().name;
    this._profile.update((profile) => ({ ...profile, ...partial }));
    if (partial.name && partial.name !== previousName) {
      await this.reservationService.renameMine(partial.name);
    }
  }

  logout(): void {
    this._role.set(null);
    this._profile.set(defaultProfile());
  }
}
