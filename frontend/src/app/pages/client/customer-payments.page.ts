import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, downloadOutline, printOutline, receiptOutline } from 'ionicons/icons';
import { CustomerPaymentApi, PaymentReceipt } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

registerLocaleData(localePtBr);

@Component({
  selector: 'app-customer-payments',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, IonIcon, AppShellComponent],
  styles: [`
    .payment-card { margin: 10px 0; }
    .payment-car-photo { width: 74px; height: 56px; object-fit: cover; border-radius: 9px; flex: none; }
    .payment-vehicle { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .payment-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .status { border-radius: 99px; padding: 4px 9px; font-size: 11px; font-weight: 700; background: #fff1d6; color: #875500; }
    .status.aprovado { background: #e5f5eb; color: #176b39; }
    .receipt-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 42px; margin-top: 8px; }
    .receipt-overlay { position: fixed; z-index: 1000; inset: 0; overflow: auto; padding: 18px; background: #24180f99; display: grid; place-items: start center; }
    .receipt { width: min(100%, 620px); margin: 16px 0; padding: 28px; background: #fff; border-radius: 18px; box-shadow: 0 12px 48px #0003; color: #2b1a0d; }
    .receipt-logo { display: block; width: 148px; max-height: 76px; object-fit: contain; margin: 0 auto 14px; }
    .receipt h2 { text-align: center; color: #aa510c; margin: 0 0 22px; }
    .receipt .line { display: flex; justify-content: space-between; gap: 14px; border-bottom: 1px solid #f0e5db; padding: 10px 0; }
    .receipt .line span { color: #775d49; }
    .receipt .notice { margin-top: 18px; padding: 12px; background: #fff7ee; border-radius: 10px; font-size: 12px; }
    .receipt-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
    .receipt-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; }
    @media (max-width: 420px) { .receipt { padding: 20px 16px; } }
    @media print { body * { visibility: hidden !important; } .receipt, .receipt * { visibility: visible !important; } .receipt-overlay { position: static; padding: 0; background: white; display: block; } .receipt { width: 100%; margin: 0; box-shadow: none; } .receipt-actions, .close-receipt { display: none !important; } }
  `],
  template: `
    <app-shell title="Pagamentos" [showNav]="true" role="client" activeTab="pagamentos">
      @if (payments.loading()) {
        <div class="card empty" role="status">Carregando pagamentos...</div>
      } @else if (payments.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="payments.load()">Tentar novamente</button>
      } @else {
        <h3>Pagamentos realizados</h3>
        @for (item of approved; track item.id) {
          <article class="card payment-card">
            <header><span class="status aprovado">Aprovado</span></header>
            <div class="payment-vehicle">@if (photo(item); as src) { <img class="payment-car-photo" [src]="src" alt="Foto do veículo da reserva" /> }<b>{{ carName(item) }}</b></div>
            <div class="kv"><span>Valor pago</span><b>{{ +item.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            <div class="kv"><span>Data do pagamento</span><b>{{ item.data | date:'dd/MM/yyyy HH:mm' }}</b></div>
            <div class="kv"><span>Forma</span><b>{{ methodLabel(item.metodo) }}</b></div>
            <div class="kv"><span>Locação</span><b>{{ item.locacao_id }}</b></div>
            @if (item.locacao?.reservation?.codigo) { <div class="kv"><span>Reserva</span><b>{{ item.locacao.reservation.codigo }}</b></div> }
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
            <div class="kv"><span>Locação</span><b>{{ item.locacao_id }}</b></div>
            @if (item.locacao?.reservation?.codigo) { <div class="kv"><span>Reserva</span><b>{{ item.locacao.reservation.codigo }}</b></div> }
            <p class="small muted">A confirmação é realizada pela equipe da LocaMais. Este pagamento ainda não foi concluído.</p>
          </article>
        } @empty { <div class="card empty">Você não possui pagamentos pendentes.</div> }

        @if (excluded.length) {
          <h3>Outros status</h3>
          @for (item of excluded; track item.id) {
            <div class="card payment-card"><b>{{ item.locacao?.reservation?.car?.marca || 'Pagamento' }} {{ item.locacao?.reservation?.car?.modelo || '' }}</b><div class="kv"><span>Valor</span><b>{{ +item.valor | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div><span class="status">{{ item.status }}</span></div>
          }
        }
      }

      @if (receipt; as r) {
        <div class="receipt-overlay" role="presentation" (click)="closeReceipt()">
          <section class="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title" (click)="$event.stopPropagation()">
            <button class="lnk close-receipt" type="button" aria-label="Fechar comprovante" (click)="closeReceipt()"><ion-icon name="close-outline"></ion-icon></button>
            <img class="receipt-logo" src="assets/logo.png" alt="LocaMais" />
            <h2 id="receipt-title">Comprovante de pagamento</h2>
            <div class="line"><span>Pagamento</span><b>{{ r.pagamentoId }}</b></div>
            <div class="line"><span>Data e hora</span><b>{{ r.dataConfirmacao | date:'dd/MM/yyyy HH:mm' }}</b></div>
            @if (r.cliente) { <div class="line"><span>Cliente</span><b>{{ r.cliente }}</b></div> }
            @if (r.codigoReserva) { <div class="line"><span>Reserva</span><b>{{ r.codigoReserva }}</b></div> }
            <div class="line"><span>Locação</span><b>{{ r.locacaoId }}</b></div>
            @if (r.veiculo) { <div class="line"><span>Veículo</span><b>{{ r.veiculo }}{{ r.placa ? ' · ' + r.placa : '' }}</b></div> }
            <div class="line"><span>Valor pago</span><b>{{ r.valorPago | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            <div class="line"><span>Forma</span><b>{{ methodLabel(r.metodoPagamento) }}</b></div>
            <div class="line"><span>Status</span><b>{{ statusLabel(r.status) }}</b></div>
            <p class="notice">{{ r.aviso }}</p>
            <div class="receipt-actions">
              <button class="btn" type="button" (click)="printReceipt()"><ion-icon name="print-outline"></ion-icon>Salvar como PDF</button>
              <button class="btn" type="button" (click)="downloadPng()"><ion-icon name="download-outline"></ion-icon>Baixar PNG</button>
            </div>
          </section>
        </div>
      }
    </app-shell>
  `,
})
export class CustomerPaymentsPage {
  readonly payments = inject(CustomerPaymentService);
  private readonly imageUrls = inject(ImageUrlService);
  receipt: PaymentReceipt | null = null;

