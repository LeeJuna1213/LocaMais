import { Component } from '@angular/core';
import { AdminMenuComponent } from '../../shared/components/admin-menu.component';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-admin-menu-page',
  standalone: true,
  imports: [AppShellComponent, AdminMenuComponent],
  template: `
    <app-shell title="Menu" [showNav]="true" role="admin" activeTab="menu">
      <app-admin-menu />
    </app-shell>
  `,
})
export class AdminMenuPage {}
