import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface AdminMenuItem {
  label: string;
  route: string;
}

@Component({
  selector: 'app-admin-menu',
  standalone: true,
  template: `
    <div class="card">
      @for (item of items; track item.route) {
        <button class="mn" type="button" (click)="go(item.route)">{{ item.label }}<span>›</span></button>
      }
    </div>
    <button class="btn red" type="button" (click)="logout()">Sair</button>
  `,
})
export class AdminMenuComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly items: AdminMenuItem[] = [
    { label: 'Clientes', route: '/admin/clientes' },
    { label: 'Veículos', route: '/admin/veiculos' },
    { label: 'Reservas', route: '/admin/reservas' },
    { label: 'Nova reserva', route: '/admin/reserva' },
    { label: 'Locações (retirada)', route: '/admin/locacoes' },
    { label: 'Devoluções', route: '/admin/devolucoes' },
    { label: 'Pagamentos', route: '/admin/pagamentos' },
    { label: 'Relatórios', route: '/admin/relatorios' },
  ];

  async go(route: string): Promise<void> {
    await this.router.navigateByUrl(route);
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
