import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-register-return',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CurrencyPipe],
  template: `
    <app-shell
      title="Registrar devolução"
      [back]="true"
      defaultHref="/admin/devolucoes"
      [showNav]="true"
      role="admin"
      activeTab="reservas"
    >
      @if (reservation; as r) {
        <div class="card">
          <h2>Locação #{{ r.id }}</h2>
          <div class="kv"><span>Cliente</span><b>{{ r.clientName }}</b></div>
          <div class="kv"><span>Veículo</span><b>{{ vehicle?.name }}</b></div>

          <label>Combustível</label>
          <select [(ngModel)]="fuel">
            <option value="Cheio">Cheio</option>
            <option value="1/4 (23%)">1/4 (23%)</option>
          </select>

          <label>Avarias</label>
          <select [(ngModel)]="damages">
            <option value="Nenhuma">Nenhuma</option>
            <option value="Leves">Leves</option>
            <option value="Graves">Graves</option>
          </select>

          <label>Multas (R$)</label>
          <input type="number" [(ngModel)]="fines" (ngModelChange)="fines = +$event || 0" />

          <label>Diárias adicionais</label>
          <select [ngModel]="extraDays" (ngModelChange)="extraDays = +$event">
            <option [ngValue]="0">0 dia(s)</option>
            <option [ngValue]="1">1 dia(s)</option>
            <option [ngValue]="2">2 dia(s)</option>
          </select>

          <div class="kv"><span>Valor da locação</span><b>{{ r.total | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Total final</span><b>{{ totalFinal | currency: 'BRL' }}</b></div>

          <button class="btn" type="button" (click)="confirm()">Finalizar devolução</button>
        </div>
      } @else {
        <div class="card empty">Nenhuma locação em andamento</div>
      }
    </app-shell>
  `,
})
export class RegisterReturnPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  fuel = 'Cheio';
  damages = 'Nenhuma';
  fines = 0;
  extraDays = 0;

  get reservation(): Reservation | undefined {
    return this.reservationService.getById(this.id);
  }

  get vehicle(): Vehicle | undefined {
    const reservation = this.reservation;
    return reservation ? this.reservationService.vehicleOf(reservation) : undefined;
  }

  get totalFinal(): number {
    const reservation = this.reservation;
    if (!reservation) {
      return 0;
    }
    const pricePerDay = this.vehicle?.pricePerDay ?? 0;
    return reservation.total + this.extraDays * pricePerDay + this.fines;
  }

  async confirm(): Promise<void> {
    await this.reservationService.registerReturn(this.id, this.extraDays, this.fines);
    await this.toast.show('Devolução finalizada');
    await this.router.navigate(['/admin/reservas'], { queryParams: { tab: 'Todas' } });
  }
}
