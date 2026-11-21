import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiSessionStore } from './api-session.store';
import {
  Client,
  PaymentMethod,
  Reservation,
  ReservationStatus,
  Vehicle,
  VehicleStatus,
} from '../models';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';
import { VehicleService } from './vehicle.service';
import { CarroApi, mapCarroApi } from './vehicle-api.mapper';

export interface CreateReservationInput {
  clientId: number;
  vehicleId: number;
  start: string;
  end: string;
  pickupTime?: string;
  returnTime?: string;
}

export type ClientReservationTab = 'Futuras' | 'Em andamento' | 'Histórico';
export type AdminReservationTab = 'Todas' | 'Pendentes' | 'Confirmadas' | 'Em andamento' | 'Concluídas' | 'Canceladas';

const API_STATUS_MAP: Record<string, ReservationStatus> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
};

interface ReservationApiResponse {
  id: string;
  codigo?: string | null;
  dataRetirada: string;
  dataDevolucao: string;
  status: string;
  valorTotal: number;
  valorSubtotal?: number;
  taxaServico?: number;
  client_id: number;
  car_id: number;
  client?: {
    id: number;
    user?: { id: number; name: string; email: string };
    tipo_pessoa: string;
    cpf: string | null;
    cnpj: string | null;
  } | null;
  car?: CarroApi | null;
}

