import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Transmission, VehicleCategory } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-new-vehicle',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  template: `
    <app-shell
      title="Cadastrar veículo"
      [back]="true"
      defaultHref="/admin/veiculos"
      [showNav]="true"
      role="admin"
      activeTab="veiculos"
    >
      <div class="card">
        <label>Modelo e ano</label>
        <input [(ngModel)]="name" placeholder="ex.: Renault Kwid 2022" autocomplete="off" />
        <label>Versão</label>
        <input [(ngModel)]="version" placeholder="1.0" autocomplete="off" />
        <label>Categoria</label>
        <select [(ngModel)]="category">
          <option value="Hatch">Hatch</option>
          <option value="SUV">SUV</option>
          <option value="Picape">Picape</option>
        </select>
        <label>Câmbio</label>
        <select [(ngModel)]="transmission">
          <option value="Manual">Manual</option>
          <option value="Automático">Automático</option>
        </select>
        <label>Diária (R$)</label>
        <input type="number" [(ngModel)]="pricePerDay" />
        <button class="btn" type="button" (click)="save()">Salvar veículo</button>
      </div>
    </app-shell>
  `,
})
export class NewVehiclePage {
  private readonly router = inject(Router);
  private readonly vehicleService = inject(VehicleService);
  private readonly toast = inject(ToastService);

  name = '';
  version = '';
  category: VehicleCategory = 'Hatch';
  transmission: Transmission = 'Manual';
  pricePerDay = 100;

  async save(): Promise<void> {
    if (!this.name) {
      await this.toast.show('Informe o modelo');
      return;
    }
    await this.vehicleService.add({
      name: this.name,
      version: this.version,
      category: this.category,
      transmission: this.transmission,
      pricePerDay: this.pricePerDay,
    });
    await this.toast.show('Veículo cadastrado');
    await this.router.navigateByUrl('/admin/veiculos');
  }
}
