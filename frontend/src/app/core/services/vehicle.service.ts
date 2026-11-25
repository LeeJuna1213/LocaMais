import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Revision, Vehicle, VehicleFilters, VehicleStatus } from '../models';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';
import { CarroApi, mapCarroApi } from './vehicle-api.mapper';

export interface VehicleWriteInput {
  placa: string;
  modelo: string;
  marca: string;
  categoriaId: number;
  ano: number;
  valorDiaria: number;
  status?: 'disponivel' | 'alugado' | 'em manutenção';
  cambio?: 'Automático' | 'Manual' | null;
  lugares?: number | null;
  descricao?: string | null;
  proximaVistoriaKm?: number | null;
  lojas_ids?: number[];
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly http = inject(HttpClient);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _vehicles = signal<Vehicle[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly vehicles = this._vehicles.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly availableCount = computed(() => this._vehicles().filter((v) => v.status === 'Disponível').length);
  readonly rentedCount = computed(() => this._vehicles().filter((v) => v.status === 'Alugado').length);
  readonly maintenanceCount = computed(() => this._vehicles().filter((v) => v.status === 'Em manutenção').length);

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const cars = await firstValueFrom(this.http.get<CarroApi[]>(`${environment.apiUrl.replace(/\/+$/, '')}/carros`));
       const favorites = new Set(this.favoriteIds());
       this._vehicles.set(cars.map((car) => ({ ...mapCarroApi(car), favorite: favorites.has(car.id) })));
    } catch (error) {
      this._vehicles.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar os veículos.'));
    } finally { this._loading.set(false); }
  }

  async loadOne(id: number): Promise<Vehicle | undefined> {
    try {
      const car = await firstValueFrom(this.http.get<CarroApi>(`${this.apiUrl}/carros/${id}`));
      const vehicle = { ...mapCarroApi(car), favorite: this.favoriteIds().includes(car.id) };
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível carregar o veículo.'));
    }
  }

  async list(filters?: VehicleFilters): Promise<Vehicle[]> {
    if (!filters) {
      return [...this._vehicles()];
    }
    const query = filters.query.trim().toLowerCase();
    return this._vehicles().filter((vehicle) => {
      const matchesQuery = vehicle.name.toLowerCase().includes(query);
      const matchesCategory = filters.category === 'Todas' || vehicle.category === filters.category;
      const matchesTransmission = filters.transmission === 'Todas' || vehicle.transmission === filters.transmission;
      const matchesMake = !filters.make || vehicle.make?.toLocaleLowerCase() === filters.make.toLocaleLowerCase();
      const matchesModel = !filters.model || vehicle.model?.toLocaleLowerCase() === filters.model.toLocaleLowerCase();
      const matchesStatus = !filters.status || filters.status === 'Todos' || vehicle.status === filters.status;
      const matchesPrice =
        (filters.priceMin == null || vehicle.pricePerDay >= filters.priceMin) &&
        (filters.priceMax == null || vehicle.pricePerDay <= filters.priceMax) &&
        (filters.price === 'Todos' ||
        (filters.price === 'Até R$ 100' && vehicle.pricePerDay <= 100) ||
        (filters.price === 'R$ 100–200' && vehicle.pricePerDay > 100 && vehicle.pricePerDay <= 200) ||
        (filters.price === 'Acima de R$ 200' && vehicle.pricePerDay > 200));
      return matchesQuery && matchesCategory && matchesTransmission && matchesPrice && matchesMake && matchesModel && matchesStatus;
    });
  }

  getById(id: number): Vehicle | undefined {
    return this._vehicles().find((vehicle) => vehicle.id === id);
  }

  async toggleFavorite(id: number): Promise<boolean> {
    const current = this.getById(id)?.favorite ?? false;
    const url = `${this.apiUrl}/favoritos/${id}`;
    try {
      if (current) await firstValueFrom(this.http.delete<void>(url));
      else await firstValueFrom(this.http.post(url, {}));
      this.setFavoriteIds(current ? this.favoriteIds().filter((carId) => carId !== id) : [...this.favoriteIds(), id]);
      return !current;
    } catch (error) { throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar os favoritos.')); }
  }

  private readonly favoriteIds = signal<number[]>([]);

  async loadFavorites(): Promise<void> {
    try {
      const entries = await firstValueFrom<Array<{ car_id: number; car?: CarroApi }>>(this.http.get<Array<{ car_id: number; car?: CarroApi }>>(`${this.apiUrl}/favoritos`));
      const ids = entries.map((entry) => entry.car_id);
      this.setFavoriteIds(ids);
      const missing = entries.map((entry) => entry.car).filter((car): car is CarroApi => !!car);
      for (const car of missing) this.upsert({ ...mapCarroApi(car), favorite: true });
    } catch (error) { throw new Error(this.apiErrors.message(error, 'Não foi possível carregar os favoritos.')); }
  }

  favoriteVehicles(): Vehicle[] { return this._vehicles().filter((vehicle) => vehicle.favorite); }

  private setFavoriteIds(ids: number[]): void {
    this.favoriteIds.set([...new Set(ids)]);
    const favorites = new Set(ids);
    this._vehicles.update((vehicles) => vehicles.map((vehicle) => ({ ...vehicle, favorite: favorites.has(vehicle.id) })));
  }

  async setStatus(id: number, status: VehicleStatus): Promise<void> {
    const wireStatus: VehicleWriteInput['status'] = status === 'Disponível'
      ? 'disponivel' : status === 'Alugado' ? 'alugado' : 'em manutenção';
    await this.update(id, { status: wireStatus });
  }

  async create(input: VehicleWriteInput): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.post<CarroApi>(`${this.apiUrl}/carros`, this.toApiInput(input)));
      const vehicle = { ...mapCarroApi(carro), favorite: this.favoriteIds().includes(carro.id) };
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cadastrar o veículo.'));
    }
  }

  async update(id: number, changes: Partial<VehicleWriteInput>): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.patch<CarroApi>(`${this.apiUrl}/carros/${id}`, this.toApiInput(changes)));
      const vehicle = { ...mapCarroApi(carro), favorite: this.favoriteIds().includes(carro.id) };
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar o veículo.'));
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/carros/${id}`));
      this._vehicles.update((vehicles) => vehicles.filter((vehicle) => vehicle.id !== id));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível excluir o veículo.'));
    }
  }

  async uploadPhoto(id: number, file: File): Promise<Vehicle> {
    const body = new FormData();
    body.append('foto', file, file.name);
    try {
      const carro = await firstValueFrom(this.http.post<CarroApi>(`${this.apiUrl}/carros/${id}/foto`, body));
      const vehicle = { ...mapCarroApi(carro), favorite: this.favoriteIds().includes(carro.id) };
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível enviar a foto do veículo.'));
    }
  }

  async removePhoto(id: number): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.delete<CarroApi>(`${this.apiUrl}/carros/${id}/foto`));
      const vehicle = { ...mapCarroApi(carro), favorite: this.favoriteIds().includes(carro.id) };
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível remover a foto do veículo.'));
    }
  }

  async addRevision(id: number, revision: Revision): Promise<void> {
    this._vehicles.update((vehicles) =>
      vehicles.map((vehicle) => (vehicle.id === id ? { ...vehicle, revisions: [revision, ...vehicle.revisions] } : vehicle)),
    );
  }

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  private toApiInput(input: Partial<VehicleWriteInput>): Record<string, unknown> {
    const { categoriaId, ...fields } = input;
    return categoriaId === undefined ? fields : { ...fields, categoria_id: categoriaId };
  }

  private upsert(vehicle: Vehicle): void {
    this._vehicles.update((items) => items.some((item) => item.id === vehicle.id)
      ? items.map((item) => item.id === vehicle.id ? { ...item, ...vehicle, favorite: this.favoriteIds().includes(vehicle.id) } : item)
      : [...items, { ...vehicle, favorite: this.favoriteIds().includes(vehicle.id) }]);
  }
}
