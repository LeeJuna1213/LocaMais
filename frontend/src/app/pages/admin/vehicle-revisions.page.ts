import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { todayISO } from '../../core/data';
import { Vehicle, VehicleStatus } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-vehicle-revisions',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CarComponent, DatePipe],
  template: `
    <app-shell
      title="Revisões e status"
      [back]="true"
      defaultHref="/admin/veiculos"
      [showNav]="true"
      role="admin"
      activeTab="veiculos"
    >
      @if (vehicle; as v) {
        <div class="card row">
          <app-car [color]="v.color" />
          <b>{{ v.name }}</b>
        </div>

        <div class="card">
          <label>Status do veículo</label>
          <select [ngModel]="v.status" (ngModelChange)="changeStatus($event)">
            <option value="Disponível">Disponível</option>
            <option value="Alugado">Alugado</option>
            <option value="Em manutenção">Em manutenção</option>
          </select>
        </div>

        <div class="card">
          <b>Histórico</b>
          @for (revision of v.revisions; track revision.date + revision.description) {
            <div class="kv">
              <span>{{ revision.date | date: 'dd/MM/yyyy' }} · {{ revision.km }}</span>
              <b>{{ revision.description }}</b>
            </div>
          } @empty {
            <div style="font-size: 13px">Sem revisões</div>
          }
        </div>

        <div class="card">
          <label>Quilometragem</label>
          <input [(ngModel)]="km" placeholder="ex.: 15.000 km" autocomplete="off" />
          <label>Descrição</label>
          <input [(ngModel)]="description" placeholder="ex.: Revisão periódica" autocomplete="off" />
          <button class="btn" type="button" (click)="addRevision()">Adicionar revisão</button>
        </div>
      } @else {
        <div class="card empty">Veículo não encontrado</div>
      }
    </app-shell>
  `,
})
export class VehicleRevisionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly vehicleService = inject(VehicleService);
  private readonly toast = inject(ToastService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  km = '';
  description = '';

  get vehicle(): Vehicle | undefined {
    return this.vehicleService.getById(this.id);
  }

  async changeStatus(status: VehicleStatus): Promise<void> {
    await this.vehicleService.setStatus(this.id, status);
    await this.toast.show('Status atualizado');
  }

  async addRevision(): Promise<void> {
    if (!this.description) {
      await this.toast.show('Descreva a revisão');
      return;
    }
    await this.vehicleService.addRevision(this.id, {
      date: todayISO(),
      km: this.km || '—',
      description: this.description,
    });
    this.km = '';
    this.description = '';
    await this.toast.show('Revisão registrada');
  }
}
