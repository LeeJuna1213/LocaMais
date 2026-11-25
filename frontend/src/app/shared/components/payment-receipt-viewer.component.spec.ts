import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReceipt } from '../../core/models';
import { PaymentReceiptViewerComponent } from './payment-receipt-viewer.component';

const receipt: PaymentReceipt = {
  empresa: 'LocaMais', reciboId: 'payment-22', pagamentoId: 'payment-22', locacaoId: 'rental-22',
  codigoReserva: 'RES-000022', cliente: 'Cliente 22', veiculo: 'Carro 22', placa: 'ABC1D23',
  valorPago: 120, metodoPagamento: 'pix', dataConfirmacao: '2026-11-20T10:00:00Z',
  status: 'aprovado', aviso: 'Recibo original',
};

describe('PaymentReceiptViewerComponent', () => {
  let fixture: ComponentFixture<PaymentReceiptViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaymentReceiptViewerComponent] }).compileComponents();
    fixture = TestBed.createComponent(PaymentReceiptViewerComponent);
  });

  it('shows the receipt passed by the caller and emits close without changing its contents', () => {
    fixture.componentRef.setInput('receipt', receipt);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text).toContain('payment-22');
    expect(text).toContain('RES-000022');
    expect(text).toContain('Carro 22');

    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.nativeElement.querySelector('.close-receipt') as HTMLButtonElement).click();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('does not render a viewer without a receipt', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens the same print-to-PDF document with the supplied receipt data', () => {
    fixture.componentRef.setInput('receipt', receipt);
    fixture.detectChanges();
    const popup = { document: { write: vi.fn(), close: vi.fn() } };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);

    (fixture.nativeElement.querySelector('.receipt-actions .btn') as HTMLButtonElement).click();

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(popup.document.write).toHaveBeenCalledOnce();
    expect(popup.document.write.mock.calls[0][0]).toContain('payment-22');
    expect(popup.document.write.mock.calls[0][0]).toContain('window.print()');
    expect(popup.document.close).toHaveBeenCalledOnce();
  });
});
