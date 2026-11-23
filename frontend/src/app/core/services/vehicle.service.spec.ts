import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { VehicleService } from './vehicle.service';

describe('VehicleService API reads', () => {
  let service: VehicleService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VehicleService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('carrega lista vazia da API e limpa estado de carregamento', async () => {
    const load = service.load();
    expect(service.loading()).toBe(true);
    httpTesting.expectOne(`${environment.apiUrl}/carros`).flush([]);
    await load;
    expect(service.vehicles()).toEqual([]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('carrega veículos reais e mantém filtros locais sobre os dados carregados', async () => {
    const load = service.load();
    httpTesting.expectOne(`${environment.apiUrl}/carros`).flush([{
      id: 17,
      placa: 'ABC1D23',
      modelo: 'HB20',
      marca: 'Hyundai',
      categoria: 'Hatch',
      ano: 2024,
      status: 'disponivel',
      valorDiaria: 125.5,
      quilometragem: 12000,
      foto: null,
      created_at: '2026-11-17T10:00:00.000Z',
      updated_at: '2026-11-17T10:00:00.000Z',
    }]);
    await load;
    expect(service.vehicles()).toHaveLength(1);
    expect(service.vehicles()[0].name).toBe('Hyundai HB20 2024');
    expect(await service.list({
      query: 'hyundai', category: 'Todas', price: 'R$ 100–200', transmission: 'Todas',
    })).toEqual(service.vehicles());
  });

  it('carrega um veículo por ID inteiro', async () => {
    const load = service.loadOne(17);
    httpTesting.expectOne(`${environment.apiUrl}/carros/17`).flush({
      id: 17,
      placa: 'ABC1D23',
      modelo: 'HB20',
      marca: 'Hyundai',
      categoria: 'Hatch',
      ano: 2024,
      status: 'alugado',
      valorDiaria: 125.5,
      quilometragem: 12000,
      foto: null,
      created_at: '',
      updated_at: '',
    });
    expect((await load)?.status).toBe('Alugado');
    expect(service.getById(17)?.id).toBe(17);
  });

  it('mapeia o veículo relacionado como favorito ao carregar a resposta persistida da API', async () => {
    const loadFavorites = service.loadFavorites();
    httpTesting.expectOne(`${environment.apiUrl}/favoritos`).flush([{
      id: 4,
      client_id: 8,
      car_id: 17,
      car: {
        id: 17,
        placa: 'ABC1D23',
        modelo: 'HB20',
        marca: 'Hyundai',
        categoria: 'Hatch',
        ano: 2024,
        status: 'disponivel',
        valorDiaria: '125.50',
        quilometragem: 12000,
        foto: '/uploads/carros/hb20.jpg',
        created_at: '',
        updated_at: '',
      },
    }]);

    await loadFavorites;
    expect(service.favoriteVehicles()).toHaveLength(1);
    expect(service.favoriteVehicles()[0]).toMatchObject({
      id: 17,
      name: 'Hyundai HB20 2024',
      photo: '/uploads/carros/hb20.jpg',
      favorite: true,
    });
  });

  it('registra falha de comunicação sem transformar falha em lista vazia válida', async () => {
    const load = service.load();
    httpTesting.expectOne(`${environment.apiUrl}/carros`).flush(
      { message: 'indisponível' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await load;
    expect(service.error()).toBe('O serviço está indisponível no momento. Tente novamente.');
    expect(service.vehicles()).toEqual([]);
  });

  it('cria veículo com o contrato exato aceito por CreateCarroDto e incorpora resposta à listagem', async () => {
    const payload = {
      placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoriaId: 4,
      ano: 2024, valorDiaria: 125.5, status: 'disponivel' as const,
    };
    const create = service.create(payload);
    const request = httpTesting.expectOne(`${environment.apiUrl}/carros`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ placa: payload.placa, marca: payload.marca, modelo: payload.modelo, ano: payload.ano, valorDiaria: payload.valorDiaria, status: payload.status, categoria_id: 4 });
    request.flush({
      id: 21, placa: payload.placa, marca: payload.marca, modelo: payload.modelo, categoria: 'Economico', categoria_id: 4, ano: payload.ano, status: 'disponivel', valorDiaria: '125.50', quilometragem: 0,
      foto: null, created_at: '', updated_at: '',
    });

    const created = await create;
    expect(created.id).toBe(21);
    expect(service.getById(21)?.make).toBe('Hyundai');
  });

  it('envia somente campos parciais em PATCH e atualiza o veículo compartilhado', async () => {
    const load = service.load();
    httpTesting.expectOne(`${environment.apiUrl}/carros`).flush([{
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Economico',
      ano: 2024, status: 'disponivel', valorDiaria: 125, quilometragem: 0, foto: null,
      created_at: '', updated_at: '',
    }]);
    await load;

    const update = service.update(17, { valorDiaria: 150 });
    const request = httpTesting.expectOne(`${environment.apiUrl}/carros/17`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ valorDiaria: 150 });
    request.flush({
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Economico',
      ano: 2024, status: 'disponivel', valorDiaria: 150, quilometragem: 0, foto: null,
      created_at: '', updated_at: '',
    });
    await update;
    expect(service.getById(17)?.pricePerDay).toBe(150);
  });

  it('envia DELETE real e retira da listagem somente após sucesso', async () => {
    const load = service.load();
    httpTesting.expectOne(`${environment.apiUrl}/carros`).flush([{
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Hatch',
      ano: 2024, status: 'disponivel', valorDiaria: 125, quilometragem: 0, foto: null,
      created_at: '', updated_at: '',
    }]);
    await load;

    const remove = service.remove(17);
    const request = httpTesting.expectOne(`${environment.apiUrl}/carros/17`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await remove;
    expect(service.getById(17)).toBeUndefined();
  });

  it('envia a foto em multipart, atualiza o caminho e remove a foto pelo endpoint dedicado', async () => {
    const file = new File(['png bytes'], 'car.png', { type: 'image/png' });
    const upload = service.uploadPhoto(17, file);
    const post = httpTesting.expectOne(`${environment.apiUrl}/carros/17/foto`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toBeInstanceOf(FormData);
    expect((post.request.body as FormData).get('foto')).toMatchObject({ name: 'car.png', type: 'image/png' });
    post.flush({
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Hatch',
      ano: 2024, status: 'disponivel', valorDiaria: 125, quilometragem: 0,
      foto: '/uploads/carros/uuid.png', created_at: '', updated_at: '',
    });
    await upload;
    expect(service.getById(17)?.photo).toBe('/uploads/carros/uuid.png');

    const removal = service.removePhoto(17);
    const del = httpTesting.expectOne(`${environment.apiUrl}/carros/17/foto`);
    expect(del.request.method).toBe('DELETE');
    del.flush({
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Hatch',
      ano: 2024, status: 'disponivel', valorDiaria: 125, quilometragem: 0,
      foto: null, created_at: '', updated_at: '',
    });
    await removal;
    expect(service.getById(17)?.photo).toBeNull();
  });

  it('envia status com os valores aceitos pelo enum do backend', async () => {
    const update = service.setStatus(17, 'Em manutenção');
    const request = httpTesting.expectOne(`${environment.apiUrl}/carros/17`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'em manutenção' });
    request.flush({
      id: 17, placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Hatch',
      ano: 2024, status: 'em manutenção', valorDiaria: 125, quilometragem: 0, foto: null,
      created_at: '', updated_at: '',
    });
    await update;
    expect(service.getById(17)?.status).toBe('Em manutenção');
  });
});
