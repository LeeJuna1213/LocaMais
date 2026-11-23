import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CategoryService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads categories from the API and makes them selectable', async () => {
    const load = service.load();
    http.expectOne(`${environment.apiUrl}/categorias`).flush([{ id: 3, nome: 'Sedan' }]);
    await load;
    expect(service.categories()).toEqual([{ id: 3, nome: 'Sedan' }]);
    expect(service.error()).toBeNull();
  });

  it('persists a new category and immediately adds it to the shared category list', async () => {
    const create = service.create('Minivan');
    const request = http.expectOne(`${environment.apiUrl}/categorias`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ nome: 'Minivan' });
    request.flush({ id: 4, nome: 'Minivan' });
    await create;
    expect(service.categories()).toContainEqual({ id: 4, nome: 'Minivan' });
  });
});
