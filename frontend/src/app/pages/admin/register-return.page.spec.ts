import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { RegisterReturnPage } from './register-return.page';

describe('RegisterReturnPage avaria e valores numéricos', () => {
  const reservation = {
    id: 'r-1', clientName: 'Cliente', vehicleId: 12, start: '2026-11-23', end: '2026-11-25',
    days: 2, status: 'Em andamento', total: 250, mine: false, payment: 'Pendente', paymentMethod: 'PIX',
    rentalId: 'rental-test', rentalStatus: 'em_andamento',
  };
  const vehicle = { id: 12, name: 'Veículo teste', pricePerDay: 125 };
  const registerReturn = vi.fn(async () => 250);
  const toastShow = vi.fn(async () => undefined);
  const navigate = vi.fn(async () => true);

  beforeEach(async () => {
    registerReturn.mockClear();
    toastShow.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      imports: [RegisterReturnPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r-1' } } } },
        { provide: Router, useValue: { navigate, navigateByUrl: navigate } },
        {
          provide: ReservationService,
          useValue: {
            loading: () => false,
            error: () => null,
            reservations: () => [reservation],
            vehicleOf: () => vehicle,
            getById: vi.fn(async () => reservation),
            registerReturn,
          },
        },
        { provide: ToastService, useValue: { show: toastShow } },
      ],
    });
    TestBed.overrideComponent(RegisterReturnPage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    await TestBed.compileComponents();
  });

  it('aceita descrição opcional, mantém input numérico decimal e passa a descrição ao salvar', async () => {
    const fixture = TestBed.createComponent(RegisterReturnPage);
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('#damage-description') as HTMLTextAreaElement;
    const fines = fixture.nativeElement.querySelector('.return-fines') as HTMLInputElement;
    expect(textarea.required).toBe(false);
    expect(textarea.placeholder).toContain('localização');
    expect(fines.type).toBe('number');
    expect(fines.step).toBe('0.01');
    expect(fines.classList.contains('return-fines')).toBe(true);

    fines.value = '12.34';
    fines.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fines.stepUp();
    fines.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.fines).toBe(12.35);
    fines.stepDown();
    fines.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.fines).toBe(12.34);

    textarea.value = 'Risco profundo na porta traseira direita.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.componentInstance.confirm();
    expect(registerReturn).toHaveBeenCalledWith('r-1', 0, 12.34, 'Risco profundo na porta traseira direita.');
  });
});
