import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { defaultProfile } from '../data';
import { AutenticacaoApiResponse, ClientType, UserProfile, UserRole, UsuarioApi } from '../models';
import { ApiErrorService } from './api-error.service';
import { ApiSessionStore } from './api-session.store';
import { SKIP_AUTH } from './api.interceptor';
import { ReservationService } from './reservation.service';
import { environment } from '../../../environments/environment';
import { normalizeDocument } from '../utils/document.validation';

export interface RegisterInput {
  name: string; type: ClientType; email: string; password: string;
  cpf?: string; cnpj?: string; birthDate?: string; companyName?: string;
  address: { street: string; number: string; complement?: string; district: string; city: string; state: string; zipCode: string };
}

export interface ProfilePhotoResponse {
  message: string;
  foto: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(ApiSessionStore);
  private readonly errors = inject(ApiErrorService);
  private readonly reservations = inject(ReservationService);
  private readonly _profileOverride = signal<Partial<UserProfile>>({});
  private readonly _profile = computed(() => ({ ...this.profileFromUser(this.session.user()), ...this._profileOverride() }));
  readonly role = computed<UserRole | null>(() => {
    const type = this.session.user()?.type;
    return type === 'cliente' ? 'client' : type === 'funcionario' ? 'funcionario' : type === 'admin' ? 'admin' : null;
  });
  readonly profile = this._profile;
  readonly isLoggedIn = computed(() => this.session.isAuthenticated());
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isFuncionario = computed(() => this.role() === 'funcionario');
  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();
  private recovery?: Promise<boolean>;

  home(): string { return this.role() === 'client' ? '/client/veiculos' : '/admin/painel'; }

