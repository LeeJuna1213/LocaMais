import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, receiptOutline } from 'ionicons/icons';
import { CustomerPaymentApi, PaymentReceipt } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ToastService } from '../../core/services/toast.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { PaymentReceiptViewerComponent } from '../../shared/components/payment-receipt-viewer.component';

registerLocaleData(localePtBr);

@Component({
  selector: 'app-customer-payments',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, IonIcon, AppShellComponent, FormsModule, PaymentReceiptViewerComponent],
  styles: [`
    .payment-card { margin: 10px 0; }
    .payment-car-photo { width: 74px; height: 56px; object-fit: cover; border-radius: 9px; flex: none; }
    .payment-vehicle { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .payment-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .status { border-radius: 99px; padding: 4px 9px; font-size: 11px; font-weight: 700; background: #fff1d6; color: #875500; }
    .status.aprovado { background: #e5f5eb; color: #176b39; }
    .status.cancelado,.status.recusado { background: #fce9e7; color: #8b2118; }
    .status.estornado { background: #ece8f7; color: #493b79; }
    .receipt-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 42px; margin-top: 8px; }
  `],
  template: `
    <app-shell title="Pagamentos" [showNav]="true" role="client" activeTab="pagamentos">
      <section class="card payment-filters" aria-label="Filtros de pagamentos">
        <div class="payment-filter-grid payment-primary-filter">
          <div><label for="customer-payment-status">Status</label>
            <select id="customer-payment-status" [ngModel]="statusFilter" (ngModelChange)="statusFilter=$event; applyFilters()">
              <option value="">Todos</option><option value="pendente">Pendente</option><option value="aprovado">Pago</option>
              <option value="cancelado">Cancelado</option><option value="estornado">Estornado</option><option value="recusado">Recusado</option>
            </select>
          </div>
        </div>
        <button class="lnk dark payment-filter-toggle" type="button" [attr.aria-expanded]="showMoreFilters" aria-controls="customer-payment-extra-filters" (click)="showMoreFilters=!showMoreFilters">
          <ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon>{{showMoreFilters?'Ver menos filtros':'Ver mais filtros'}}
        </button>
        <div id="customer-payment-extra-filters" class="payment-filter-panel" [class.expanded]="showMoreFilters" [attr.aria-hidden]="!showMoreFilters" [attr.inert]="showMoreFilters?null:''">
          <div class="payment-filter-panel-inner"><div class="payment-filter-grid">
            <div><label for="customer-payment-from">Data inicial</label><input id="customer-payment-from" type="date" [ngModel]="dateFrom" (ngModelChange)="dateFrom=$event; applyFilters()" /></div>
            <div><label for="customer-payment-to">Data final</label><input id="customer-payment-to" type="date" [ngModel]="dateTo" (ngModelChange)="dateTo=$event; applyFilters()" /></div>
          </div></div>
        </div>
        <button class="lnk dark payment-clear-filters" type="button" (click)="clearFilters()">Limpar filtros</button>
      </section>
      @if (payments.loading()) {
        <div class="card empty" role="status">Carregando pagamentos...</div>
      } @else if (payments.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="payments.load()">Tentar novamente</button>
      } @else {
        <h3>Pagamentos realizados</h3>
        @for (item of approved; track item.id) {
          <article class="card payment-card">
            <header><span class="status aprovado">Pago</span></header>
            <div class="payment-vehicle">@if (photo(item); as src) { <img class="payment-car-photo" [src]="src" alt="Foto do veículo da reserva" /> }<b>{{ carName(item) }}</b></div>
            <div class="kv"><span>Valor pago</span><b>{{ +item.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            <div class="kv"><span>Data do pagamento</span><b>{{ item.data | date:'dd/MM/yyyy HH:mm' }}</b></div>
            <div class="kv"><span>Forma</span><b>{{ methodLabel(item.metodo) }}</b></div>
            @if (item.locacao_id) { <div class="kv"><span>Locação</span><b>{{ item.locacao_id }}</b></div> }
            @if (reservation(item)?.codigo) { <div class="kv"><span>Reserva</span><b>{{ reservation(item)?.codigo }}</b></div> }
            <button class="btn receipt-action" type="button" (click)="openReceipt(item)"><ion-icon name="receipt-outline"></ion-icon>Visualizar comprovante</button>
          </article>
        } @empty { <div class="card empty">Você ainda não possui pagamentos concluídos.</div> }

        <h3>Pagamentos pendentes</h3>
        @for (item of pending; track item.id) {
          <article class="card payment-card">
            <header><span class="status">Pendente</span></header>
            <div class="payment-vehicle">@if (photo(item); as src) { <img class="payment-car-photo" [src]="src" alt="Foto do veículo da reserva" /> }<b>{{ carName(item) }}</b></div>
            <div class="kv"><span>Valor aguardando pagamento</span><b>{{ +item.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            <div class="kv"><span>Registrado em</span><b>{{ item.data | date:'dd/MM/yyyy HH:mm' }}</b></div>
            @if (reservation(item)?.codigo) { <div class="kv"><span>Reserva</span><b>{{ reservation(item)?.codigo }}</b></div> }
            <button class="btn" type="button" (click)="payNow(item)">Pagar agora</button>
          </article>
        } @empty { <div class="card empty">Você não possui pagamentos pendentes.</div> }

        @if (excluded.length) {
          <h3>Outros status</h3>
          @for (item of excluded; track item.id) {
            <div class="card payment-card"><b>{{ carName(item) }}</b><div class="kv"><span>Valor original</span><b>{{ +item.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div><span class="status">{{ statusLabel(item.status) }}</span>@if (item.estorno) { <div class="kv"><span>Estorno simulado</span><b>{{ +item.estorno.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div><div class="kv"><span>Data do estorno</span><b>{{ item.estorno.data | date:'dd/MM/yyyy HH:mm' }}</b></div> } @if (item.status === 'estornado' && item.comprovante_snapshot) { <button class="btn" type="button" (click)="openReceipt(item)">Ver recibo original</button> }</div>
          }
        }
      }

      <app-payment-receipt-viewer [receipt]="receipt" (closed)="closeReceipt()" />
    </app-shell>
  `,
})
export class CustomerPaymentsPage {
  readonly payments = inject(CustomerPaymentService);
  private readonly imageUrls = inject(ImageUrlService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly toast = inject(ToastService);
  receipt: PaymentReceipt | null = null;
  statusFilter: CustomerPaymentApi['status'] | '' = '';
  dateFrom = '';
  dateTo = '';
  showMoreFilters = false;

  constructor() {
    addIcons({ chevronDownOutline, receiptOutline });
    void this.payments.load();
  }

  async applyFilters(): Promise<void> {
    await this.payments.load({ status: this.statusFilter, de: this.dateFrom, ate: this.dateTo });
  }

  async clearFilters(): Promise<void> {
    this.statusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    await this.payments.load();
  }

  get approved(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'aprovado'); }
  get pending(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'pendente'); }
  get excluded(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'cancelado' || item.status === 'recusado' || item.status === 'estornado'); }
  get totalPaid(): number { return this.approved.reduce((total, item) => total + Number(item.valor), 0); }
  get totalPending(): number { return this.pending.reduce((total, item) => total + Number(item.valor), 0); }

  methodLabel(value: string): string {
    const labels: Record<string, string> = { pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
    return labels[value] ?? value;
  }

  statusLabel(value: string): string {
    const labels: Record<string, string> = { aprovado: 'Pago', pendente: 'Pendente', recusado: 'Recusado', cancelado: 'Cancelado', estornado: 'Estornado' };
    return labels[value] ?? value;
  }

  carName(item: CustomerPaymentApi): string {
    const car = this.reservation(item)?.car ?? item.locacao?.reservation?.car;
    return car ? `${car.marca} ${car.modelo}${car.placa ? ` · ${car.placa}` : ''}` : 'Veículo da locação';
  }

  photo(item: CustomerPaymentApi): string | null {
    return this.imageUrls.resolve(this.reservation(item)?.car?.foto ?? item.locacao?.reservation?.car?.foto);
  }

  reservation(item: CustomerPaymentApi) { return item.reservation ?? item.locacao?.reservation ?? null; }

  async payNow(item: CustomerPaymentApi): Promise<void> {
    const reservationId = item.reservation_id ?? item.reservation?.id ?? item.locacao?.reservation?.id;
    if (reservationId) await this.router.navigate(['/booking/pagamento'], { queryParams: { id: reservationId } });
  }

  async openReceipt(item: CustomerPaymentApi): Promise<void> {
    if (item.status !== 'aprovado' && item.status !== 'estornado') return;
    try {
      this.receipt = await this.payments.receipt(item.id);
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o recibo.');
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  closeReceipt(): void { this.receipt = null; }

}
