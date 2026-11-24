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
import { daysBetween } from '../data';

export interface CreateReservationInput {
  clientId: number;
  vehicleId: number;
  start: string;
  end: string;
  pickupTime?: string;
  returnTime?: string;
  pickupShopId: number;
  quotedServiceFee?: number | null;
}
export interface ReservationQuote { valorDiaria: number; diarias: number; valorSubtotal: number; taxaServico: number; valorTotal: number }
export interface AvailabilityAlternative { dataRetirada: string; dataDevolucao: string }
export interface ReservationAvailability {
  car_id: number;
  dataRetirada: string;
  dataDevolucao: string;
  disponivel: boolean;
  motivo: 'manutencao' | 'locacao_em_andamento' | 'conflito' | 'impedimento_operacional' | null;
  conflito: { id: string; dataRetirada: string; dataDevolucao: string; status: string } | null;
  locacaoEmAndamento: { dataRetirada: string | null; dataDevolucaoPrevista: string; devolucaoRegistrada: false } | null;
  dependeDeDevolucao: boolean;
  alternativas: AvailabilityAlternative[];
  horizonteAlternativasDias: number;
}

export type ClientReservationTab = 'Futuras' | 'Em andamento' | 'Histórico';
export type AdminReservationTab = 'Todas' | 'Pendentes' | 'Confirmadas' | 'Em andamento' | 'Concluídas' | 'Canceladas';

const API_STATUS_MAP: Record<string, ReservationStatus> = {
  pendente: 'Aguardando pagamento',
  aguardando_confirmacao: 'Aguardando confirmação',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
};

export interface ReservationApiResponse {
  id: string;
  codigo?: string | null;
  dataRetirada: string;
  dataDevolucao: string;
  diarias?: number;
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
  locacao?: { id?: string; status: 'aguardando_retirada' | 'em_andamento' | 'concluida' | 'cancelada'; dataRetirada?: string | null; dataDevolucao?: string | null } | null;
  loja_retirada_id?: number | null;
  lojaRetiradaSnapshot?: { nome: string; logradouro: string; numero: string; cidade: string; uf: string } | null;
  pagamentos?: Array<{ id: string; status: string; metodo: string; valor: number; data: string; comprovante_snapshot?: { dataConfirmacao?: string } | null }>;
}

export function mapReservation(api: ReservationApiResponse, sessionUserId: number | null, sessionIsClient: boolean): Reservation {
  const client = api.client ?? null;
  const car = api.car ?? null;
  const vehicle = car ? mapCarroApi(car) : undefined;
  const status = api.locacao?.status === 'em_andamento'
    ? 'Em andamento'
    : API_STATUS_MAP[api.status];
  if (!status) throw new Error(`Status de reserva não reconhecido pela interface: ${api.status}`);
  const rentalStarted = api.status !== 'cancelada'
    && !!api.locacao?.dataRetirada
    && (api.locacao.status === 'em_andamento' || api.locacao.status === 'concluida');

  return {
    id: api.id,
    publicCode: api.codigo ?? null,
    clientName: client?.user?.name ?? client?.tipo_pessoa ?? '',
    // GET /reservas is already owner-scoped for clients; the backend need not
    // load client.user merely so the client screen can identify its own rows.
    mine: client?.user?.id === sessionUserId || sessionIsClient,
    clientId: api.client_id,
    vehicleId: api.car_id,
    vehicle,
    start: api.dataRetirada,
    end: api.dataDevolucao,
    days: api.diarias ?? daysBetween(api.dataRetirada, api.dataDevolucao),
    status,
    total: api.valorTotal ?? 0,
    subtotal: api.valorSubtotal ?? api.valorTotal ?? 0,
    serviceFee: api.taxaServico ?? 0,
    payment: api.pagamentos?.some((payment) => payment.status === 'estornado')
      ? 'Estornado'
      : api.pagamentos?.some((payment) => payment.status === 'aprovado') ? 'Pago'
        : api.pagamentos?.some((payment) => payment.status === 'cancelado') ? 'Cancelado' : 'Pendente',
    paymentMethod: ({ pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'PIX' } as Record<string, PaymentMethod>)[api.pagamentos?.at(-1)?.metodo ?? 'pix'] ?? 'PIX',
    paymentId: api.pagamentos?.at(-1)?.id ?? null,
    pickupShopId: api.loja_retirada_id ?? null,
    pickupShop: api.lojaRetiradaSnapshot ?? null,
    rentalId: api.locacao?.id ?? null,
    rentalStatus: api.locacao?.status ?? null,
    rentalStarted,
    actualReturnDate: api.locacao?.dataDevolucao ?? null,
  };
}

