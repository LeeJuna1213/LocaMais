import { CurrencyPipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppShellComponent } from '../../shared/components/app-shell.component';

type ReportKey = 'receita' | 'reservas' | 'veiculos' | 'revisoes' | 'vistorias';
interface ReportData {
  mensalReceita: Array<{ mes: string; recebido: number | string; pendente: number | string; pagamentosConfirmados: number | string; locacoesPagas: number | string }>;
  statusReservas: Array<{ status: string; quantidade: number | string; locacoes: number | string }>;
  reservasMensais: Array<{ mes: string; efetivadas: number | string; canceladas: number | string; pendentes: number | string; confirmadas: number | string; locacoes: number | string }>;
  reservasPorVeiculoMes: Array<{ mes: string; carro_id: number; marca: string; modelo: string; placa: string; quantidade: number | string }>;
  revisoes: Array<{ id: string; data: string; descricao: string; valor: number | string; km: number; carro_id: number; marca: string; modelo: string; placa: string }>;
  vistorias: Array<{ id: string; data: string; descricao: string | null; valor: number | string; km: number; carro_id: number; marca: string; modelo: string; placa: string; quilometragemAtual: number }>;
  veiculos: Array<{ carro_id: number; marca: string; modelo: string; placa: string; quilometragemAtual: number }>;
}
interface ReportPanel {
  key: ReportKey;
  title: string;
  mesAno: string;
  de: string;
  ate: string;
  carroId: string;
  loading: boolean;
  error: string | null;
  report: ReportData | null;
  vehicleOptions: ReportData['veiculos'];
  filtersOpen: boolean;
  calendarOpen: boolean;
  calendarMode: 'days' | 'months' | 'years';
  calendarYear: number;
  calendarMonth: number;
  calendarTarget: 'de' | 'ate';
}

