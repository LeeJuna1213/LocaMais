import { CurrencyPipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { todayISO } from '../../core/data';
import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { VehicleInspectionService } from '../../core/services/vehicle-inspection.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-vehicle-inspections',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CarComponent, CurrencyPipe],
  styles: [`
    .inspection-photo { width:100%;height:180px;object-fit:cover;border-radius:14px; }
    .inspection-form-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px; }
    .inspection-description { grid-column:1/-1; }
    .inspection-actions { display:flex;gap:8px;flex-wrap:wrap;margin-top:10px; }
    input[type="number"] { color-scheme:light; }
    input[type="number"]::-webkit-inner-spin-button,input[type="number"]::-webkit-outer-spin-button { opacity:1;filter:grayscale(1); }
    .due { color:#9a3f06;font-weight:700; }
    @media(max-width:520px) { .inspection-form-grid { grid-template-columns:minmax(0,1fr); }.inspection-description { grid-column:auto; } }
  `],
  template: `
    <app-shell title="Vistorias do veículo" [back]="true" defaultHref="/admin/veiculos" [showNav]="true" role="admin" activeTab="veiculos">
      @if (vehicleService.loading()) { <div class="card empty" role="status">Carregando veículo...</div> }
      @else if (vehicleService.error(); as error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="loadVehicle()">Tentar novamente</button> }
      @else if (vehicle; as v) {
        <div class="card">
          <div class="big"><app-car [color]="v.color" [fluid]="true" /></div>
          <h2>{{ v.make }} {{ v.model }} {{ v.year }}</h2>
          <div class="kv"><span>Placa</span><b>{{ v.plate }}</b></div>
          <div class="kv"><span>Quilometragem atual</span><b>{{ v.mileage ?? 0 }} km</b></div>
          <div class="kv"><span>Próxima vistoria</span><b>{{ v.nextInspectionKm === null || v.nextInspectionKm === undefined ? 'Não configurada' : (v.nextInspectionKm + ' km') }}</b></div>
          <div [class.due]="v.inspectionDue">Situação: {{ v.inspectionDue ? 'Vistoria pendente' : 'Em dia' }}</div>
        </div>
        <div class="card">
          <b>Histórico de vistorias</b>
          @if (inspectionService.loading()) { <div class="small muted" role="status">Carregando histórico...</div> }
          @else if (inspectionService.error(); as error) { <div class="small" role="alert">{{ error }}</div><button class="btn" type="button" (click)="loadHistory()">Tentar novamente</button> }
          @else {
            @for (item of inspectionService.items(); track item.id) {
              <article class="card">
                <div class="kv"><span>{{ formatDate(item.data) }}</span><b>{{ item.km }} km</b></div>
                <p>{{ item.observacoes }}</p>
                <div class="kv"><span>Custo da vistoria</span><b>{{ item.valor | currency:'BRL' }}</b></div>
              </article>
            } @empty { <div class="small muted">Nenhuma vistoria periódica registrada.</div> }
          }
        </div>
        <form class="card" #form="ngForm" (ngSubmit)="save()">
          <b>Registrar vistoria concluída</b>
          <div class="inspection-form-grid">
            <div><label for="inspection-date">Data da vistoria</label><input id="inspection-date" name="data" type="date" [(ngModel)]="data" required /></div>
            <div class="inspection-description"><label for="inspection-description">Descrição</label><textarea id="inspection-description" name="descricao" [(ngModel)]="descricao" rows="4" maxlength="2000" required placeholder="Inspeções realizadas, condições e problemas encontrados"></textarea></div>
            <div><label for="inspection-price">Preço (R$)</label><input id="inspection-price" name="valor" type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="valor" required /></div>
            <div><label for="inspection-km">Quilometragem da vistoria (km)</label><input id="inspection-km" name="km" type="number" inputmode="numeric" min="0" step="1" [(ngModel)]="km" required /></div>
            <div class="inspection-description"><label for="inspection-next-km">Próxima quilometragem limite (km)</label><input id="inspection-next-km" name="proximaVistoriaKm" type="number" inputmode="numeric" min="0" step="1" [(ngModel)]="proximaVistoriaKm" required /><small class="muted">Defina o próximo limite individual; ele deve ser maior que a quilometragem desta vistoria.</small></div>
          </div>
          <div class="inspection-actions"><button class="btn" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Salvando...' : 'Registrar vistoria' }}</button><button class="lnk dark" type="button" [disabled]="saving" (click)="clear()">Limpar</button></div>
        </form>
      } @else { <div class="card empty">Veículo não encontrado</div> }
    </app-shell>
  `,
})
export class VehicleInspectionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly vehicleService = inject(VehicleService);
  readonly inspectionService = inject(VehicleInspectionService);
  readonly id = Number(this.route.snapshot.paramMap.get('id'));

  data = todayISO();
  descricao = '';
  valor: number | null = null;
  km: number | null = null;
  proximaVistoriaKm: number | null = null;
  saving = false;

  constructor() { void this.loadVehicle(); void this.loadHistory(); }

  get vehicle(): Vehicle | undefined { return this.vehicleService.getById(this.id); }

  async loadVehicle(): Promise<void> {
    try { await this.vehicleService.loadOne(this.id); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo.'); }
  }

  async loadHistory(): Promise<void> { await this.inspectionService.loadByVehicle(this.id); }

  /** Datas de vistoria são datas civis: não devem retroceder um dia por fuso horário. */
  formatDate(value: string): string {
    const date = value.slice(0, 10);
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  async save(): Promise<void> {
    if (this.saving || !this.vehicle) return;
    if (!this.descricao.trim() || !this.data || this.valor === null || this.valor < 0
      || this.km === null || !Number.isInteger(this.km) || this.km < (this.vehicle.mileage ?? 0)
      || this.proximaVistoriaKm === null || !Number.isInteger(this.proximaVistoriaKm) || this.proximaVistoriaKm <= this.km) {
      await this.toast.show('Verifique os dados: a quilometragem não pode retroceder e o próximo limite deve ser maior.');
      return;
    }
    this.saving = true;
    try {
      await this.inspectionService.create({
        carroId: this.id, data: this.data, descricao: this.descricao.trim(), valor: Number(this.valor),
        km: this.km, proximaVistoriaKm: this.proximaVistoriaKm,
      });
      await Promise.all([this.loadHistory(), this.loadVehicle()]);
      this.clear();
      await this.toast.show('Vistoria registrada e próximo limite atualizado.');
    } catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível registrar a vistoria.'); }
    finally { this.saving = false; this.changeDetector.markForCheck(); }
  }

  clear(): void {
    this.data = todayISO(); this.descricao = ''; this.valor = null; this.km = null;
    this.proximaVistoriaKm = null; this.changeDetector.markForCheck();
  }
}
