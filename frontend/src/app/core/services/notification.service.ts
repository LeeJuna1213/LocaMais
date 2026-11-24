import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
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
  private nativeReady = false;
  private nativeSyncInFlight = false;
  private nativeBaselineSet = false;
  private readonly seenNativeIds = new Set<string>();
  private nativePollingStarted = false;
  private get apiUrl(): string { return environment.apiUrl.replace(/\/+$/, ''); }

  async load(enableNative = false): Promise<void> {
    try {
      const [items, count] = await Promise.all([
        firstValueFrom(this.http.get<NotificationApi[]>(`${this.apiUrl}/notificacoes`)),
        firstValueFrom(this.http.get<{ count: number }>(`${this.apiUrl}/notificacoes/nao-lidas/contagem`)),
      ]);
      this._items.set(items);
      this._unread.set(count.count);
      if (enableNative) await this.enableNativeNotifications(items);
      else if (this.nativeReady) await this.scheduleNewNativeNotifications(items);
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível carregar as notificações.')); }
  }

  private async enableNativeNotifications(items: NotificationApi[]): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') return;
      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({ id: 'locamais-events', name: 'Atualizações da reserva', description: 'Atualizações de reservas, pagamentos e estornos', importance: 4 });
      }
      this.nativeReady = true;
      if (!this.nativeBaselineSet) {
        const stored = this.readSeenNativeIds();
        if (stored === null) items.forEach((item) => this.seenNativeIds.add(item.id));
        else stored.forEach((id) => this.seenNativeIds.add(id));
        this.nativeBaselineSet = true;
      }
      this.startNativePolling();
      await this.scheduleNewNativeNotifications(items);
    } catch {
      // Native notification delivery is best effort; MySQL remains the durable inbox.
    }
  }

  private startNativePolling(): void {
    if (this.nativePollingStarted || typeof document === 'undefined') return;
    this.nativePollingStarted = true;
    window.setInterval(() => {
      if (document.visibilityState === 'hidden') void this.load();
    }, 45_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.load();
    });
  }

  private async scheduleNewNativeNotifications(items: NotificationApi[]): Promise<void> {
    if (!this.nativeReady || document.visibilityState !== 'hidden' || this.nativeSyncInFlight) return;
    const fresh = items.filter((item) => !this.seenNativeIds.has(item.id));
    if (!fresh.length) return;
    this.nativeSyncInFlight = true;
    try {
      const pending = await LocalNotifications.getPending();
      const pendingIds = new Set(pending.notifications.map((item) => item.id));
      const notifications = fresh.filter((item) => !pendingIds.has(this.nativeId(item.id))).map((item) => ({
        id: this.nativeId(item.id),
        title: item.titulo,
        body: item.descricao,
        schedule: { at: new Date(Date.now() + 1_000) },
        channelId: Capacitor.getPlatform() === 'android' ? 'locamais-events' : undefined,
        smallIcon: Capacitor.getPlatform() === 'android' ? 'ic_stat_locamais' : undefined,
        iconColor: '#f57c1f',
        autoCancel: true,
        isExactNotification: false,
        extra: { notificationId: item.id, reservationId: item.reserva_id },
      }));
      if (notifications.length) await LocalNotifications.schedule({ notifications });
      fresh.forEach((item) => this.seenNativeIds.add(item.id));
      this.saveSeenNativeIds();
    } catch {
      // Keep events unread in the API-backed list if native delivery is unavailable.
    } finally { this.nativeSyncInFlight = false; }
  }

  private nativeId(id: string): number {
    let hash = 2166136261;
    for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0) % 2_147_483_647 || 1;
  }

  private readSeenNativeIds(): string[] | null {
    try {
      const value = localStorage.getItem('locamais.native-notification-ids');
      return value ? JSON.parse(value) as string[] : value === null ? null : [];
    } catch { return []; }
  }

  private saveSeenNativeIds(): void {
    try { localStorage.setItem('locamais.native-notification-ids', JSON.stringify([...this.seenNativeIds].slice(-500))); }
    catch { /* Notification dedupe is best effort when device storage is unavailable. */ }
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
