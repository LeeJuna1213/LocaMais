import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AdminMenuComponent } from './admin-menu.component';

describe('AdminMenuComponent', () => {
  const router = { url: '/admin/menu', navigateByUrl: vi.fn() };
  let role: 'admin' | 'funcionario';

  beforeEach(async () => {
    role = 'admin';
    TestBed.configureTestingModule({
      imports: [AdminMenuComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { role: () => role, logout: vi.fn() } },
      ],
    });
    await TestBed.compileComponents();
  });

  it('oculta Reservas do administrador e mantém as outras opções e destinos', () => {
    const fixture = TestBed.createComponent(AdminMenuComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.menuItems.map((item) => item.label)).toEqual([
      'Clientes', 'Carros', 'Nova reserva', 'Retiradas', 'Devoluções',
      'Pagamentos', 'Lojas', 'Taxa de serviço', 'Relatórios', 'Gerenciar funcionários',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Reservas');
    expect(page.items.some((item) => item.route === '/admin/reservas')).toBe(false);
    expect(page.items.some((item) => item.route === '/admin/reserva')).toBe(true);
  });

  it('oculta Reservas do funcionário e mantém as opções permitidas', () => {
    role = 'funcionario';
    const fixture = TestBed.createComponent(AdminMenuComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.menuItems.map((item) => item.label)).toEqual([
      'Clientes', 'Carros', 'Nova reserva', 'Retiradas', 'Devoluções',
      'Pagamentos', 'Taxa de serviço', 'Relatórios',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Reservas');
  });
});