  async login(identifier: string, password: string, selectedRole?: UserRole): Promise<void> {
    const email = identifier.trim();
    if (!email || !password) throw new Error('Informe e-mail e senha');
    this._loading.set(true);
    try {
      const response = await firstValueFrom(this.http.post<AutenticacaoApiResponse>(
        `${this.apiUrl}/autenticacao/login`, { email, password }, { context: new HttpContext().set(SKIP_AUTH, true) },
      ));
      const actualRole = response.user.type === 'cliente' ? 'client' : response.user.type;
      if (selectedRole === 'client' && actualRole !== 'client') {
        throw new Error('Esta conta é de funcionário. Selecione o acesso de funcionário.');
      }
      if (selectedRole === 'admin' && actualRole !== 'admin' && actualRole !== 'funcionario') {
        throw new Error('Esta conta é de cliente. Selecione o acesso de cliente.');
      }
      this.session.setSession(response.access_token, response.user);
      this._profileOverride.set({});
      await this.reservations.renameMine(response.user.name);
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível entrar')); }
    finally { this._loading.set(false); }
  }

  async restoreSession(): Promise<boolean> {
    if (this.session.initialized()) return this.session.isAuthenticated();
    if (!this.session.token()) { this.session.markInitialized(); return false; }
    if (!this.recovery) {
      this.recovery = firstValueFrom(this.http.get<UsuarioApi>(`${this.apiUrl}/autenticacao/me`))
        .then((user) => { this.session.setUser(user); return true; })
        .catch(() => { this.session.clear(); return false; })
        .finally(() => { this.recovery = undefined; });
    }
    return this.recovery;
  }

  async register(input: RegisterInput): Promise<void> {
    this._loading.set(true);
    const cliente: Record<string, unknown> = {
      tipo_pessoa: input.type,
      endereco: {
        logradouro: input.address.street.trim(), numero: input.address.number.trim(),
        bairro: input.address.district.trim(), cidade: input.address.city.trim(),
        uf: input.address.state.trim().toUpperCase(), cep: normalizeDocument(input.address.zipCode),
      },
    };
    if (input.address.complement?.trim()) cliente['endereco'] = { ...cliente['endereco'] as object, complemento: input.address.complement.trim() };
    if (input.type === 'PF') {
      cliente['cpf'] = input.cpf ? normalizeDocument(input.cpf) : undefined;
      cliente['data_nascimento'] = input.birthDate;
    } else {
      cliente['cnpj'] = input.cnpj ? normalizeDocument(input.cnpj) : undefined;
      cliente['razao_social'] = input.companyName?.trim();
    }
    try {
      const response = await firstValueFrom(this.http.post<AutenticacaoApiResponse>(
        `${this.apiUrl}/autenticacao/register`,
        { name: input.name.trim(), email: input.email.trim(), password: input.password, cliente },
        { context: new HttpContext().set(SKIP_AUTH, true) },
      ));
      this.session.setSession(response.access_token, response.user);
      this._profileOverride.set({});
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível concluir o cadastro')); }
    finally { this._loading.set(false); }
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    this._loading.set(true);
    try {
      await firstValueFrom(this.http.post<{ message: string }>(
        `${this.apiUrl}/autenticacao/recuperar-senha`,
        { email: email.trim().toLowerCase() },
        { context: new HttpContext().set(SKIP_AUTH, true) },
      ));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível solicitar a recuperação de senha'));
    } finally {
      this._loading.set(false);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    this._loading.set(true);
    try {
      await firstValueFrom(this.http.post<{ message: string }>(
        `${this.apiUrl}/autenticacao/redefinir-senha`,
        { token, novaSenha: newPassword },
        { context: new HttpContext().set(SKIP_AUTH, true) },
      ));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível redefinir a senha'));
    } finally {
      this._loading.set(false);
    }
  }

  async uploadProfilePhoto(file: File): Promise<ProfilePhotoResponse> {
    this._loading.set(true);
    const body = new FormData();
    body.append('foto', file, file.name);
    try {
      const result = await firstValueFrom(this.http.post<ProfilePhotoResponse>(
        `${this.apiUrl}/usuarios/me/foto`, body,
      ));
      this.updateSessionPhoto(result.foto);
      return result;
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível enviar a foto de perfil.'));
    } finally {
      this._loading.set(false);
    }
  }

  async removeProfilePhoto(): Promise<ProfilePhotoResponse> {
    this._loading.set(true);
    try {
      const result = await firstValueFrom(this.http.delete<ProfilePhotoResponse>(
        `${this.apiUrl}/usuarios/me/foto`,
      ));
      this.updateSessionPhoto(result.foto);
      return result;
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível remover a foto de perfil.'));
    } finally {
      this._loading.set(false);
    }
  }

  private updateSessionPhoto(foto: string | null): void {
    const user = this.session.user();
    if (user) this.session.setUser({ ...user, foto });
    this._profileOverride.update((current) => ({ ...current, foto }));
  }

  async updateProfile(partial: Partial<UserProfile>): Promise<void> {
    const user = this.session.user();
    if (!user?.client) throw new Error('Cadastro de cliente não encontrado.');
    const payload: Record<string, unknown> = {};
    if (partial.name !== undefined) payload['name'] = partial.name;
    if (partial.phone !== undefined) payload['telefone'] = partial.phone;
    if (partial.cnh !== undefined) payload['cnh_numero'] = partial.cnh.replace(/\D/g, '');
    if (partial.cnhValidity !== undefined) payload['cnh_validade'] = partial.cnhValidity;
    const addressKeys: Array<keyof UserProfile> = ['street', 'addressNumber', 'addressDistrict', 'addressComplement', 'city', 'addressState', 'addressZipCode'];
    if (addressKeys.some((key) => partial[key] !== undefined)) {
      const existing = user.client.address;
      const streetParts = partial.street?.split(',') ?? [];
      payload['endereco'] = {
        logradouro: partial.street?.trim() || existing?.logradouro || '',
        numero: partial.addressNumber?.trim() || existing?.numero || streetParts.slice(1).join(',').trim() || '',
        complemento: partial.addressComplement ?? existing?.complemento ?? undefined,
        bairro: partial.addressDistrict?.trim() || existing?.bairro || '',
        cidade: partial.city?.trim() || existing?.cidade || '',
        uf: partial.addressState?.trim().toUpperCase() || existing?.uf || '',
        cep: partial.addressZipCode?.replace(/\D/g, '') || existing?.cep || '',
      };
    }
    if (Object.keys(payload).length === 0) {
      this._profileOverride.update((current) => ({ ...current, ...partial }));
      return;
    }
    try {
      await firstValueFrom(this.http.patch(`${this.apiUrl}/clientes/me`, payload));
      const refreshed = await firstValueFrom(this.http.get<UsuarioApi>(`${this.apiUrl}/autenticacao/me`));
      this.session.setUser(refreshed);
      this._profileOverride.set({});
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível salvar as alterações do perfil.'));
    }
  }

  logout(): void { this.session.clear(); this._profileOverride.set({}); }

  private get apiUrl(): string { return environment.apiUrl.replace(/\/+$/, ''); }
  private profileFromUser(user: UsuarioApi | null): UserProfile {
    const profile = defaultProfile();
    if (!user) return profile;
    const address = user.client?.address;
    return {
      ...profile,
      name: user.name,
      email: user.email,
      foto: user.foto ?? null,
      phone: user.client?.telefone ?? '',
      cnh: user.client?.cnh_numero ?? '',
      cnhValidity: user.client?.cnh_validade ?? '',
      street: address?.logradouro ?? '',
      addressNumber: address?.numero ?? '',
      addressComplement: address?.complemento ?? '',
      addressDistrict: address?.bairro ?? '',
      city: address?.cidade ?? '',
      addressState: address?.uf ?? '',
      addressZipCode: address?.cep ?? '',
    };
  }
}
