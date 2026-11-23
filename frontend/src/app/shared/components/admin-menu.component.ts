import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowUndoOutline, barChartOutline, cardOutline, carSportOutline, cashOutline, keyOutline, peopleOutline, personOutline, storefrontOutline } from 'ionicons/icons';

interface AdminMenuItem {
  label: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-admin-menu',
  standalone: true,
  imports: [IonIcon],
  template: `
    <div class="card">
      @for (item of menuItems; track item.route) {
        <button class="mn" [class.active]="isActive(item.route)" type="button" (click)="go(item.route)"><span class="mn-main"><ion-icon [name]="item.icon" aria-hidden="true"></ion-icon>{{ item.label }}</span><span>›</span></button>
      }
    </div>
    <button class="btn red" type="button" (click)="logout()">Sair</button>
  `,
})
export class AdminMenuComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly items: AdminMenuItem[] = [
    { label: 'Clientes', route: '/admin/clientes', icon: 'people-outline' },
    { label: 'Carros', route: '/admin/veiculos', icon: 'car-sport-outline' },
    { label: 'Nova reserva', route: '/admin/reserva', icon: 'key-outline' },
    { label: 'Retiradas', route: '/admin/locacoes', icon: 'arrow-undo-outline' },
    { label: 'Devoluções', route: '/admin/devolucoes', icon: 'arrow-undo-outline' },
    { label: 'Pagamentos', route: '/admin/pagamentos', icon: 'card-outline' },
    { label: 'Lojas', route: '/admin/lojas', icon: 'storefront-outline' },
    { label: 'Taxa de serviço', route: '/admin/taxa-servico', icon: 'cash-outline' },
    { label: 'Relatórios', route: '/admin/relatorios', icon: 'bar-chart-outline' },
    { label: 'Gerenciar funcionários', route: '/admin/usuarios', icon: 'person-outline' },
  ];

  get menuItems(): AdminMenuItem[] {
    return this.auth.role() === 'funcionario'
      ? this.items.filter((item) => item.route !== '/admin/usuarios' && item.route !== '/admin/lojas')
      : this.items;
  }

  constructor() { addIcons({ arrowUndoOutline, barChartOutline, cardOutline, carSportOutline, cashOutline, keyOutline, peopleOutline, personOutline, storefrontOutline }); }

  isActive(route: string): boolean { return this.router.url.split('?')[0] === route; }

  async go(route: string): Promise<void> {
    await this.router.navigateByUrl(route);
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
