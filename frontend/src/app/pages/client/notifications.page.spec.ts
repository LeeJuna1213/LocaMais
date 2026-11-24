import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { NotificationApi } from '../../core/models';
import { NotificationService } from '../../core/services/notification.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { NotificationsPage } from './notifications.page';

describe('NotificationsPage legibility and read state', () => {
  const items: NotificationApi[] = [
    { id: 'new-event', tipo: 'pagamento_cancelado', titulo: 'Pagamento cancelado', descricao: 'Não há pagamento pendente.', reserva_id: 'reservation-1', created_at: '2026-11-24T12:00:00.000Z', lida_em: null, reserva: { id: 'reservation-1', codigo: 'LOC-000001' } },
    { id: 'read-event', tipo: 'reserva_criada', titulo: 'Reserva aguardando pagamento', descricao: 'A reserva aguarda pagamento.', reserva_id: null, created_at: '2026-11-23T12:00:00.000Z', lida_em: '2026-11-23T12:05:00.000Z', reserva: null },
  ];
  const notifications = {
    items: () => items,
    load: vi.fn(async () => undefined),
    markRead: vi.fn(async (item: NotificationApi) => item),
  };
  let fixture: ComponentFixture<NotificationsPage>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
      ],
    });
    TestBed.overrideComponent(NotificationsPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
  });

  it('keeps unread and read events visibly distinct and renders readable details', () => {
    const cards = fixture.nativeElement.querySelectorAll('.notification') as NodeListOf<HTMLElement>;
    expect(cards).toHaveLength(2);
    expect(cards[0].classList.contains('unread')).toBe(true);
    expect(cards[0].textContent).toContain('Não há pagamento pendente.');
    expect(cards[0].textContent).toContain('LOC-000001');
    expect(cards[0].querySelector('.new')?.textContent).toContain('Nova');
    expect(cards[1].classList.contains('unread')).toBe(false);
    expect(cards[1].querySelector('.new')).toBeNull();
    expect(cards[1].querySelector('time')?.textContent).toBeTruthy();
    const css = (NotificationsPage as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('');
    expect(css).toContain('color: #2b1a0d');
    expect(css).toContain('background: #fff7ef');
    expect(css).toContain('color: #594332');
  });
});
