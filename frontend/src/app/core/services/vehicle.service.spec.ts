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
});
