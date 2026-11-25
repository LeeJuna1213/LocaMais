import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, downloadOutline, printOutline } from 'ionicons/icons';
import { PaymentReceipt } from '../../core/models';

registerLocaleData(localePtBr);

@Component({
  selector: 'app-payment-receipt-viewer',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, IonIcon],
  styles: [`
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
    @if (receipt(); as r) {
      <div class="receipt-overlay" role="presentation" (click)="close()">
        <section class="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title" (click)="$event.stopPropagation()">
          <button class="lnk close-receipt" type="button" aria-label="Fechar comprovante" (click)="close()"><ion-icon name="close-outline"></ion-icon></button>
          <img class="receipt-logo" src="assets/logo.png" alt="LocaMais" />
          <h2 id="receipt-title">Comprovante de pagamento</h2>
          <div class="line"><span>Pagamento</span><b>{{ r.pagamentoId }}</b></div>
          <div class="line"><span>Data e hora</span><b>{{ r.dataConfirmacao | date:'dd/MM/yyyy HH:mm' }}</b></div>
          @if (r.cliente) { <div class="line"><span>Cliente</span><b>{{ r.cliente }}</b></div> }
          @if (r.codigoReserva) { <div class="line"><span>Reserva</span><b>{{ r.codigoReserva }}</b></div> }
          @if (r.locacaoId) { <div class="line"><span>Código da locação</span><b>{{ r.locacaoId }}</b></div> }
          @if (r.veiculo) { <div class="line"><span>Veículo</span><b>{{ r.veiculo }}{{ r.placa ? ' · ' + r.placa : '' }}</b></div> }
          @if (r.dataRetirada && r.dataDevolucao) { <div class="line"><span>Período</span><b>{{ r.dataRetirada | date:'dd/MM/yyyy HH:mm' }} — {{ r.dataDevolucao | date:'dd/MM/yyyy HH:mm' }}</b></div> }
          @if (r.lojaRetirada) { <div class="line"><span>Loja de retirada</span><b>{{ r.lojaRetirada }}</b></div> }
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
  `,
})
export class PaymentReceiptViewerComponent {
  readonly receipt = input<PaymentReceipt | null>(null);
  readonly closed = output<void>();

  constructor() {
    addIcons({ closeOutline, downloadOutline, printOutline });
  }

  close(): void { this.closed.emit(); }

  methodLabel(value: string): string {
    const labels: Record<string, string> = { pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
    return labels[value] ?? value;
  }

  statusLabel(value: string): string {
    const labels: Record<string, string> = { aprovado: 'Pago', pendente: 'Pendente', recusado: 'Recusado', cancelado: 'Cancelado', estornado: 'Estornado' };
    return labels[value] ?? value;
  }

  printReceipt(): void {
    const receipt = this.receipt();
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
      ['Código da locação', receipt.locacaoId],
      ...(receipt.veiculo ? [['Veículo', `${receipt.veiculo}${receipt.placa ? ` · ${receipt.placa}` : ''}`] as [string, string]] : []),
      ['Valor pago', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receipt.valorPago)],
      ['Forma de pagamento', receipt.metodoPagamento], ['Status', receipt.status],
    ];
    const rows = details.map(([label, value]) => `<div class="row"><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('');
    popup.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>LocaMais - Recibo ${escape(receipt.pagamentoId)}</title><style>body{font:16px Arial,sans-serif;color:#2b1a0d;margin:48px auto;max-width:700px;padding:28px}.logo{display:block;width:150px;max-height:80px;object-fit:contain;margin:0 auto 20px}h1{text-align:center;color:#aa510c;font-size:25px}.row{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid #f0e5db}.row span{color:#775d49}.notice{margin-top:24px;padding:14px;background:#fff7ee;border-radius:8px;font-size:13px}@media print{body{margin:0;padding:16mm}}</style><body><img class="logo" src="${escape(new URL('assets/logo.png', document.baseURI).toString())}" alt="LocaMais"><h1>Comprovante de pagamento</h1>${rows}<p class="notice">${escape(receipt.aviso)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async downloadPng(): Promise<void> {
    const receipt = this.receipt();
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
      ['Código da locação', receipt.locacaoId], ['Veículo', `${receipt.veiculo ?? 'Não informado'}${receipt.placa ? ` · ${receipt.placa}` : ''}`],
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