function mapReservation(api: ReservationApiResponse, sessionUserId: number | null): Reservation {
  const client = api.client ?? null;
  const car = api.car ?? null;
  const vehicle = car ? mapCarroApi(car) : undefined;

  return {
    id: api.id,
    publicCode: api.codigo ?? null,
    clientName: client?.user?.name ?? client?.tipo_pessoa ?? '',
    mine: client?.user?.id === sessionUserId,
    clientId: api.client_id,
    vehicleId: api.car_id,
    vehicle,
    start: api.dataRetirada,
    end: api.dataDevolucao,
    status: API_STATUS_MAP[api.status] ?? 'Pendente',
    total: api.valorTotal ?? 0,
    subtotal: api.valorSubtotal ?? api.valorTotal ?? 0,
    serviceFee: api.taxaServico ?? 0,
    payment: 'Pendente',
    paymentMethod: 'PIX' as PaymentMethod,
  };
}

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(ApiSessionStore);
  private readonly vehicleService = inject(VehicleService);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _reservations = signal<Reservation[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly reservations = this._reservations.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly pendingPickups = computed(() =>
    this._reservations().filter((r) => r.status === 'Confirmada').length,
  );
  readonly inProgress = computed(() =>
    this._reservations().filter((r) => r.status === 'Em andamento').length,
  );

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  private get sessionUserId(): number | null {
    return this.session.user()?.id ?? null;
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const items = await firstValueFrom<ReservationApiResponse[]>(
        this.http.get<ReservationApiResponse[]>(`${this.apiUrl}/reservas`),
      );
      const userId = this.sessionUserId;
      this._reservations.set(items.map((item) => mapReservation(item, userId)));
    } catch (error) {
      this._reservations.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar as reservas.'));
    } finally {
      this._loading.set(false);
    }
  }

  async getById(id: string): Promise<Reservation | undefined> {
    try {
      const item = await firstValueFrom<ReservationApiResponse>(
        this.http.get<ReservationApiResponse>(`${this.apiUrl}/reservas/${id}`),
      );
      const reservation = mapReservation(item, this.sessionUserId);
      this._reservations.update((list) =>
        list.some((r) => r.id === id)
          ? list.map((r) => (r.id === id ? reservation : r))
          : [...list, reservation],
      );
      return reservation;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível carregar a reserva.'));
    }
  }

  mine(tab: ClientReservationTab): Reservation[] {
    const statuses: Record<ClientReservationTab, ReservationStatus[]> = {
      Futuras: ['Pendente', 'Confirmada'],
      'Em andamento': ['Em andamento'],
      Histórico: ['Concluída', 'Cancelada'],
    };
    return this._reservations().filter(
      (reservation) => reservation.mine && statuses[tab].includes(reservation.status),
    );
  }

  adminList(tab: AdminReservationTab): Reservation[] {
    return this._reservations().filter((reservation) => {
      if (tab === 'Todas') return true;
      return reservation.status === ({
        Pendentes: 'Pendente', Confirmadas: 'Confirmada', 'Em andamento': 'Em andamento',
        Concluídas: 'Concluída', Canceladas: 'Cancelada',
      } as const)[tab];
    });
  }

  byStatus(status: ReservationStatus): Reservation[] {
    return this._reservations().filter((reservation) => reservation.status === status);
  }

  byClientName(name: string): Reservation[] {
    return this._reservations().filter(
      (reservation) => reservation.clientName.toLowerCase().includes(name.toLowerCase()),
    );
  }

  async create(input: CreateReservationInput): Promise<Reservation> {
    try {
      const toLocalDateTimeIso = (date: string, time: string): string => {
        const [year, month, day] = date.slice(0, 10).split('-').map(Number);
        const [hours, minutes] = time.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
      };
      const item = await firstValueFrom<ReservationApiResponse>(
        this.http.post<ReservationApiResponse>(`${this.apiUrl}/reservas`, {
          dataRetirada: toLocalDateTimeIso(input.start, input.pickupTime ?? '10:00'),
          dataDevolucao: toLocalDateTimeIso(input.end, input.returnTime ?? '10:00'),
          client_id: input.clientId,
          car_id: input.vehicleId,
        }),
      );
      const reservation = mapReservation(item, this.sessionUserId);
      this._reservations.update((list) => [reservation, ...list]);
      return reservation;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível criar a reserva.'));
    }
  }

  async cancel(id: string): Promise<void> {
    try {
      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/reservas/${id}/cancelar`, {}),
      );
      this._reservations.update((list) =>
        list.map((r) => (r.id === id ? { ...r, status: 'Cancelada' } : r)),
      );
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cancelar a reserva.'));
    }
  }

  async registerPickup(id: string): Promise<void> {
    try {
      const reservation = this._reservations().find((r) => r.id === id);
      if (!reservation || reservation.status !== 'Confirmada') {
        throw new Error('Reserva não está confirmada para retirada.');
      }

      // Cria a locação a partir da reserva confirmada.
      const locacao = await firstValueFrom<{ id: string }>(
        this.http.post<{ id: string }>(`${this.apiUrl}/locacoes`, { reservation_id: id }),
      );

      // Registra a retirada efetiva do veículo.
      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/locacoes/${locacao.id}/retirada`, {}),
      );

      this._reservations.update((list) =>
        list.map((r) => (r.id === id ? { ...r, status: 'Em andamento' } : r)),
      );
      await this.vehicleService.setStatus(reservation.vehicleId, 'Alugado');
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível registrar a retirada.'));
    }
  }

  async registerReturn(id: string, extraDays: number, fines: number): Promise<number> {
    try {
      const reservation = this._reservations().find((r) => r.id === id);
      if (!reservation || reservation.status !== 'Em andamento') {
        throw new Error('Reserva não está em andamento para devolução.');
      }

      const locacao = await firstValueFrom<{ id: string }>(
        this.http.post<{ id: string }>(`${this.apiUrl}/locacoes`, { reservation_id: id }),
      );

      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/locacoes/${locacao.id}/devolucao`, {}),
      );

      const vehicle = this.vehicleService.getById(reservation.vehicleId);
      const pricePerDay = vehicle?.pricePerDay ?? 0;
      const extra = extraDays * pricePerDay + fines;
      const total = reservation.total + extra;

      this._reservations.update((list) =>
        list.map((item) =>
          item.id === id
            ? { ...item, total, payment: extra > 0 ? 'Pendente' : item.payment, status: 'Concluída' }
            : item,
        ),
      );
      await this.vehicleService.setStatus(reservation.vehicleId, 'Disponível');
      return total;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível registrar a devolução.'));
    }
  }

  async receivePayment(id: string): Promise<void> {
    try {
      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/pagamentos/${id}/confirmar`, {}),
      );
      this._reservations.update((list) =>
        list.map((r) => (r.id === id ? { ...r, payment: 'Pago' } : r)),
      );
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível confirmar o pagamento.'));
    }
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return reservation.vehicle ?? this.vehicleService.getById(reservation.vehicleId);
  }

  clientOf(reservation: Reservation, clients: Client[]): Client | undefined {
    return clients.find((client) => client.id === reservation.clientId);
  }

  async renameMine(name: string): Promise<void> {
    this._reservations.update((reservations) =>
      reservations.map((reservation) =>
        reservation.mine ? { ...reservation, clientName: name } : reservation,
      ),
    );
  }
}
