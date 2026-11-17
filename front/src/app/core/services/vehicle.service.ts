import { Injectable, computed, signal } from '@angular/core';
import { seedVehicles } from '../data';
import { Revision, Vehicle, VehicleFilters, VehicleStatus } from '../models';

export interface NewVehicleInput {
  name: string;
  version: string;
  category: Vehicle['category'];
  transmission: Vehicle['transmission'];
  pricePerDay: number;
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly _vehicles = signal<Vehicle[]>(seedVehicles());

  readonly vehicles = this._vehicles.asReadonly();
  readonly availableCount = computed(() => this._vehicles().filter((v) => v.status === 'Disponível').length);
  readonly rentedCount = computed(() => this._vehicles().filter((v) => v.status === 'Alugado').length);
  readonly maintenanceCount = computed(() => this._vehicles().filter((v) => v.status === 'Em manutenção').length);

  async list(filters?: VehicleFilters): Promise<Vehicle[]> {
    if (!filters) {
      return [...this._vehicles()];
    }
    const query = filters.query.trim().toLowerCase();
    return this._vehicles().filter((vehicle) => {
      const matchesQuery = vehicle.name.toLowerCase().includes(query);
      const matchesCategory = filters.category === 'Todas' || vehicle.category === filters.category;
      const matchesTransmission = filters.transmission === 'Todas' || vehicle.transmission === filters.transmission;
      const matchesPrice =
        filters.price === 'Todos' ||
        (filters.price === 'Até R$ 100' && vehicle.pricePerDay <= 100) ||
        (filters.price === 'R$ 100–200' && vehicle.pricePerDay > 100 && vehicle.pricePerDay <= 200) ||
        (filters.price === 'Acima de R$ 200' && vehicle.pricePerDay > 200);
      return matchesQuery && matchesCategory && matchesTransmission && matchesPrice;
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
    this._vehicles.update((vehicles) => vehicles.map((vehicle) => (vehicle.id === id ? { ...vehicle, status } : vehicle)));
  }

  async add(input: NewVehicleInput): Promise<Vehicle> {
    const vehicles = this._vehicles();
    const vehicle: Vehicle = {
      id: vehicles.length ? Math.max(...vehicles.map((v) => v.id)) + 1 : 0,
      name: input.name,
      version: input.version || '1.0',
      pricePerDay: input.pricePerDay || 100,
      status: 'Disponível',
      color: '#4a6fa5',
      category: input.category,
      transmission: input.transmission,
      revisions: [],
      favorite: false,
    };
    this._vehicles.update((list) => [...list, vehicle]);
    return vehicle;
  }

  async addRevision(id: number, revision: Revision): Promise<void> {
    this._vehicles.update((vehicles) =>
      vehicles.map((vehicle) => (vehicle.id === id ? { ...vehicle, revisions: [revision, ...vehicle.revisions] } : vehicle)),
    );
  }
}