  constructor() {
    addIcons({ closeOutline, downloadOutline, printOutline, receiptOutline });
    void this.payments.load();
  }

  get approved(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'aprovado'); }
  get pending(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'pendente'); }
  get excluded(): CustomerPaymentApi[] { return this.payments.items().filter((item) => item.status === 'cancelado' || item.status === 'recusado'); }
  get totalPaid(): number { return this.approved.reduce((total, item) => total + Number(item.valor), 0); }
  get totalPending(): number { return this.pending.reduce((total, item) => total + Number(item.valor), 0); }

  methodLabel(value: string): string {
    const labels: Record<string, string> = { pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
    return labels[value] ?? value;
  }

  statusLabel(value: string): string {
    const labels: Record<string, string> = { aprovado: 'Aprovado', pendente: 'Pendente', recusado: 'Recusado', cancelado: 'Cancelado' };
    return labels[value] ?? value;
  }

  carName(item: CustomerPaymentApi): string {
    const car = item.locacao?.reservation?.car;
    return car ? `${car.marca} ${car.modelo}${car.placa ? ` · ${car.placa}` : ''}` : 'Veículo da locação';
  }

  photo(item: CustomerPaymentApi): string | null {
    return this.imageUrls.resolve(item.locacao?.reservation?.car?.foto);
  }

  async openReceipt(item: CustomerPaymentApi): Promise<void> {
    if (item.status !== 'aprovado') return;
    this.receipt = await this.payments.receipt(item.id);
  }

  closeReceipt(): void { this.receipt = null; }

  printReceipt(): void {
    const receipt = this.receipt;
    if (!receipt || receipt.status !== 'aprovado') return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const escape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
    const date = new Date(receipt.dataConfirmacao).toLocaleString('pt-BR');
    const details: Array<[string, string]> = [
      ['Pagamento', receipt.pagamentoId], ['Data e hora', date],
      ...(receipt.cliente ? [['Cliente', receipt.cliente] as [string, string]] : []),
      ['Locação', receipt.locacaoId],
      ...(receipt.veiculo ? [['Veículo', `${receipt.veiculo}${receipt.placa ? ` · ${receipt.placa}` : ''}`] as [string, string]] : []),
      ['Valor pago', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receipt.valorPago)],
      ['Forma de pagamento', receipt.metodoPagamento], ['Status', receipt.status],
    ];
    const rows = details.map(([label, value]) => `<div class="row"><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('');
    popup.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>LocaMais - Recibo ${escape(receipt.pagamentoId)}</title><style>body{font:16px Arial,sans-serif;color:#2b1a0d;margin:48px auto;max-width:700px;padding:28px}.logo{display:block;width:150px;max-height:80px;object-fit:contain;margin:0 auto 20px}h1{text-align:center;color:#aa510c;font-size:25px}.row{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid #f0e5db}.row span{color:#775d49}.notice{margin-top:24px;padding:14px;background:#fff7ee;border-radius:8px;font-size:13px}@media print{body{margin:0;padding:16mm}}</style><body><img class="logo" src="${escape(new URL('assets/logo.png', document.baseURI).toString())}" alt="LocaMais"><h1>Comprovante de pagamento</h1>${rows}<p class="notice">${escape(receipt.aviso)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async downloadPng(): Promise<void> {
    const receipt = this.receipt;
    if (!receipt || receipt.status !== 'aprovado') return;
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1180;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    const logo = new Image();
    logo.src = new URL('assets/logo.png', document.baseURI).toString();
    await new Promise<void>((resolve) => { logo.onload = () => resolve(); logo.onerror = () => resolve(); });
    if (logo.complete && logo.naturalWidth) context.drawImage(logo, 350, 45, 200, 95);
    context.fillStyle = '#aa510c'; context.textAlign = 'center'; context.font = 'bold 34px Arial';
    context.fillText('Comprovante de pagamento', 450, 190);
    const lines: Array<[string, string]> = [
      ['Pagamento', receipt.pagamentoId], ['Data e hora', new Date(receipt.dataConfirmacao).toLocaleString('pt-BR')],
      ...(receipt.cliente ? [['Cliente', receipt.cliente] as [string, string]] : []),
      ['Locação', receipt.locacaoId], ['Veículo', `${receipt.veiculo ?? 'Não informado'}${receipt.placa ? ` · ${receipt.placa}` : ''}`],
      ['Valor pago', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receipt.valorPago)],
      ['Forma', receipt.metodoPagamento], ['Status', receipt.status],
    ];
    context.textAlign = 'left'; context.font = '21px Arial'; context.fillStyle = '#2b1a0d';
    lines.forEach(([label, value], index) => {
      const y = 260 + index * 78;
      context.fillStyle = '#775d49'; context.fillText(label, 70, y);
      context.fillStyle = '#2b1a0d'; context.textAlign = 'right'; context.fillText(value.slice(0, 55), 830, y); context.textAlign = 'left';
      context.strokeStyle = '#f0e5db'; context.beginPath(); context.moveTo(70, y + 22); context.lineTo(830, y + 22); context.stroke();
    });
    context.fillStyle = '#775d49'; context.font = '16px Arial';
    context.fillText(receipt.aviso.slice(0, 100), 70, 980);
    const anchor = document.createElement('a');
    anchor.download = `locamais-recibo-${receipt.pagamentoId}.png`;
    anchor.href = canvas.toDataURL('image/png');
    anchor.click();
  }
}
