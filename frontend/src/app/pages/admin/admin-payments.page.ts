import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline } from 'ionicons/icons';
import { CustomerPaymentApi, PaymentReceipt } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe, DatePipe, FormsModule, IonIcon],
  template: `
    <app-shell title="Pagamentos" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <section class="card payment-filters" aria-label="Filtros de pagamentos">
        <div class="payment-filter-grid payment-primary-filter">
          <div><label for="payment-status-filter">Status</label>
            <select id="payment-status-filter" [ngModel]="statusFilter" (ngModelChange)="statusFilter=$event; applyFilters()">
              <option value="">Todos</option><option value="pendente">Pendente</option><option value="aprovado">Pago</option>
              <option value="cancelado">Cancelado</option><option value="estornado">Estornado</option><option value="recusado">Recusado</option>
            </select>
          </div>
        </div>
        <button class="lnk dark payment-filter-toggle" type="button" [attr.aria-expanded]="showMoreFilters" aria-controls="payment-extra-filters" (click)="showMoreFilters=!showMoreFilters">
          <ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon>{{showMoreFilters?'Ver menos filtros':'Ver mais filtros'}}
        </button>
        <div id="payment-extra-filters" class="payment-filter-panel" [class.expanded]="showMoreFilters" [attr.aria-hidden]="!showMoreFilters" [attr.inert]="showMoreFilters?null:''">
          <div class="payment-filter-panel-inner"><div class="payment-filter-grid">
            <div><label for="payment-date-from">Data inicial</label><input id="payment-date-from" type="date" [ngModel]="dateFrom" (ngModelChange)="dateFrom=$event; applyFilters()" /></div>
            <div><label for="payment-date-to">Data final</label><input id="payment-date-to" type="date" [ngModel]="dateTo" (ngModelChange)="dateTo=$event; applyFilters()" /></div>
          </div></div>
        </div>
        <button class="lnk dark payment-clear-filters" type="button" (click)="clearFilters()">Limpar filtros</button>
      </section>
      @if (payments.loading()) {
        <div class="card empty" role="status">Carregando pagamentos...</div>
      } @else if (payments.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (payment of filtered; track payment.id) {
          <article class="card">
            <div class="row"><b>Pagamento</b><b>{{ statusLabel(payment.status) }}</b></div>
            <div>Cliente: {{ payment.reservation?.client?.user?.name || payment.reservation?.client?.user?.email || payment.locacao?.reservation?.client?.user?.name || payment.locacao?.reservation?.client?.user?.email || '—' }}</div>
            <div>Veículo: {{ vehicleName(payment) }}</div>
            <div>Reserva: {{ payment.reservation?.codigo || friendlyReservation(payment) }}</div>
            @if (payment.locacao_id) { <div>Locação: {{ payment.locacao_id }}</div> }
            <div>Valor: {{ payment.valor | currency: 'BRL' }}</div>
            @if (payment.metodo) { <div>Forma de pagamento: {{ payment.metodo }}</div> }
            <div>Data: {{ (payment.comprovante_snapshot?.dataConfirmacao || payment.data) | date: 'dd/MM/yyyy HH:mm' }}</div>
            @if (payment.estorno) { <div>Estorno simulado: {{ payment.estorno.valor | currency: 'BRL' }}</div> }
            @if (payment.status === 'pendente') {
              <div class="small muted">Cobrança pendente; ainda não consta como valor pago.</div>
              <button class="btn" type="button" [disabled]="processingId === payment.id" (click)="confirm(payment)">Processar simulação</button>
            }
            @if (payment.status === 'aprovado' || payment.status === 'estornado') {
              <button class="btn" type="button" (click)="showReceipt(payment)">Visualizar recibo</button>
            }
          </article>
        } @empty { <div class="card empty">Nenhum pagamento para este filtro.</div> }
      }
      @if (receipt; as item) {
        <section class="card" aria-label="Recibo do pagamento">
          <div class="row"><b>{{ item.empresa }} · Recibo</b><button type="button" class="btn secondary" (click)="receipt = null">Fechar</button></div>
          <div>Pagamento: {{ item.pagamentoId }}</div><div>Locação: {{ item.locacaoId }}</div>
          <div>Cliente: {{ item.cliente || '—' }}</div><div>Veículo: {{ item.veiculo || '—' }}</div>
          <div>Total pago: {{ item.valorPago | currency: 'BRL' }}</div>
          <div>Forma: {{ item.metodoPagamento }} · {{ item.dataConfirmacao | date: 'dd/MM/yyyy HH:mm' }}</div>
          <div>Status: {{ item.status }}</div><p>{{ item.aviso }}</p>
          <button class="btn" type="button" (click)="printReceipt()">Salvar / imprimir recibo</button>
        </section>
      }
    </app-shell>
  `,
})
export class AdminPaymentsPage {
  private readonly route = inject(ActivatedRoute);
  readonly payments = inject(CustomerPaymentService);
  private readonly toast = inject(ToastService);
  statusFilter: CustomerPaymentApi['status'] | '' = '';
  dateFrom = '';
  dateTo = '';
  showMoreFilters = false;
  processingId: string | null = null;
  receipt: PaymentReceipt | null = null;

  constructor() {
    addIcons({ chevronDownOutline });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const status = params.get('status');
      if (status && ['pendente', 'aprovado', 'cancelado', 'estornado', 'recusado'].includes(status)) this.statusFilter = status as CustomerPaymentApi['status'];
      void this.load();
    });
  }

  async load(): Promise<void> { await this.payments.loadOperational({ status: this.statusFilter, de: this.dateFrom, ate: this.dateTo }); }

  get filtered(): CustomerPaymentApi[] { return this.payments.items(); }

  vehicleName(payment: CustomerPaymentApi): string {
    const car = payment.locacao?.reservation?.car;
    return car ? `${car.marca} ${car.modelo} · ${car.placa}` : '—';
  }

  friendlyReservation(payment: CustomerPaymentApi): string {
    const code = payment.locacao?.reservation?.codigo;
    return code ? `Reserva ${code}` : 'Reserva —';
  }

  statusLabel(status: CustomerPaymentApi['status']): string {
    return ({ pendente: 'Pendente', aprovado: 'Pago', cancelado: 'Cancelado', estornado: 'Estornado', recusado: 'Recusado' })[status];
  }

  async applyFilters(): Promise<void> { await this.load(); }

  async clearFilters(): Promise<void> {
    this.statusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    await this.load();
  }

  async confirm(payment: CustomerPaymentApi): Promise<void> {
    this.processingId = payment.id;
    try {
      await this.payments.confirm(payment.id);
      await this.load();
      await this.toast.show('Resultado do gateway simulado atualizado pela API.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível processar o pagamento.');
    } finally { this.processingId = null; }
  }

  async showReceipt(payment: CustomerPaymentApi): Promise<void> {
    try { this.receipt = await this.payments.receipt(payment.id); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o recibo.'); }
  }

  printReceipt(): void { window.print(); }
}
