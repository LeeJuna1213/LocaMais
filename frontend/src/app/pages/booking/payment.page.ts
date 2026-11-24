import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentMethod, PaymentReceipt, Reservation } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PaymentService } from '../../core/services/payment.service';
import { ReservationService } from '../../core/services/reservation.service';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

const METHOD_CODES: Record<PaymentMethod, string> = {
  PIX: 'pix',
  'Cartão de crédito': 'cartao_credito',
  'Cartão de débito': 'cartao_debito',
};

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe, DatePipe],
  template: `
    <app-shell title="Pagamento" [back]="true" defaultHref="/client/minhas">
      @if (loading) { <div class="card empty" role="status">Carregando reserva...</div> }
      @else if (reservation; as r) {
        <div class="card">
          <h2>Pagamento da reserva {{ r.publicCode || '—' }}</h2>
          <div class="kv"><span>Cliente</span><b>{{ r.clientName }}</b></div>
          <div class="kv"><span>Veículo</span><b>{{ r.vehicle?.make || r.vehicle?.name }} {{ r.vehicle?.model || r.vehicle?.version }}</b></div>
          <div class="kv"><span>Período</span><b>{{ r.start | date:'dd/MM/yyyy HH:mm' }} — {{ r.end | date:'dd/MM/yyyy HH:mm' }}</b></div>
          @if (r.pickupShop; as shop) { <div class="kv"><span>Loja de retirada</span><b>{{ shop.nome }}, {{ shop.logradouro }}, {{ shop.numero }} — {{ shop.cidade }}/{{ shop.uf }}</b></div> }
          <div class="kv"><span>Valor da diária</span><b>{{ dailyRate(r) | currency:'BRL' }}</b></div>
          <div class="kv"><span>Quantidade de diárias</span><b>{{ r.days }}</b></div>
          <div class="kv"><span>Subtotal das diárias</span><b>{{ r.subtotal | currency:'BRL' }}</b></div>
          <div class="kv"><span>Taxa de serviço</span><b>{{ r.serviceFee | currency:'BRL' }}</b></div>
          <div class="kv total"><span>Valor total</span><b>{{ r.total | currency:'BRL' }}</b></div>
        </div>

        @if (receipt; as receiptData) {
          <section class="card receipt" aria-labelledby="receipt-title">
            <img src="assets/logo.png" alt="LocaMais" />
            <h2 id="receipt-title">Pagamento realizado</h2>
            <div class="kv"><span>Código da reserva</span><b>{{ receiptData.codigoReserva }}</b></div>
            <div class="kv"><span>Cliente</span><b>{{ receiptData.cliente }}</b></div>
            <div class="kv"><span>Veículo</span><b>{{ receiptData.veiculo }}</b></div>
            @if (receiptData.dataRetirada && receiptData.dataDevolucao) { <div class="kv"><span>Período</span><b>{{ receiptData.dataRetirada | date:'dd/MM/yyyy HH:mm' }} — {{ receiptData.dataDevolucao | date:'dd/MM/yyyy HH:mm' }}</b></div> }
            @if (receiptData.lojaRetirada) { <div class="kv"><span>Loja</span><b>{{ receiptData.lojaRetirada }}</b></div> }
            <div class="kv"><span>Forma de pagamento</span><b>{{ methodLabel(receiptData.metodoPagamento) }}</b></div>
            <div class="kv"><span>Valor pago</span><b>{{ receiptData.valorPago | currency:'BRL' }}</b></div>
            <div class="kv"><span>Data e hora</span><b>{{ receiptData.dataConfirmacao | date:'dd/MM/yyyy HH:mm' }}</b></div>
            <p>{{ receiptData.aviso }}</p>
            <button class="btn" type="button" (click)="goToPayments()">Abrir página de Pagamentos</button>
          </section>
        } @else if (r.status === 'Aguardando pagamento' && r.payment === 'Pendente') {
          <div class="card">
            <label for="payment-method">Forma de pagamento</label>
            <select id="payment-method" [value]="method" (change)="setMethod($event)">
              @for (item of paymentService.methods; track item) { <option [value]="item">{{ item }}</option> }
            </select>
            <p class="small muted">Pagamento acadêmico simulado. Não solicitamos dados de cartão e nenhuma cobrança real será feita.</p>
            <button class="btn" type="button" [disabled]="saving" (click)="pay()">{{ saving ? 'Processando...' : 'Pagar' }}</button>
            <button class="lnk dark" type="button" [disabled]="saving" (click)="payLater()">Pagar depois</button>
          </div>
        } @else {
          <div class="card" role="status">{{ r.payment === 'Pago' ? 'Pagamento aprovado. Aguardando confirmação da equipe.' : 'Esta reserva não está aguardando pagamento.' }}</div>
          <button class="btn" type="button" (click)="payLater()">Ver minhas reservas</button>
        }
      } @else { <div class="card empty" role="alert">Reserva não encontrada.</div> }
    </app-shell>
  `,
  styles: [`.total{border-top:1px solid #eadfd5;padding-top:10px;font-size:17px}.receipt img{display:block;width:140px;max-height:70px;object-fit:contain;margin:0 auto 14px}.receipt h2{text-align:center;color:#aa510c}.receipt p{padding:12px;background:#fff7ee;border-radius:10px;font-size:12px}`],
})
export class PaymentPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly reservationService = inject(ReservationService);
  private readonly customerPayments = inject(CustomerPaymentService);
  private readonly toast = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly paymentService = inject(PaymentService);
  reservation: Reservation | null = null;
  receipt: PaymentReceipt | null = null;
  method: PaymentMethod = 'PIX';
  loading = true;
  saving = false;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (!id) { await this.router.navigateByUrl(this.auth.home()); return; }
    try {
      this.reservation = await this.reservationService.getById(id) ?? null;
      if (this.reservation?.payment === 'Pago' && this.reservation.paymentId) {
        this.receipt = await this.customerPayments.receipt(this.reservation.paymentId);
      }
    } catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar a reserva.'); }
    finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }

  dailyRate(reservation: Reservation): number { return reservation.days ? (reservation.subtotal ?? reservation.total) / reservation.days : 0; }
  setMethod(event: Event): void { this.method = (event.target as HTMLSelectElement).value as PaymentMethod; }
  methodLabel(method: string): string { return ({ pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro' } as Record<string, string>)[method] ?? method; }

  async pay(): Promise<void> {
    const reservation = this.reservation;
    if (!reservation || this.saving || reservation.payment !== 'Pendente') return;
    this.saving = true;
    try {
      const payment = await this.customerPayments.initiate(reservation.id, METHOD_CODES[this.method]);
      await this.reservationService.load();
      this.reservation = await this.reservationService.getById(reservation.id) ?? reservation;
      this.receipt = await this.customerPayments.receipt(payment.id);
      this.changeDetector.markForCheck();
      await this.toast.show('Pagamento simulado aprovado. O recibo está disponível nesta página e em Pagamentos.');
    } catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível processar o pagamento.'); }
    finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }

  async payLater(): Promise<void> {
    await this.router.navigateByUrl(this.auth.role() === 'admin' || this.auth.role() === 'funcionario' ? '/admin/reservas' : '/client/minhas');
  }

  async goToPayments(): Promise<void> { await this.router.navigateByUrl('/client/pagamentos'); }
}
