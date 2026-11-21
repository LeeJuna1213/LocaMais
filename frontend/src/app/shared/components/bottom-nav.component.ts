import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, carSportOutline, homeOutline, menuOutline, personOutline, walletOutline } from 'ionicons/icons';
import { UserRole } from '../../core/models';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
}

const CLIENT_NAV: NavItem[] = [
  { key: 'inicio', label: 'Início', icon: 'home-outline', route: '/client/veiculos' },
  { key: 'reservas', label: 'Reservas', icon: 'calendar-outline', route: '/client/minhas', queryParams: { tab: 'Futuras' } },
  { key: 'pagamentos', label: 'Pagamentos', icon: 'wallet-outline', route: '/client/pagamentos' },
  { key: 'perfil', label: 'Perfil', icon: 'person-outline', route: '/client/perfil' },
];

const ADMIN_NAV: NavItem[] = [
  { key: 'inicio', label: 'Início', icon: 'home-outline', route: '/admin/painel' },
  { key: 'veiculos', label: 'Veículos', icon: 'car-sport-outline', route: '/admin/veiculos' },
  { key: 'reservas', label: 'Reservas', icon: 'calendar-outline', route: '/admin/reservas' },
  { key: 'menu', label: 'Menu', icon: 'menu-outline', route: '/admin/menu' },
];

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [IonIcon],
  template: `
    <nav class="app-nav">
      @for (item of items; track item.key) {
        <button type="button" [class.on]="active === item.key" (click)="go(item)">
          <i><ion-icon [name]="item.icon"></ion-icon></i>
          {{ item.label }}
        </button>
      }
    </nav>
  `,
})
export class BottomNavComponent {
  private readonly router = inject(Router);

  @Input() role: UserRole = 'client';
  @Input() active = 'inicio';

  constructor() {
    addIcons({ homeOutline, calendarOutline, walletOutline, personOutline, carSportOutline, menuOutline });
  }

  get items(): NavItem[] {
    return this.role === 'admin' ? ADMIN_NAV : CLIENT_NAV;
  }

  go(item: NavItem): void {
    void this.router.navigate([item.route], { queryParams: item.queryParams });
  }
}
