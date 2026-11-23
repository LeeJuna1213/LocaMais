import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateVehicleInspectionInput, VehicleInspectionApi, VehicleInspectionCostsReportApi } from '../models';
import { ApiErrorService } from './api-error.service';

@Injectable({ providedIn: 'root' })
export class VehicleInspectionService {
  private readonly http = inject(HttpClient);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _items = signal<VehicleInspectionApi[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private get apiUrl(): string { return environment.apiUrl.replace(/\/+$/, ''); }

  async loadByVehicle(vehicleId: number): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await firstValueFrom(this.http.get<VehicleInspectionApi[]>(`${this.apiUrl}/vistorias/carro/${vehicleId}`)));
    } catch (error) {
      this._items.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar as vistorias.'));
    } finally { this._loading.set(false); }
  }

  async create(input: CreateVehicleInspectionInput): Promise<VehicleInspectionApi> {
    try {
      const result = await firstValueFrom(this.http.post<VehicleInspectionApi>(`${this.apiUrl}/vistorias/veiculo`, input));
      this._items.update((items) => [result, ...items]);
      return result;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível registrar a vistoria.'));
    }
  }

  async loadCosts(query: { de?: string; ate?: string } = {}): Promise<VehicleInspectionCostsReportApi> {
    const params = new URLSearchParams();
    if (query.de) params.set('de', query.de);
    if (query.ate) params.set('ate', query.ate);
    const suffix = params.toString();
    try {
      return await firstValueFrom(this.http.get<VehicleInspectionCostsReportApi>(`${this.apiUrl}/vistorias/relatorio/custos${suffix ? `?${suffix}` : ''}`));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível carregar os custos das vistorias.'));
    }
  }
}
