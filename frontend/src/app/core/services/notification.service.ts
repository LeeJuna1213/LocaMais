import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';
import { NotificationApi } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly errors = inject(ApiErrorService);
  private readonly _items = signal<NotificationApi[]>([]);
  private readonly _unread = signal(0);
  readonly items = this._items.asReadonly();
  readonly unreadCount = this._unread.asReadonly();
  readonly unread = computed(() => this._items().filter((item) => !item.lida_em));
  private get apiUrl(): string { return environment.apiUrl.replace(/\/+$/, ''); }

  async load(): Promise<void> {
    try {
      const [items, count] = await Promise.all([
        firstValueFrom(this.http.get<NotificationApi[]>(`${this.apiUrl}/notificacoes`)),
        firstValueFrom(this.http.get<{ count: number }>(`${this.apiUrl}/notificacoes/nao-lidas/contagem`)),
      ]);
      this._items.set(items);
      this._unread.set(count.count);
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível carregar as notificações.')); }
  }

  async markRead(item: NotificationApi): Promise<NotificationApi> {
    if (item.lida_em) return item;
    try {
      const updated = await firstValueFrom(this.http.patch<NotificationApi>(`${this.apiUrl}/notificacoes/${encodeURIComponent(item.id)}/lida`, {}));
      this._items.update((items) => items.map((current) => current.id === updated.id ? updated : current));
      this._unread.update((count) => Math.max(0, count - 1));
      return updated;
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível marcar a notificação como lida.')); }
  }
}
