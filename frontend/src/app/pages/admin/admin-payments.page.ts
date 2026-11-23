import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CustomerPaymentApi, PaymentReceipt } from '../../core/models';
import { CustomerPaymentService, filterOperationalPayments } from '../../core/services/customer-payment.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [AppShellComponent, SegmentTabsComponent, CurrencyPipe, DatePipe],
  template: `
    <app-shell title="Pagamentos" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <app-segment-tabs variant="tabs" [options]="tabs" [active]="tab" (activeChange)="setTab($event)" />
      @if (payments.loading()) {
        <div class="card empty" role="status">Carregando pagamentos...</div>
      } @else if (payments.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (payment of filtered; track payment.id) {
          <article class="card">
            <div class="row"><b>Pagamento</b><b>{{ payment.status === 'aprovado' ? 'Realizado' : 'Pendente' }}</b></div>
            <div>Cliente: {{ payment.locacao?.reservation?.client?.user?.name || payment.locacao?.reservation?.client?.user?.email || '—' }}</div>
            <div>Veículo: {{ vehicleName(payment) }}</div>
            <div>Reserva: {{ friendlyReservation(payment) }}</div>
            <div>Locação: {{ payment.locacao_id }}</div>
            <div>Valor: {{ payment.valor | currency: 'BRL' }}</div>
            @if (payment.metodo) { <div>Forma de pagamento: {{ payment.metodo }}</div> }
            @if (payment.status === 'aprovado') { <div>Data do pagamento: {{ (payment.comprovante_snapshot?.dataConfirmacao || payment.data) | date: 'dd/MM/yyyy HH:mm' }}</div> }
            @if (payment.status === 'pendente') {
              <div class="small muted">Cobrança pendente; ainda não consta como valor pago.</div>
              <button class="btn" type="button" [disabled]="processingId === payment.id" (click)="confirm(payment)">Processar simulação</button>
            }
            @if (payment.status === 'aprovado') {
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly payments = inject(CustomerPaymentService);
  private readonly toast = inject(ToastService);
  readonly tabs = ['Todos', 'Pendentes', 'Realizados'];
  tab: 'Todos' | 'Pendentes' | 'Realizados' = 'Todos';
  processingId: string | null = null;
  receipt: PaymentReceipt | null = null;

  constructor() {
    void this.payments.loadOperational();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params.get('tab') === 'Pendentes' || params.get('tab') === 'Realizados' || params.get('tab') === 'Todos') this.tab = params.get('tab') as typeof this.tab;
      else if (params.get('status') === 'pendente') this.tab = 'Pendentes';
    });
  }

  async load(): Promise<void> { await this.payments.loadOperational(); }

  get filtered(): CustomerPaymentApi[] {
    return filterOperationalPayments(this.payments.items(), this.tab);
  }

  vehicleName(payment: CustomerPaymentApi): string {
    const car = payment.locacao?.reservation?.car;
    return car ? `${car.marca} ${car.modelo} · ${car.placa}` : '—';
  }

  friendlyReservation(payment: CustomerPaymentApi): string {
    const code = payment.locacao?.reservation?.codigo;
    const digits = code?.match(/(\d+)$/)?.[1];
    return digits ? `Reserva ${digits.padStart(3, '0')}` : 'Reserva —';
  }

  async setTab(tab: string): Promise<void> {
    this.tab = tab as typeof this.tab;
    await this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
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