@Component({
  selector: 'app-reports', standalone: true, imports: [AppShellComponent, CurrencyPipe, FormsModule],
  styles: [],
  template: `
    <app-shell title="Relatórios" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <div class="report-list">
        @for (panel of panels; track panel.key) {
          <section class="card report-card" [class.vehicle-report]="panel.key==='veiculos'" [attr.aria-labelledby]="'report-title-'+panel.key">
            <div class="report-heading"><h2 [id]="'report-title-'+panel.key">{{panel.title}}</h2>
              <button class="toggle-filters" type="button" [attr.aria-expanded]="panel.filtersOpen" [attr.aria-controls]="'filters-'+panel.key" (click)="toggleFilters(panel)">
                <svg class="filter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                {{panel.filtersOpen?'Ocultar filtros':'Filtros'}}
              </button>
            </div>
            <div class="filters-wrap" [class.open]="panel.filtersOpen" [attr.aria-hidden]="!panel.filtersOpen" [id]="'filters-'+panel.key">
              <div class="filters-inner"><div class="report-filters" [attr.aria-label]="'Filtros: '+panel.title">
              <div class="date-fields">
                <div><label [for]="'from-'+panel.key">Data inicial</label><button class="date-trigger" [id]="'from-'+panel.key" type="button" (click)="openCalendar(panel,'de')">{{panel.de?dateLabel(panel.de):'Selecionar data'}} <span aria-hidden="true">▦</span></button></div>
                <div><label [for]="'to-'+panel.key">Data final</label><button class="date-trigger" [id]="'to-'+panel.key" type="button" (click)="openCalendar(panel,'ate')">{{panel.ate?dateLabel(panel.ate):'Selecionar data'}} <span aria-hidden="true">▦</span></button></div>
              </div>
              @if (panel.calendarOpen) {
                <div class="calendar-panel"><div class="calendar" role="dialog" [attr.aria-label]="'Calendário de '+panel.title">
                  <div class="calendar-head"><button type="button" aria-label="Ano anterior" (click)="changeCalendarYear(panel,-1)">«</button><button type="button" aria-label="Mês anterior" (click)="changeCalendarMonth(panel,-1)">‹</button><button type="button" class="calendar-title" (click)="cycleCalendarMode(panel)">{{monthNames[panel.calendarMonth]}} {{panel.calendarYear}}</button><button type="button" aria-label="Próximo mês" (click)="changeCalendarMonth(panel,1)">›</button><button type="button" aria-label="Próximo ano" (click)="changeCalendarYear(panel,1)">»</button></div>
                  @if (panel.calendarMode==='days') {<div class="calendar-grid">@for (weekday of weekdays; track weekday) {<span class="calendar-weekday">{{weekday}}</span>}@for (day of calendarDays(panel); track $index) {<button type="button" [disabled]="day===0" [class.selected]="isSelectedDay(panel,day)" [class.in-range]="isInRange(panel,day)" (click)="selectCalendarDay(panel,day)">{{day||''}}</button>}</div>}
                  @else if (panel.calendarMode==='months') {<div class="month-grid">@for (month of monthNames; track $index) {<button type="button" [class.selected]="$index===panel.calendarMonth" (click)="selectCalendarMonth(panel,$index)">{{month}}</button>}</div>}
                  @else {<div class="month-grid">@for (year of calendarYears(panel); track year) {<button type="button" [class.selected]="year===panel.calendarYear" (click)="selectCalendarYear(panel,year)">{{year}}</button>}</div>}
                </div></div>
              }
              @if (panel.key==='veiculos' || panel.key==='revisoes' || panel.key==='vistorias') {
                <div><label [for]="'car-'+panel.key">Veículo</label><select [id]="'car-'+panel.key" [(ngModel)]="panel.carroId"><option value="">Todos</option>@for (v of panel.vehicleOptions; track v.carro_id) {<option [value]="v.carro_id">{{v.marca}} {{v.modelo}} · {{v.placa}}</option>}</select></div>
              }
              <button class="btn apply-filter" type="button" [disabled]="panel.loading" (click)="load(panel)">{{panel.loading?'Carregando...':'Aplicar filtros'}}</button>
            </div></div></div>
            @if (panel.error) {<div class="empty" role="alert">{{panel.error}}</div>}
            @else if (panel.loading || !panel.report) {<div class="empty" role="status">Carregando dados...</div>}
            @else {
              @if (panel.key==='receita') {
                <div class="metric-grid"><div class="metric"><span>Recebido no período</span><b>{{receivedTotal(panel)|currency:'BRL'}}</b></div><div class="metric"><span>Pagamentos confirmados</span><b>{{sum(panel.report.mensalReceita,'pagamentosConfirmados')}}</b></div><div class="metric"><span>Ticket médio por locação paga</span><b>{{averageTicket(panel)|currency:'BRL'}}</b></div><div class="metric"><span>Valores pendentes</span><b>{{pendingTotal(panel)|currency:'BRL'}}</b></div></div>
                @for (m of panel.report.mensalReceita; track m.mes) {<div class="report-row"><b>{{monthLabel(m.mes)}}</b><span>{{m.pagamentosConfirmados}} pagamentos confirmados · {{m.locacoesPagas}} locações pagas</span><div class="bar"><i [style.width.%]="barWidth(num(m.recebido),maxRevenue(panel))"></i></div><span>Recebido: {{num(m.recebido)|currency:'BRL'}} · Pendente: {{num(m.pendente)|currency:'BRL'}}</span></div>} @empty {<div class="empty">Sem pagamentos no período.</div>}
              }
              @if (panel.key==='reservas') {
                <div class="metric-grid"><div class="metric"><span>Total (não canceladas)</span><b>{{activeReservations(panel)}}</b></div><div class="metric"><span>Pendentes</span><b>{{statusCount(panel,'pendente')}}</b></div><div class="metric"><span>Confirmadas</span><b>{{statusCount(panel,'confirmada')}}</b></div><div class="metric"><span>Canceladas</span><b>{{statusCount(panel,'cancelada')}}</b></div><div class="metric"><span>Convertidas em locação</span><b>{{rentalCount(panel)}}</b></div><div class="metric"><span>Conversão</span><b>{{conversionRate(panel)}}%</b></div></div>
                 <div class="reservation-month-list">@for (m of panel.report.reservasMensais; track m.mes) {
                   <article class="reservation-month-item"><b>{{monthLabel(m.mes)}}</b>
                     <span>Efetivadas: {{m.efetivadas}}</span>
                     <div class="bar"><i [style.width.%]="barWidth(num(m.efetivadas),maxMonthlyReservations(panel))"></i></div>
                     <span>Pendentes: {{m.pendentes}}</span><span>Confirmadas: {{m.confirmadas}}</span>
                     <span>Canceladas: {{m.canceladas}}</span><span>Convertidas em locação: {{m.locacoes}}</span>
                   </article>
                 } @empty {<div class="empty">Sem reservas no período.</div>}</div>
              }
              @if (panel.key==='veiculos') {
                <h3>Reservas mensais por veículo</h3>
                <div class="vehicle-month-list">@for (r of panel.report.reservasPorVeiculoMes; track r.mes+r.carro_id) {
                  <article class="vehicle-month-item"><b>{{monthLabel(r.mes)}}</b><span>{{r.marca}} {{r.modelo}}</span><span>Placa: {{r.placa}}</span><span>{{r.quantidade}} reservas</span></article>
                } @empty {<div class="empty">Sem reservas por veículo no período.</div>}</div>
                <h3>Ranking do período</h3>@for (r of vehicleRanking(panel); track r.carro_id) {<div class="report-row"><b>{{r.marca}} {{r.modelo}} · {{r.placa}}</b><span>{{r.quantidade}} reservas</span><div class="bar"><i [style.width.%]="barWidth(r.quantidade,maxVehicleReservations(panel))"></i></div></div>} @empty {<div class="empty">Nenhuma reserva não cancelada no período.</div>}
                <h3>Veículos sem reservas</h3>@for (v of unusedVehicles(panel); track v.carro_id) {<div class="report-row">{{v.marca}} {{v.modelo}} · {{v.placa}}</div>} @empty {<div class="empty">Todos os veículos tiveram reservas no período.</div>}
              }
              @if (panel.key==='revisoes') {
                <div class="metric-grid"><div class="metric"><span>Custo total</span><b>{{revisionTotal(panel)|currency:'BRL'}}</b></div><div class="metric"><span>Revisões registradas</span><b>{{panel.report.revisoes.length}}</b></div><div class="metric"><span>Média por revisão</span><b>{{panel.report.revisoes.length?revisionTotal(panel)/panel.report.revisoes.length:0|currency:'BRL'}}</b></div></div><h3>Custos por veículo</h3>@for (r of revisionRanking(panel); track r.carro_id) {<div class="report-row"><b>{{r.marca}} {{r.modelo}} · {{r.placa}}</b><span>{{r.quantidade}} revisões · {{r.total|currency:'BRL'}}</span><div class="bar"><i [style.width.%]="barWidth(r.total,maxRevisionCost(panel))"></i></div></div>}<h3>Histórico</h3>@for (r of panel.report.revisoes; track r.id) {<div class="report-row"><b>{{dateLabel(r.data)}} · {{r.marca}} {{r.modelo}} · {{r.placa}}</b><span>{{r.descricao}} · {{r.km}} km · {{num(r.valor)|currency:'BRL'}}</span></div>} @empty {<div class="empty">Sem revisões registradas no período.</div>}
              }
              @if (panel.key==='vistorias') {
                <div class="metric-grid"><div class="metric"><span>Custo total</span><b>{{inspectionTotal(panel)|currency:'BRL'}}</b></div><div class="metric"><span>Vistorias concluídas</span><b>{{panel.report.vistorias.length}}</b></div></div><h3>Ranking de custos</h3>@for (r of inspectionRanking(panel); track r.carro_id) {<div class="report-row inspection-row"><b class="inspection-vehicle">{{r.marca}} {{r.modelo}} · {{r.placa}}</b><span class="inspection-cost">{{r.quantidade}} vistorias · {{r.total|currency:'BRL'}}</span><div class="bar"><i [style.width.%]="barWidth(r.total,maxInspectionCost(panel))"></i></div></div>}<h3>Histórico e quilometragem atual</h3>@for (r of panel.report.vistorias; track r.id) {<div class="report-row inspection-row"><b class="inspection-vehicle">{{dateLabel(r.data)}} · {{r.marca}} {{r.modelo}} · {{r.placa}}</b><span class="inspection-detail">{{r.descricao||'Sem descrição'}} · vistoria: {{r.km}} km · atual: {{r.quilometragemAtual}} km</span><b class="inspection-cost">{{num(r.valor)|currency:'BRL'}}</b></div>} @empty {<div class="empty">Sem vistorias periódicas concluídas no período.</div>}
              }
            }
          </section>
        }
      </div>
    </app-shell>
  `,
})
export class ReportsPage {
  private readonly http = inject(HttpClient);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  readonly panels: ReportPanel[] = [
    this.panel('receita','Receita mensal'), this.panel('reservas','Reservas'),
    this.panel('veiculos','Reservas por veículo (mês)'), this.panel('revisoes','Custos de revisões'),
    this.panel('vistorias','Custos de vistorias por veículo e quilometragem'),
  ];
  readonly weekdays = ['D','S','T','Q','Q','S','S'];
  readonly monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  constructor() {
    for (const panel of this.panels) panel.loading = true;
    void this.loadInitialReports();
  }
  private panel(key: ReportKey,title: string): ReportPanel { const now=new Date(); return {key,title,mesAno:'',de:'',ate:'',carroId:'',loading:false,error:null,report:null,vehicleOptions:[],filtersOpen:false,calendarOpen:false,calendarMode:'days',calendarYear:now.getFullYear(),calendarMonth:now.getMonth(),calendarTarget:'de'}; }
  async loadInitialReports(): Promise<void> {
    try {
      const report = await firstValueFrom(this.http.get<ReportData>(`${this.apiUrl}/relatorios`));
      for (const panel of this.panels) { panel.report=report; panel.vehicleOptions=report.veiculos; panel.error=null; }
    } catch (error) {
      const message = this.apiErrorMessage(error);
      for (const panel of this.panels) panel.error=message;
    } finally {
      for (const panel of this.panels) panel.loading=false;
      this.changeDetector.markForCheck();
    }
  }
  async load(panel: ReportPanel): Promise<void> {
    if (panel.de && panel.ate && panel.de > panel.ate) { panel.error='A data inicial não pode ser posterior à data final.'; return; }
    panel.loading=true; panel.error=null;
    try { let params=new HttpParams(); if(panel.de) params=params.set('de',panel.de); if(panel.ate) params=params.set('ate',panel.ate); if(panel.carroId) params=params.set('carroId',panel.carroId); panel.report=await firstValueFrom(this.http.get<ReportData>(`${this.apiUrl}/relatorios`,{params})); }
    catch (error) { panel.error=this.apiErrorMessage(error); }
    finally { panel.loading=false; this.changeDetector.markForCheck(); }
  }
  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const response = error.error as { message?: string } | string | null;
      const message = typeof response === 'string' ? response : response?.message;
      if (message) return message;
      if (error.status === 0) return `Não foi possível conectar à API em ${this.apiUrl}. Verifique se o backend está iniciado e se a URL pública da API está configurada.`;
      return `A API respondeu com erro ${error.status}.`;
    }
    return error instanceof Error ? error.message : 'Não foi possível carregar o relatório.';
  }
  toggleFilters(panel:ReportPanel):void { panel.filtersOpen=!panel.filtersOpen; }
  openCalendar(panel:ReportPanel,target:'de'|'ate'):void { panel.calendarTarget=target; const selected=target==='de'?panel.de:panel.ate; const date=selected?new Date(`${selected}T00:00:00`):new Date(); panel.calendarYear=date.getFullYear();panel.calendarMonth=date.getMonth();panel.calendarMode='days';panel.calendarOpen=true; }
  changeCalendarMonth(panel:ReportPanel,offset:number):void { const date=new Date(panel.calendarYear,panel.calendarMonth+offset,1);panel.calendarYear=date.getFullYear();panel.calendarMonth=date.getMonth(); }
  changeCalendarYear(panel:ReportPanel,offset:number):void { panel.calendarYear+=offset; }
  cycleCalendarMode(panel:ReportPanel):void {panel.calendarMode=panel.calendarMode==='days'?'months':panel.calendarMode==='months'?'years':'days';}
  calendarYears(panel:ReportPanel):number[]{const start=Math.floor(panel.calendarYear/12)*12;return Array.from({length:12},(_,index)=>start+index);}
  selectCalendarYear(panel:ReportPanel,year:number):void {panel.calendarYear=year;panel.calendarMode='months';}
  selectCalendarMonth(panel:ReportPanel,month:number):void { panel.calendarMonth=month;panel.calendarMode='days'; }
  calendarDays(panel:ReportPanel):number[]{const offset=new Date(panel.calendarYear,panel.calendarMonth,1).getDay();const count=new Date(panel.calendarYear,panel.calendarMonth+1,0).getDate();return [...Array(offset).fill(0),...Array.from({length:count},(_,i)=>i+1)];}
  selectCalendarDay(panel:ReportPanel,day:number):void {if(!day)return;const date=`${panel.calendarYear}-${String(panel.calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(panel.calendarTarget==='de'){panel.de=date;if(panel.ate&&panel.ate<date)panel.ate='';}else{panel.ate=date;if(panel.de&&date<panel.de)panel.de=date;}panel.calendarOpen=false;}
  isSelectedDay(panel:ReportPanel,day:number):boolean {const date=`${panel.calendarYear}-${String(panel.calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return day>0&&(date===panel.de||date===panel.ate);}
  isInRange(panel:ReportPanel,day:number):boolean {const date=`${panel.calendarYear}-${String(panel.calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return day>0&&!!panel.de&&!!panel.ate&&date>panel.de&&date<panel.ate;}
  num(value:number|string):number{return Number(value)||0;}
  sum(rows:Array<Record<string,number|string>>,key:string):number{return rows.reduce((n,row)=>n+this.num(row[key]),0);}
  receivedTotal(p:ReportPanel):number{return this.sum(p.report?.mensalReceita??[],'recebido');}
  pendingTotal(p:ReportPanel):number{return this.sum(p.report?.mensalReceita??[],'pendente');}
  averageTicket(p:ReportPanel):number{const count=this.sum(p.report?.mensalReceita??[],'locacoesPagas');return count?this.receivedTotal(p)/count:0;}
  maxRevenue(p:ReportPanel):number{return Math.max(1,...(p.report?.mensalReceita??[]).map(r=>this.num(r.recebido)));}
  statusCount(p:ReportPanel,status:string):number{return this.num(p.report?.statusReservas.find(r=>r.status===status)?.quantidade??0);}
  activeReservations(p:ReportPanel):number{return (p.report?.statusReservas??[]).filter(s=>s.status!=='cancelada').reduce((n,s)=>n+this.num(s.quantidade),0);}
  rentalCount(p:ReportPanel):number{return (p.report?.statusReservas??[]).reduce((n,s)=>n+this.num(s.locacoes),0);}
  conversionRate(p:ReportPanel):number{return this.activeReservations(p)?Math.round(this.rentalCount(p)/this.activeReservations(p)*100):0;}
  maxMonthlyReservations(p:ReportPanel):number{return Math.max(1,...(p.report?.reservasMensais??[]).map(r=>this.num(r.efetivadas)));}
  statusLabel(status:string):string{return ({pendente:'Pendentes',confirmada:'Confirmadas',cancelada:'Canceladas',concluida:'Concluídas'} as Record<string,string>)[status]??status;}
  vehicleRanking(p:ReportPanel){const map=new Map<number,{carro_id:number;marca:string;modelo:string;placa:string;quantidade:number}>();for(const r of p.report?.reservasPorVeiculoMes??[]){const v=map.get(r.carro_id)??{carro_id:r.carro_id,marca:r.marca,modelo:r.modelo,placa:r.placa,quantidade:0};v.quantidade+=this.num(r.quantidade);map.set(r.carro_id,v);}return [...map.values()].sort((a,b)=>b.quantidade-a.quantidade);}
  maxVehicleReservations(p:ReportPanel):number{return Math.max(1,...this.vehicleRanking(p).map(v=>v.quantidade));}
  unusedVehicles(p:ReportPanel){const used=new Set(this.vehicleRanking(p).map(v=>v.carro_id));return (p.report?.veiculos??[]).filter(v=>!used.has(v.carro_id));}
  private rankCosts(rows:Array<{carro_id:number;marca:string;modelo:string;placa:string;valor:number|string}>){const map=new Map<number,{carro_id:number;marca:string;modelo:string;placa:string;total:number;quantidade:number}>();for(const row of rows){const v=map.get(row.carro_id)??{carro_id:row.carro_id,marca:row.marca,modelo:row.modelo,placa:row.placa,total:0,quantidade:0};v.total+=this.num(row.valor);v.quantidade++;map.set(row.carro_id,v);}return [...map.values()].sort((a,b)=>b.total-a.total);}
  revisionRanking(p:ReportPanel){return this.rankCosts(p.report?.revisoes??[]);}
  inspectionRanking(p:ReportPanel){return this.rankCosts(p.report?.vistorias??[]);}
  revisionTotal(p:ReportPanel):number{return (p.report?.revisoes??[]).reduce((n,r)=>n+this.num(r.valor),0);}
  inspectionTotal(p:ReportPanel):number{return (p.report?.vistorias??[]).reduce((n,r)=>n+this.num(r.valor),0);}
  maxRevisionCost(p:ReportPanel):number{return Math.max(1,...this.revisionRanking(p).map(r=>r.total));}
  maxInspectionCost(p:ReportPanel):number{return Math.max(1,...this.inspectionRanking(p).map(r=>r.total));}
  barWidth(value:number,max:number):number{return Math.max(value?2:0,value/max*100);}
  monthLabel(value:string):string{const [year,month]=value.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));}
  dateLabel(value:string):string{const [year,month,day]=value.slice(0,10).split('-');return `${day}/${month}/${year}`;}
}
