import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-register-pickup',
  standalone: true,
  imports: [FormsModule, AppShellComponent, DatePipe],
  template: `
    <app-shell
      title="Registrar retirada"
      [back]="true"
      defaultHref="/admin/locacoes"
      [showNav]="true"
      role="admin"
      activeTab="reservas"
    >
      @if (reservation; as r) {
        <div class="card">
          <h2>Reserva #{{ r.id }}</h2>
          <div class="kv"><span>Cliente</span><b>{{ r.clientName }}</b></div>
          <div class="kv"><span>Veículo</span><b>{{ vehicle?.name }}</b></div>
          <div class="kv">
            <span>Período</span><b>{{ r.start | date: 'dd/MM/yyyy' }} - {{ r.end | date: 'dd/MM/yyyy' }}</b>
          </div>

          <label>Vistoria inicial</label>
          <select [(ngModel)]="inspection">
            <option value="OK">OK</option>
            <option value="Com observações">Com observações</option>
          </select>

          <label>Quilometragem</label>
          <input [(ngModel)]="km" autocomplete="off" />

          <label>Combustível</label>
          <select [(ngModel)]="fuel">
            <option value="Cheio">Cheio</option>
            <option value="3/4">3/4</option>
            <option value="1/2">1/2</option>
          </select>

          <label>Caução / sinal</label>
          <input [(ngModel)]="deposit" autocomplete="off" />

          <button class="btn" type="button" (click)="confirm()">Confirmar retirada</button>
        </div>
      } @else {
        <div class="card empty">Nenhuma reserva aguardando retirada</div>
      }
    </app-shell>
  `,
})
export class RegisterPickupPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  inspection = 'OK';
  km = '12.350';
  fuel = 'Cheio';
  deposit = 'R$ 500,00';

  get reservation(): Reservation | undefined {
    return this.reservationService.getById(this.id);
  }

  get vehicle(): Vehicle | undefined {
    const reservation = this.reservation;
    return reservation ? this.reservationService.vehicleOf(reservation) : undefined;
  }

  async confirm(): Promise<void> {
    await this.reservationService.registerPickup(this.id);
    await this.toast.show('Retirada registrada');
    await this.router.navigate(['/admin/reservas'], { queryParams: { tab: 'Em andamento' } });
  }
}