export function filterAdminReservations(reservations: Reservation[], tab: AdminReservationTab): Reservation[] {
  if (tab === 'Todas') return reservations;
  if (tab === 'Pendentes') return reservations.filter((reservation) => reservation.status === 'Aguardando pagamento' || reservation.status === 'Aguardando confirmação');
  if (tab === 'Canceladas') {
    return reservations.filter((reservation) => reservation.status === 'Cancelada' || reservation.rentalStatus === 'cancelada');
  }
  const statuses: Partial<Record<AdminReservationTab, ReservationStatus>> = {
    Confirmadas: 'Confirmada', 'Em andamento': 'Em andamento',
    'Concluídas': 'Concluída',
  };
  const status = statuses[tab];
  return status
    ? reservations.filter((reservation) => reservation.status === status
      && !(tab === 'Confirmadas' && reservation.rentalStatus === 'cancelada'))
    : [];
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
    this._reservations().filter((r) => r.status === 'Confirmada' && r.rentalStatus !== 'cancelada').length,
  );
  readonly inProgress = computed(() =>
    this._reservations().filter((r) => r.status === 'Em andamento').length,
  );

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  async quote(input: Pick<CreateReservationInput, 'vehicleId' | 'start' | 'end' | 'pickupTime' | 'returnTime'>): Promise<ReservationQuote> {
    const toLocalDateTimeIso = (date: string, time: string): string => {
      const [year, month, day] = date.slice(0, 10).split('-').map(Number);
      const [hours, minutes] = time.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
    };
    const params = new URLSearchParams({
      car_id: String(input.vehicleId),
      dataRetirada: toLocalDateTimeIso(input.start, input.pickupTime ?? '10:00'),
      dataDevolucao: toLocalDateTimeIso(input.end, input.returnTime ?? '10:00'),
    });
    try {
      return await firstValueFrom(this.http.get<ReservationQuote>(`${this.apiUrl}/reservas/estimativa?${params}`));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível calcular os valores da reserva.'));
    }
  }

  async checkAvailability(input: Pick<CreateReservationInput, 'vehicleId' | 'start' | 'end' | 'pickupTime' | 'returnTime'>): Promise<ReservationAvailability> {
    const toLocalDateTimeIso = (date: string, time: string): string => {
      const [year, month, day] = date.slice(0, 10).split('-').map(Number);
      const [hours, minutes] = time.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
    };
    const params = new URLSearchParams({
      car_id: String(input.vehicleId),
      dataRetirada: toLocalDateTimeIso(input.start, input.pickupTime ?? '10:00'),
      dataDevolucao: toLocalDateTimeIso(input.end, input.returnTime ?? '10:00'),
    });
    try {
      return await firstValueFrom(this.http.get<ReservationAvailability>(`${this.apiUrl}/reservas/disponibilidade?${params}`));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível consultar a disponibilidade do veículo.'));
    }
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
      const isClient = this.session.user()?.type === 'cliente';
      this._reservations.set(items.map((item) => mapReservation(item, userId, isClient)));
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
      const reservation = mapReservation(item, this.sessionUserId, this.session.user()?.type === 'cliente');
      this._reservations.update((list) =>
        list.some((r) => r.id === id || r.publicCode?.toUpperCase() === id.toUpperCase())
          ? list.map((r) => (r.id === id || r.publicCode?.toUpperCase() === id.toUpperCase() ? reservation : r))
          : [...list, reservation],
      );
      return reservation;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível carregar a reserva.'));
    }
  }

  mine(tab: ClientReservationTab): Reservation[] {
    const statuses: Record<ClientReservationTab, ReservationStatus[]> = {
      Futuras: ['Pendente', 'Aguardando pagamento', 'Aguardando confirmação', 'Confirmada'],
      'Em andamento': ['Em andamento'],
      Histórico: ['Concluída', 'Cancelada'],
    };
    return this._reservations().filter(
      (reservation) => reservation.mine && (reservation.rentalStatus === 'cancelada'
        ? tab === 'Histórico'
        : statuses[tab].includes(reservation.status)),
    );
  }

  adminList(tab: AdminReservationTab): Reservation[] {
    return filterAdminReservations(this._reservations(), tab);
  }

  byStatus(status: ReservationStatus): Reservation[] {
    return this._reservations().filter((reservation) => reservation.status === status
      && !(status === 'Confirmada' && reservation.rentalStatus === 'cancelada')
      && !(status === 'Em andamento' && reservation.rentalStatus !== null && reservation.rentalStatus !== undefined && reservation.rentalStatus !== 'em_andamento'));
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
          loja_retirada_id: input.pickupShopId,
          ...(input.quotedServiceFee !== null && input.quotedServiceFee !== undefined ? { taxa_servico_cotada: input.quotedServiceFee } : {}),
        }),
      );
      const reservation = mapReservation(item, this.sessionUserId, this.session.user()?.type === 'cliente');
      this._reservations.update((list) => [reservation, ...list.filter((item) => item.id !== reservation.id)]);
      return reservation;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível criar a reserva.'));
    }
  }

  async cancel(id: string): Promise<void> {
    try {
      const updated = await firstValueFrom<ReservationApiResponse>(this.http.patch<ReservationApiResponse>(`${this.apiUrl}/reservas/${id}/cancelar`, {}));
      this._reservations.update((list) =>
        list.map((r) => (r.id === id ? mapReservation(updated, this.sessionUserId, this.session.user()?.type === 'cliente') : r)),
      );
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cancelar a reserva.'));
    }
  }

  async setStatus(id: string, status: 'confirmada'): Promise<void> {
    try {
      const updated = await firstValueFrom<ReservationApiResponse>(this.http.patch<ReservationApiResponse>(`${this.apiUrl}/reservas/${id}`, { status }));
      const mapped = mapReservation(updated, this.sessionUserId, this.session.user()?.type === 'cliente');
      this._reservations.update((items) => items.map((item) => item.id === id ? mapped : item));
    } catch (error) { throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar a reserva.')); }
  }

  async updatePickupShop(id: string, shopId: number): Promise<Reservation> {
    try {
      const item = await firstValueFrom(this.http.patch<ReservationApiResponse>(`${this.apiUrl}/reservas/${id}`, { loja_retirada_id: shopId }));
      const updated = mapReservation(item, this.sessionUserId, this.session.user()?.type === 'cliente');
      this._reservations.update((list) => list.map((reservation) => reservation.id === id ? updated : reservation));
      return updated;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível alterar a loja de retirada.'));
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

  async registerReturn(id: string, extraDays: number, fines: number, damageDescription = ''): Promise<number> {
    try {
      const reservation = this._reservations().find((r) => r.id === id);
      if (!reservation || reservation.status !== 'Em andamento' || reservation.rentalStatus !== 'em_andamento') {
        throw new Error('Reserva não está em andamento para devolução.');
      }

      if (!reservation.rentalId) {
        throw new Error('Não foi possível localizar a locação desta reserva. Atualize a página e tente novamente.');
      }

      await firstValueFrom<void>(
        this.http.patch<void>(`${this.apiUrl}/locacoes/${reservation.rentalId}/devolucao`, {
          ...(damageDescription.trim() ? { descricaoAvaria: damageDescription.trim() } : {}),
        }),
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
