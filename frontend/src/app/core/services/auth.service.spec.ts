import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReservationService } from './reservation.service';
import { AuthService } from './auth.service';
import { ApiSessionStore } from './api-session.store';
import { environment } from '../../../environments/environment';

const user = { id: 3, name: 'Ana', email: 'ana@example.test', active: true, type: 'cliente' as const, client: null };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpClient;
  let testing: HttpTestingController;
  let reservationService: { renameMine: (name: string) => Promise<void> };

  beforeEach(() => {
    reservationService = { renameMine: async () => undefined };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ApiSessionStore,
        { provide: ReservationService, useValue: reservationService }],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    testing = TestBed.inject(HttpTestingController);
  });
  afterEach(() => testing.verify());

  it('autentica e define papel pelo usuário da API, ignorando papel escolhido na tela', async () => {
    const login = auth.login('ana@example.test', 'senha-segura', 'admin');
    const request = testing.expectOne(`${environment.apiUrl}/autenticacao/login`);
    expect(request.request.body).toEqual({ email: 'ana@example.test', password: 'senha-segura' });
    request.flush({ access_token: 'jwt', expires_in: 'PT1H', token_type: 'Bearer', user });
    await login;
    expect(auth.role()).toBe('client');
    expect(auth.profile().name).toBe('Ana');
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('propaga erro de credenciais inválidas sem criar sessão', async () => {
    const login = auth.login('ana@example.test', 'wrong');
    testing.expectOne(`${environment.apiUrl}/autenticacao/login`).flush(
      { message: 'email ou senha invalidos' }, { status: 401, statusText: 'Unauthorized' },
    );
    await expect(login).rejects.toThrow('E-mail ou senha inválidos, ou sessão expirada.');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('recupera sessão consultando /me e limpa sessão quando o token é inválido', async () => {
    sessionStorage.setItem('locamais.access_token', 'saved-token');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ApiSessionStore,
        { provide: ReservationService, useValue: reservationService }],
    });
    auth = TestBed.inject(AuthService);
    testing = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(ApiSessionStore);
    const restored = auth.restoreSession();
    const recoveredUser = { ...user, foto: '/uploads/usuarios/persistida.webp' };
    testing.expectOne(`${environment.apiUrl}/autenticacao/me`).flush(recoveredUser);
    await expect(restored).resolves.toBe(true);
    expect(session.user()?.email).toBe(user.email);
    expect(auth.profile().foto).toBe('/uploads/usuarios/persistida.webp');
    sessionStorage.removeItem('locamais.access_token');
  });

  it('logout apaga token e usuário', () => {
    TestBed.inject(ApiSessionStore).setSession('jwt', user);
    auth.logout();
    expect(TestBed.inject(ApiSessionStore).token()).toBeNull();
    expect(TestBed.inject(ApiSessionStore).user()).toBeNull();
  });

  it('envia cadastro PF com documento e endereço normalizados sem campos extras e inicia sessão', async () => {
    const registration = auth.register({
      name: 'Ana Silva', type: 'PF', email: 'ana@example.test', password: 'senha-segura',
      cpf: '529.982.247-25', birthDate: '1990-05-12',
      address: { street: 'Rua A', number: '10', complement: 'Apto 2', district: 'Centro', city: 'Niterói', state: 'rj', zipCode: '24.000-000' },
    });
    const request = testing.expectOne(`${environment.apiUrl}/autenticacao/register`);
    expect(request.request.body).toEqual({
      name: 'Ana Silva', email: 'ana@example.test', password: 'senha-segura',
      cliente: {
        tipo_pessoa: 'PF', cpf: '52998224725', data_nascimento: '1990-05-12',
        endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Niterói', uf: 'RJ', cep: '24000000', complemento: 'Apto 2' },
      },
    });
    request.flush({ access_token: 'registered-token', expires_in: 'PT1H', token_type: 'Bearer', user });
    await registration;
    expect(auth.isLoggedIn()).toBe(true);
    expect(TestBed.inject(ApiSessionStore).token()).toBe('registered-token');
  });

  it('envia cadastro PJ com CNPJ e razão social sem campos PF ou de usuário extras', async () => {
    const registration = auth.register({
      name: 'Maria Responsável', type: 'PJ', email: 'empresa@example.test', password: 'senha-segura',
      cnpj: '11.222.333/0001-81', companyName: 'Empresa Exemplo Ltda',
      address: { street: 'Avenida B', number: '20', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ', zipCode: '20000-000' },
    });
    const request = testing.expectOne(`${environment.apiUrl}/autenticacao/register`);
    expect(request.request.body).toEqual({
      name: 'Maria Responsável', email: 'empresa@example.test', password: 'senha-segura',
      cliente: {
        tipo_pessoa: 'PJ', cnpj: '11222333000181', razao_social: 'Empresa Exemplo Ltda',
        endereco: { logradouro: 'Avenida B', numero: '20', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '20000000' },
      },
    });
    request.flush({ access_token: 'pj-token', expires_in: 'PT1H', token_type: 'Bearer', user: { ...user, type: 'cliente' } });
    await registration;
  });

  it('traduz conflito de e-mail retornado pelo cadastro', async () => {
    const registration = auth.register({
      name: 'Ana', type: 'PF', email: 'ana@example.test', password: 'senha-segura',
      cpf: '52998224725', birthDate: '1990-05-12',
      address: { street: 'Rua A', number: '10', district: 'Centro', city: 'Niterói', state: 'RJ', zipCode: '24000000' },
    });
    testing.expectOne(`${environment.apiUrl}/autenticacao/register`).flush(
      { message: 'ja existe um usuario com este email' }, { status: 409, statusText: 'Conflict' },
    );
    await expect(registration).rejects.toThrow('Este e-mail já está cadastrado.');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('solicita recuperação usando endpoint público e normaliza resposta sem autenticar', async () => {
    const requestRecovery = auth.requestPasswordRecovery(' Ana@Example.Test ');
    const request = testing.expectOne(`${environment.apiUrl}/autenticacao/recuperar-senha`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ana@example.test' });
    request.flush({ message: 'Se existir uma conta vinculada a esse e-mail, você receberá uma mensagem com as instruções para redefinir sua senha.' });
    await expect(requestRecovery).resolves.toBeUndefined();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('mantém estado de carregamento durante a solicitação de recuperação', async () => {
    const recovery = auth.requestPasswordRecovery('ana@example.test');
    expect(auth.loading()).toBe(true);
    testing.expectOne(`${environment.apiUrl}/autenticacao/recuperar-senha`).flush({ message: 'accepted' });
    await recovery;
    expect(auth.loading()).toBe(false);
  });

  it('redefine senha pelo token sem iniciar sessão', async () => {
    const reset = auth.resetPassword('recovery-token', 'NovaSenha1!');
    const request = testing.expectOne(`${environment.apiUrl}/autenticacao/redefinir-senha`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: 'recovery-token', novaSenha: 'NovaSenha1!' });
    request.flush({ message: 'Senha alterada com sucesso.' });
    await expect(reset).resolves.toBeUndefined();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('envia multipart da foto e atualiza usuário e perfil compartilhados', async () => {
    TestBed.inject(ApiSessionStore).setSession('jwt', user);
    const file = new File(['image'], 'profile.png', { type: 'image/png' });
    const upload = auth.uploadProfilePhoto(file);
    const request = testing.expectOne(`${environment.apiUrl}/usuarios/me/foto`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('foto')).toMatchObject({ name: 'profile.png', type: 'image/png' });
    request.flush({ message: 'Foto de perfil atualizada com sucesso', foto: '/uploads/usuarios/a.webp' });
    await upload;
    expect(TestBed.inject(ApiSessionStore).user()?.foto).toBe('/uploads/usuarios/a.webp');
    expect(auth.profile().foto).toBe('/uploads/usuarios/a.webp');
  });

  it('remove foto e atualiza o usuário compartilhado para null', async () => {
    TestBed.inject(ApiSessionStore).setSession('jwt', { ...user, foto: '/uploads/usuarios/a.webp' });
    const remove = auth.removeProfilePhoto();
    const request = testing.expectOne(`${environment.apiUrl}/usuarios/me/foto`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'Foto de perfil removida com sucesso', foto: null });
    await remove;
    expect(TestBed.inject(ApiSessionStore).user()?.foto).toBeNull();
    expect(auth.profile().foto).toBeNull();
  });
});
