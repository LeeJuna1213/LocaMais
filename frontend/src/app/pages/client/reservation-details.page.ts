import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, UserRole, Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ShopService } from '../../core/services/shop.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';

@Component({
  selector: 'app-reservation-details',
  standalone: true,
  imports: [AppShellComponent, BadgeComponent, CurrencyPipe, DatePipe, FormsModule],
  template: `
    <app-shell
      [title]="'Reserva ' + friendlyCode"
      [back]="true"
      [defaultHref]="backHref"
      [showNav]="true"
      [role]="role"
      activeTab="reservas"
    >
      @if (reservationService.loading()) {
        <div class="card empty" role="status">Carregando reserva...</div>
      } @else if (reservationService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
      } @else if (reservation; as r) {
        <div class="card">
          <div class="row">
            <b>{{ vehicle?.name }}</b>
            <app-badge [status]="r.status" />
          </div>
          <div class="kv"><span>Cliente</span><b>{{ r.clientName }}</b></div>
          <div class="kv">
            <span>Período</span><b>{{ r.start | date: 'dd/MM/yyyy' }} - {{ r.end | date: 'dd/MM/yyyy' }}</b>
          </div>
          @if (r.pickupShop; as pickupShop) { <div class="kv"><span>Loja de retirada</span><b>{{ pickupShop.nome }} — {{ pickupShop.logradouro }}, {{ pickupShop.numero }}, {{ pickupShop.cidade }}/{{ pickupShop.uf }}</b></div> }
          @if (canChangePickupShop) {
            <label for="admin-pickup-shop">Alterar loja de retirada</label>
            <select id="admin-pickup-shop" [(ngModel)]="selectedPickupShopId">
              @for (shop of shopService.shops(); track shop.id) { <option [ngValue]="shop.id">{{ shop.nome }} — {{ shop.logradouro }}, {{ shop.numero }}, {{ shop.cidade }}/{{ shop.uf }}</option> }
            </select>
            <button class="lnk dark" type="button" (click)="savePickupShop()">Salvar loja</button>
          }
          <div class="kv"><span>Valor</span><b>{{ r.total | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Pagamento</span><b>{{ r.payment }}</b></div>

          @if (canCancelAsClient(r)) {
            <button class="btn red" type="button" [disabled]="cancelling" (click)="cancel(r)">{{ cancelling ? 'Cancelando...' : 'Cancelar reserva' }}</button>
          }

          @if (!isStaff && r.status === 'Confirmada' && !hasActivePayment(r) && !paymentStarted) {
            <label for="payment-method">Forma de pagamento</label>
            <select id="payment-method" [(ngModel)]="paymentMethod">
              <option value="pix">PIX (simulado)</option>
              <option value="cartao_credito">Cartão de crédito (simulado)</option>
              <option value="cartao_debito">Cartão de débito (simulado)</option>
            </select>
            <button class="btn" type="button" [disabled]="startingPayment" (click)="startPayment(r)">
              {{ startingPayment ? 'Iniciando...' : 'Efetuar pagamento' }}
            </button>
            <div class="small muted">O pagamento é registrado como pendente. A confirmação usa o gateway simulado do LocaMais; não há cobrança bancária real.</div>
          }
          @if (paymentStarted) {
            <div class="card" role="status">Cobrança pendente registrada pela API. A equipe concluirá o processamento simulado.</div>
          }
          @if (!isStaff && r.status === 'Confirmada' && hasActivePayment(r)) {
            <div class="card" role="status">Já existe um pagamento {{ activePaymentStatus(r) }} para esta reserva.</div>
          }

          @if (isStaff && r.status === 'Confirmada') {
            <button class="btn" type="button" (click)="registerPickup(r)">Registrar retirada</button>
          }
          @if (isStaff && r.status === 'Em andamento') {
            <button class="btn" type="button" (click)="registerReturn(r)">Registrar devolução</button>
          }
        </div>
      } @else {
        <div class="card empty">Reserva não encontrada</div>
      }
    </app-shell>
  `,
})
export class ReservationDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);
  private readonly payments = inject(CustomerPaymentService);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';
  readonly shopService = inject(ShopService);
  selectedPickupShopId: number | null = null;
  confirmCancel = false;
  cancelling = false;
  startingPayment = false;
  paymentStarted = false;
  paymentMethod = 'pix';

  get role(): UserRole {
    return this.auth.role() ?? 'client';
  }

  get backHref(): string {
    return this.isStaff ? '/admin/reservas' : '/client/minhas';
  }

  constructor() {
    if (!this.isStaff) void this.payments.load();
    if (this.isStaff) void this.shopService.loadActive();
    if (this.id) {
      void this.reservationService.getById(this.id).catch(async (error: unknown) => {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar a reserva');
      }).then(() => { this.selectedPickupShopId = this.reservation?.pickupShopId ?? null; });
    }
  }

  get canChangePickupShop(): boolean {
    return this.isStaff && !!this.reservation && (this.reservation.status === 'Pendente' || this.reservation.status === 'Confirmada');
  }

  async savePickupShop(): Promise<void> {
    if (!this.selectedPickupShopId) return;
    try {
      await this.reservationService.updatePickupShop(this.reservation?.id ?? this.id, this.selectedPickupShopId);
      await this.toast.show('Loja de retirada atualizada.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível alterar a loja.');
    }
  }

  hasActivePayment(reservation: Reservation): boolean {
    return this.payments.items().some((payment) =>
      payment.locacao?.reservation?.id === reservation.id &&
      (payment.status === 'pendente' || payment.status === 'aprovado'),
    );
  }

  activePaymentStatus(reservation: Reservation): string {
    const payment = this.payments.items().find((item) =>
      item.locacao?.reservation?.id === reservation.id &&
      (item.status === 'pendente' || item.status === 'aprovado'),
    );
    return payment?.status === 'aprovado' ? 'confirmado' : 'pendente';
  }

  get reservation(): Reservation | undefined {
    return this.reservationService.reservations().find((r) => r.id === this.id || r.publicCode?.toUpperCase() === this.id.toUpperCase());
  }

  get friendlyCode(): string {
    return this.reservation?.publicCode ?? '—';
  }

  canCancelAsClient(reservation: Reservation): boolean {
    if (this.isStaff || !reservation.mine || reservation.status !== 'Pendente') return false;
    const formatDay = (date: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    return formatDay(new Date(reservation.start)) > formatDay(new Date());
  }

  get vehicle(): Vehicle | undefined {
    const reservation = this.reservation;
    return reservation ? this.reservationService.vehicleOf(reservation) : undefined;
  }

  async cancel(reservation: Reservation): Promise<void> {
    this.cancelling = true;
    try {
      await this.reservationService.cancel(reservation.id);
      await this.toast.show('Reserva cancelada');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível cancelar a reserva.');
    } finally { this.cancelling = false; }
  }

  async startPayment(reservation: Reservation): Promise<void> {
    this.startingPayment = true;
    try {
      await this.payments.initiate(reservation.id, this.paymentMethod);
      await this.payments.load();
      this.paymentStarted = true;
      await this.toast.show('Cobrança pendente registrada. O pagamento ainda não foi confirmado.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.');
    } finally {
      this.startingPayment = false;
    }
  }

  async registerPickup(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/retirada', reservation.id]);
  }

  async registerReturn(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/devolucao', reservation.id]);
  }
}
