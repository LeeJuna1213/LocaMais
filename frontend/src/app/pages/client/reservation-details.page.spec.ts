import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReceipt, Reservation } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';
import { ReservationDetailsPage } from './reservation-details.page';

describe('ReservationDetailsPage receipt', () => {
  const selectedReservation: Reservation = {
    id: 'reservation-22', publicCode: 'RES-000022', clientName: 'Cliente 22', mine: true,
    vehicleId: 7, start: '2026-12-01T10:00:00Z', end: '2026-12-03T10:00:00Z',
    status: 'Aguardando confirmação', total: 120, payment: 'Pago', paymentMethod: 'PIX', paymentId: 'payment-22',
  };
  const selectedReceipt: PaymentReceipt = {
    empresa: 'LocaMais', reciboId: 'payment-22', pagamentoId: 'payment-22', locacaoId: 'rental-22',
    codigoReserva: 'RES-000022', cliente: 'Cliente 22', veiculo: 'Carro 22', placa: 'ABC1D23',
    valorPago: 120, metodoPagamento: 'pix', dataConfirmacao: '2026-11-20T10:00:00Z',
    status: 'aprovado', aviso: 'Recibo da reserva selecionada',
  };
  const receiptRequest = vi.fn(async (paymentId: string) => ({ ...selectedReceipt, pagamentoId: paymentId, reciboId: paymentId }));
  let fixture: ComponentFixture<ReservationDetailsPage>;

  beforeEach(async () => {
    receiptRequest.mockClear();
    TestBed.configureTestingModule({
      imports: [ReservationDetailsPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => selectedReservation.id } } } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
        { provide: AuthService, useValue: { role: () => 'client', profile: () => ({ name: 'Cliente 22' }), home: () => '/client' } },
        { provide: ReservationService, useValue: {
          loading: () => false, error: () => null, reservations: () => [selectedReservation],
          getById: vi.fn(async () => selectedReservation), vehicleOf: () => undefined,
        } },
        { provide: CustomerPaymentService, useValue: { load: vi.fn(), receipt: receiptRequest, items: () => [] } },
        { provide: ShopService, useValue: { shops: () => [], loadForVehicle: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(ReservationDetailsPage, {
      remove: { imports: [AppShellComponent, BadgeComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ReservationDetailsPage);
    fixture.detectChanges();
  });

  it('requests and displays only the receipt associated with this reservation payment', async () => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((candidate) => candidate.textContent?.includes('Ver recibo'));
    expect(button).toBeTruthy();
    if (!button) throw new Error('Botão Ver recibo não foi renderizado.');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(receiptRequest).toHaveBeenCalledOnce();
    expect(receiptRequest).toHaveBeenCalledWith('payment-22');
    expect(fixture.nativeElement.textContent).toContain('RES-000022');
    expect(fixture.nativeElement.textContent).toContain('payment-22');
    expect(fixture.nativeElement.textContent).toContain('Recibo da reserva selecionada');
  });

  it('does not request a receipt when payment is not approved/available', async () => {
    const page = fixture.componentInstance;
    await page.openReceipt({ ...selectedReservation, payment: 'Pendente' });
    await page.openReceipt({ ...selectedReservation, paymentId: null });
    expect(receiptRequest).not.toHaveBeenCalled();
  });
});
