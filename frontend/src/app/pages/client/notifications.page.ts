import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { NotificationApi } from '../../core/models';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [AppShellComponent, DatePipe],
  template: `
    <app-shell title="Notificações" [back]="true" defaultHref="/client/perfil" [showNav]="true" role="client" activeTab="perfil">
      @if (error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="load()">Tentar novamente</button> }
      @else {
        @for (item of notifications.items(); track item.id) {
          <button class="card notification" [class.unread]="!item.lida_em" type="button" (click)="open(item)">
            <span class="title">{{ item.titulo }}</span>
            @if (!item.lida_em) { <span class="new">Nova</span> }
            <span>{{ item.descricao }}</span>
            @if (item.reserva?.codigo) { <span>Reserva {{ item.reserva.codigo }}</span> }
            <time [attr.datetime]="item.created_at">{{ item.created_at | date:'dd/MM/yyyy HH:mm' }}</time>
          </button>
        } @empty { <div class="card empty">Você ainda não tem notificações.</div> }
      }
    </app-shell>
  `,
  styles: [`.notification{display:grid;gap:8px;width:100%;text-align:left;color:inherit;border:1px solid #eee2d8}.notification.unread{border-color:#ed8a38;background:#fff7ef}.title{font-weight:700;font-size:15px}.new{justify-self:start;border-radius:99px;background:#e86f12;color:white;padding:3px 9px;font-size:11px}time{font-size:12px;color:#755b49}`],
})
export class NotificationsPage {
  readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  error: string | null = null;
  constructor() { void this.load(); }
  async load(): Promise<void> {
    this.error = null;
    try { await this.notifications.load(); }
    catch (error) { this.error = error instanceof Error ? error.message : 'Não foi possível carregar as notificações.'; }
  }
  async open(item: NotificationApi): Promise<void> {
    try {
      await this.notifications.markRead(item);
      if (item.reserva_id) await this.router.navigate(['/client/reservas', item.reserva_id]);
    } catch (error) { this.error = error instanceof Error ? error.message : 'Não foi possível atualizar a notificação.'; }
  }
}
