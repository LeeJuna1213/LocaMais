import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportsPage } from './reports.page.component';

describe('ReportsPage persisted report presentation', () => {
  const page = () => Object.create(ReportsPage.prototype) as ReportsPage;
  const panel = (report: any) => ({ key: 'reservas', title: 'Reservas', mesAno: '', de: '', ate: '', carroId: '', loading: false, error: null, report }) as any;

  it('excludes canceled reservations from conversion totals and formats the rate', () => {
    const component = page();
    const data = panel({
      mensalReceita: [],
      statusReservas: [
        { status: 'pendente', quantidade: '2', locacoes: '0' },
        { status: 'confirmada', quantidade: '3', locacoes: '3' },
        { status: 'cancelada', quantidade: '4', locacoes: '0' },
      ],
      reservasMensais: [], reservasPorVeiculoMes: [], revisoes: [], vistorias: [], veiculos: [],
    });
    expect(component.activeReservations(data)).toBe(5);
    expect(component.rentalCount(data)).toBe(3);
    expect(component.conversionRate(data)).toBe(60);
  });

  it('uses only approved receipt in revenue and separates pending amounts', () => {
    const component = page();
    const data = panel({
      mensalReceita: [
        { mes: '2026-01', recebido: '120.50', pendente: '80.00', pagamentosConfirmados: '2', locacoesPagas: '1' },
        { mes: '2026-02', recebido: '79.50', pendente: '20.00', pagamentosConfirmados: '1', locacoesPagas: '1' },
      ],
      statusReservas: [], reservasMensais: [], reservasPorVeiculoMes: [], revisoes: [], vistorias: [], veiculos: [],
    });
    expect(component.receivedTotal(data)).toBe(200);
    expect(component.pendingTotal(data)).toBe(100);
    expect(component.averageTicket(data)).toBe(100);
  });

  it('aggregates monthly reservations per vehicle and flags vehicles without reservations', () => {
    const component = page();
    const data = panel({
      mensalReceita: [], statusReservas: [], reservasMensais: [],
      reservasPorVeiculoMes: [
        { mes: '2026-01', carro_id: 1, marca: 'Marca', modelo: 'A', placa: 'AAA1234', quantidade: '2' },
        { mes: '2026-02', carro_id: 1, marca: 'Marca', modelo: 'A', placa: 'AAA1234', quantidade: '3' },
      ], revisoes: [], vistorias: [],
      veiculos: [
        { carro_id: 1, marca: 'Marca', modelo: 'A', placa: 'AAA1234', quilometragemAtual: 100 },
        { carro_id: 2, marca: 'Marca', modelo: 'B', placa: 'BBB1234', quilometragemAtual: 200 },
      ],
    });
    expect(component.vehicleRanking(data)[0].quantidade).toBe(5);
    expect(component.unusedVehicles(data).map(v => v.carro_id)).toEqual([2]);
  });

  it('loads each panel from the reports API with its own selected filters', async () => {
    const component = page();
    const data = panel(null);
    data.key = 'vistorias';
    data.de = '2026-01-01';
    data.ate = '2026-01-31';
    data.carroId = '8';
    const report = { mensalReceita: [], statusReservas: [], reservasMensais: [], reservasPorVeiculoMes: [], revisoes: [], vistorias: [], veiculos: [] };
    const get = vi.fn().mockReturnValue(of(report));
    const markForCheck = vi.fn();
    (component as any).http = { get };
    (component as any).apiUrl = 'http://localhost:3000/api';
    (component as any).changeDetector = { markForCheck };

    await component.load(data);

    expect(get).toHaveBeenCalledWith('http://localhost:3000/api/relatorios', { params: expect.anything() });
    expect(get.mock.calls[0][1].params.toString()).toBe('de=2026-01-01&ate=2026-01-31&carroId=8');
    expect(data.report).toBe(report);
    expect(data.loading).toBe(false);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('uses one API response to populate all five report containers initially', async () => {
    const component = page();
    const panels = [panel(null), panel(null), panel(null), panel(null), panel(null)];
    const report = { mensalReceita: [], statusReservas: [], reservasMensais: [], reservasPorVeiculoMes: [], revisoes: [], vistorias: [], veiculos: [] };
    const get = vi.fn().mockReturnValue(of(report));
    const markForCheck = vi.fn();
    (component as any).panels = panels;
    (component as any).http = { get };
    (component as any).apiUrl = 'http://localhost:3000/api';
    (component as any).changeDetector = { markForCheck };

    await component.loadInitialReports();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('http://localhost:3000/api/relatorios');
    expect(panels.every((item) => item.report === report && !item.loading && !item.error)).toBe(true);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('shows the API error on the report panel and schedules a view update', async () => {
    const component = page();
    const data = panel(null);
    const markForCheck = vi.fn();
    (component as any).http = { get: vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 404,
      error: { message: 'Endpoint de relatórios não encontrado.' },
    }))) };
    (component as any).apiUrl = 'http://localhost:3000/api';
    (component as any).changeDetector = { markForCheck };

    await component.load(data);

    expect(data.error).toBe('Endpoint de relatórios não encontrado.');
    expect(data.loading).toBe(false);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('keeps filter visibility independent between report cards', () => {
    const component = page();
    const revenue = { filtersOpen: false } as any;
    const reservations = { filtersOpen: false } as any;

    component.toggleFilters(revenue);
    expect(revenue.filtersOpen).toBe(true);
    expect(reservations.filtersOpen).toBe(false);
    component.toggleFilters(revenue);
    expect(revenue.filtersOpen).toBe(false);
  });

  it('navigates calendar months and years and sends a selected date interval', async () => {
    const component = page();
    const data = panel(null);
    Object.assign(data, { calendarYear: 2026, calendarMonth: 0, calendarTarget: 'de', calendarMode: 'days', calendarOpen: true });
    component.changeCalendarMonth(data, -1);
    expect([data.calendarYear, data.calendarMonth]).toEqual([2025, 11]);
    component.selectCalendarYear(data, 2024);
    expect(data.calendarYear).toBe(2024);
    expect(data.calendarMode).toBe('months');
    component.selectCalendarMonth(data, 1);
    expect(data.calendarMonth).toBe(1);
    component.selectCalendarDay(data, 29);
    expect(data.de).toBe('2024-02-29');

    component.openCalendar(data, 'ate');
    data.calendarYear = 2024;
    data.calendarMonth = 1;
    component.selectCalendarDay(data, 29);
    expect(data.ate).toBe('2024-02-29');
    expect(component.calendarDays(data).filter(day => day > 0)).toHaveLength(29);
  });
});
