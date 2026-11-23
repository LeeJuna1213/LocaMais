import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SystemSettingsService } from '../../core/services/system-settings.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ServiceFeePage } from './service-fee.page';

describe('ServiceFeePage numeric input', () => {
  const serviceFee = signal(24.75);
  const loading = signal(false);
  const error = signal<string | null>(null);
  const load = vi.fn(async () => 24.75);
  const save = vi.fn(async (amount: number) => amount);

  beforeEach(async () => {
    serviceFee.set(24.75);
    load.mockClear();
    save.mockClear();
    TestBed.configureTestingModule({
      imports: [ServiceFeePage],
      providers: [
        { provide: SystemSettingsService, useValue: { serviceFee, loading, error, load, save } },
        { provide: ToastService, useValue: { show: vi.fn(async () => undefined) } },
      ],
    });
    TestBed.overrideComponent(ServiceFeePage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    await TestBed.compileComponents();
  });

  it('retém o valor decimal, step, controles numéricos e persiste o valor digitado', async () => {
    const fixture = TestBed.createComponent(ServiceFeePage);
    fixture.detectChanges();
    await fixture.componentInstance.load();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#service-fee') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.step).toBe('0.01');
    expect(input.value).toBe('24.75');
    expect(input.classList.contains('service-fee-input')).toBe(true);

    input.value = '32.45';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.value).toBe(32.45);

    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(32.45);
    expect(fixture.componentInstance.value).toBe(32.45);
  });
});
