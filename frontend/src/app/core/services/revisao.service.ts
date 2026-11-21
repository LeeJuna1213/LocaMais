import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';
import { RevisaoApi, CreateRevisaoInput, RevisionCostByVehicleApi, UpdateRevisaoInput } from '../models';

export interface RevisionCostsReport {
  porVeiculo: RevisionCostByVehicleApi[];
  totalGeral: number;
  quantidadeGeral: number;
}

@Injectable({ providedIn: 'root' })
export class RevisaoService {
  private readonly http = inject(HttpClient);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _revisoes = signal<RevisaoApi[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _costs = signal<RevisionCostsReport>({ porVeiculo: [], totalGeral: 0, quantidadeGeral: 0 });

  readonly revisoes = this._revisoes.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly costs = this._costs.asReadonly();

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  async loadByCarro(carroId: number): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const items = await firstValueFrom<RevisaoApi[]>(
        this.http.get<RevisaoApi[]>(`${this.apiUrl}/revisoes/carro/${carroId}`),
      );
      this._revisoes.set(items);
    } catch (error) {
      this._revisoes.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar as revisões.'));
    } finally {
      this._loading.set(false);
    }
  }

  async create(input: CreateRevisaoInput): Promise<RevisaoApi> {
    try {
      const revisao = await firstValueFrom<RevisaoApi>(
        this.http.post<RevisaoApi>(`${this.apiUrl}/revisoes`, {
          data: input.data,
          descricao: input.descricao,
          km: input.km,
          valor: input.valor,
          carroId: input.carroId,
        }),
      );
      this._revisoes.update((list) => [revisao, ...list]);
      return revisao;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível registrar a revisão.'));
    }
  }

  async update(id: string, input: UpdateRevisaoInput): Promise<RevisaoApi> {
    try {
      const revisao = await firstValueFrom<RevisaoApi>(
        this.http.patch<RevisaoApi>(`${this.apiUrl}/revisoes/${id}`, input),
      );
      this._revisoes.update((list) =>
        list.map((r) => (r.id === id ? revisao : r)),
      );
      return revisao;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar a revisão.'));
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await firstValueFrom<void>(
        this.http.delete<void>(`${this.apiUrl}/revisoes/${id}`),
      );
      this._revisoes.update((list) => list.filter((r) => r.id !== id));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível excluir a revisão.'));
    }
  }

  async loadAll(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const items = await firstValueFrom<RevisaoApi[]>(
        this.http.get<RevisaoApi[]>(`${this.apiUrl}/revisoes`),
      );
      this._revisoes.set(items);
    } catch (error) {
      this._revisoes.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar as revisões.'));
    } finally {
      this._loading.set(false);
    }
  }

  async loadCostsReport(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const report = await firstValueFrom(
        this.http.get<RevisionCostsReport>(`${this.apiUrl}/revisoes/relatorio/custos`),
      );
      this._costs.set(report);
    } catch (error) {
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar os custos das revisões.'));
    } finally {
      this._loading.set(false);
    }
  }
}
