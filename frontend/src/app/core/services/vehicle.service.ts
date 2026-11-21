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
  categoria: string;
  ano: number;
  valorDiaria: number;
  status?: 'disponivel' | 'alugado' | 'em manutenção';
  cambio?: 'Automático' | 'Manual' | null;
  lugares?: number | null;
  descricao?: string | null;
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
      this._vehicles.set(cars.map(mapCarroApi));
    } catch (error) {
      this._vehicles.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar os veículos.'));
    } finally { this._loading.set(false); }
  }

  async loadOne(id: number): Promise<Vehicle | undefined> {
    try {
      const car = await firstValueFrom(this.http.get<CarroApi>(`${this.apiUrl}/carros/${id}`));
      const vehicle = mapCarroApi(car);
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
    let favorite = false;
    this._vehicles.update((vehicles) =>
      vehicles.map((vehicle) => {
        if (vehicle.id !== id) {
          return vehicle;
        }
        favorite = !vehicle.favorite;
        return { ...vehicle, favorite };
      }),
    );
    return favorite;
  }

  async setStatus(id: number, status: VehicleStatus): Promise<void> {
    const wireStatus: VehicleWriteInput['status'] = status === 'Disponível'
      ? 'disponivel' : status === 'Alugado' ? 'alugado' : 'em manutenção';
    await this.update(id, { status: wireStatus });
  }

  async create(input: VehicleWriteInput): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.post<CarroApi>(`${this.apiUrl}/carros`, input));
      const vehicle = mapCarroApi(carro);
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cadastrar o veículo.'));
    }
  }

  async update(id: number, changes: Partial<VehicleWriteInput>): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.patch<CarroApi>(`${this.apiUrl}/carros/${id}`, changes));
      const vehicle = mapCarroApi(carro);
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
      const vehicle = mapCarroApi(carro);
      this.upsert(vehicle);
      return vehicle;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível enviar a foto do veículo.'));
    }
  }

  async removePhoto(id: number): Promise<Vehicle> {
    try {
      const carro = await firstValueFrom(this.http.delete<CarroApi>(`${this.apiUrl}/carros/${id}/foto`));
      const vehicle = mapCarroApi(carro);
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

  private upsert(vehicle: Vehicle): void {
    this._vehicles.update((items) => items.some((item) => item.id === vehicle.id)
      ? items.map((item) => item.id === vehicle.id ? { ...item, ...vehicle } : item)
      : [...items, vehicle]);
  }
}
