import { Injectable, computed, inject, signal } from '@angular/core';
import { seedReservations } from '../data';
import { Client, PaymentMethod, Reservation, ReservationStatus, Vehicle } from '../models';
import { VehicleService } from './vehicle.service';

export interface CreateReservationInput {
  clientName: string;
  mine: boolean;
  vehicleId: number;
  start: string;
  end: string;
  total: number;
  paymentMethod: PaymentMethod;
}

export type ClientReservationTab = 'Futuras' | 'Em andamento' | 'Histórico';
export type AdminReservationTab = 'Todas' | 'Pendentes' | 'Em andamento';

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly vehicleService = inject(VehicleService);
  private readonly _reservations = signal<Reservation[]>(seedReservations());

  readonly reservations = this._reservations.asReadonly();
  readonly pendingPickups = computed(() => this._reservations().filter((reservation) => reservation.status === 'Confirmada').length);
  readonly inProgress = computed(() => this._reservations().filter((reservation) => reservation.status === 'Em andamento').length);

  getById(id: number): Reservation | undefined {
    return this._reservations().find((reservation) => reservation.id === id);
  }

  async list(): Promise<Reservation[]> {
    return [...this._reservations()];
  }

  mine(tab: ClientReservationTab): Reservation[] {
    const statuses: Record<ClientReservationTab, ReservationStatus[]> = {
      Futuras: ['Confirmada'],
      'Em andamento': ['Em andamento'],
      Histórico: ['Concluída', 'Cancelada'],
    };
    return this._reservations().filter((reservation) => reservation.mine && statuses[tab].includes(reservation.status));
  }

  adminList(tab: AdminReservationTab): Reservation[] {
    return this._reservations().filter((reservation) => {
      if (tab === 'Todas') {
        return true;
      }
      if (tab === 'Pendentes') {
        return reservation.status === 'Confirmada';
      }
      return reservation.status === 'Em andamento';
    });
  }

  byStatus(status: ReservationStatus): Reservation[] {
    return this._reservations().filter((reservation) => reservation.status === status);
  }

  byClientName(name: string): Reservation[] {
    return this._reservations().filter((reservation) => reservation.clientName === name);
  }

  async create(input: CreateReservationInput): Promise<Reservation> {
    const reservations = this._reservations();
    const reservation: Reservation = {
      id: reservations.length ? Math.max(...reservations.map((r) => r.id)) + 1 : 1001,
      clientName: input.clientName,
      mine: input.mine,
      vehicleId: input.vehicleId,
      start: input.start,
      end: input.end,
      status: 'Confirmada',
      total: input.total,
      payment: 'Pago',
      paymentMethod: input.paymentMethod,
    };
    this._reservations.update((list) => [reservation, ...list]);
    return reservation;
  }

  async cancel(id: number): Promise<void> {
    this._reservations.update((reservations) =>
      reservations.map((reservation) =>
        reservation.id === id && reservation.status === 'Confirmada' ? { ...reservation, status: 'Cancelada' } : reservation,
      ),
    );
  }

  async registerPickup(id: number): Promise<void> {
    const reservation = this.getById(id);
    if (!reservation || reservation.status !== 'Confirmada') {
      return;
    }
    this._reservations.update((reservations) =>
      reservations.map((item) => (item.id === id ? { ...item, status: 'Em andamento' } : item)),
    );
    await this.vehicleService.setStatus(reservation.vehicleId, 'Alugado');
  }

  async registerReturn(id: number, extraDays: number, fines: number): Promise<number> {
    const reservation = this.getById(id);
    if (!reservation || reservation.status !== 'Em andamento') {
      return 0;
    }
    const vehicle = this.vehicleService.getById(reservation.vehicleId);
    const pricePerDay = vehicle?.pricePerDay ?? 0;
    const extra = extraDays * pricePerDay + fines;
    const total = reservation.total + extra;
    this._reservations.update((reservations) =>
      reservations.map((item) =>
        item.id === id
          ? { ...item, total, payment: extra > 0 ? 'Pendente' : item.payment, status: 'Concluída' }
          : item,
      ),
    );
    await this.vehicleService.setStatus(reservation.vehicleId, 'Disponível');
    return total;
  }

  async receivePayment(id: number): Promise<void> {
    this._reservations.update((reservations) =>
      reservations.map((reservation) => (reservation.id === id ? { ...reservation, payment: 'Pago' } : reservation)),
    );
  }

  async renameMine(name: string): Promise<void> {
    this._reservations.update((reservations) =>
      reservations.map((reservation) => (reservation.mine ? { ...reservation, clientName: name } : reservation)),
    );
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return this.vehicleService.getById(reservation.vehicleId);
  }

  clientOf(reservation: Reservation, clients: Client[]): Client | undefined {
    return clients.find((client) => client.name === reservation.clientName);
  }
}
