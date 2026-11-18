import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, daysBetween, todayISO } from '../../core/data';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ClientService } from '../../core/services/client.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CarComponent, CurrencyPipe],
  template: `
    <app-shell title="Reserva do veículo" [back]="true" [defaultHref]="backHref">
      @if (vehicle; as v) {
        <div class="card row">
          <app-car [color]="v.color" />
          <div style="flex: 1">
            <b>{{ v.name }}</b>
            <div class="pr">{{ v.pricePerDay | currency: 'BRL' }} / diária</div>
          </div>
        </div>

        <div class="card">
          @if (isAdmin) {
            <label>Cliente</label>
            <select [ngModel]="clientName" (ngModelChange)="clientName = $event">
              @for (client of activeClients; track client.id) {
                <option [value]="client.name">{{ client.name }}</option>
              }
            </select>
          }

          <label>Data de retirada</label>
          <input type="date" [min]="today" [ngModel]="start" (ngModelChange)="onStartChange($event)" />

          <label>Data de devolução</label>
          <input type="date" [min]="minEnd" [ngModel]="end" (ngModelChange)="end = $event" />

          <label>Local de retirada</label>
          <select [ngModel]="location" (ngModelChange)="location = $event">
            @for (place of locations; track place) {
              <option [value]="place">{{ place }}</option>
            }
          </select>

          <div class="kv"><span>Período</span><b>{{ days }} diárias</b></div>
          <div class="kv"><span>Valor total</span><b>{{ total | currency: 'BRL' }}</b></div>

          <button class="btn" type="button" (click)="continueBooking()">Continuar</button>
        </div>
      } @else {
        <div class="card empty">Veículo não encontrado</div>
      }
    </app-shell>
  `,
})
export class ReservationFormPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly clientService = inject(ClientService);
  private readonly booking = inject(BookingService);
  private readonly toast = inject(ToastService);

  readonly isAdmin = this.auth.role() === 'admin';
  readonly today = todayISO();
  readonly locations = ['Loja Centro - Belford Roxo', 'Loja Nova Iguaçu'];
  readonly activeClients = this.clientService.activeClients();

  start = '';
  end = '';
  location = '';
  clientName = '';

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    if (this.booking.vehicleId() !== id) {
      this.booking.selectVehicle(id);
    }
    this.start = this.booking.start();
    this.end = this.booking.end();
    this.location = this.booking.location();
    this.clientName = this.booking.clientName() || this.activeClients[0]?.name || '';
  }

  get vehicle(): Vehicle | undefined {
    return this.booking.vehicle();
  }

  get backHref(): string {
    return this.isAdmin ? '/admin/reserva' : '/client/veiculos';
  }

  get minEnd(): string {
    return addDays(this.start, 1);
  }

  get days(): number {
    return daysBetween(this.start, this.end);
  }

  get total(): number {
    return this.days * (this.vehicle?.pricePerDay ?? 0);
  }

  onStartChange(value: string): void {
    this.start = value;
    if (this.end <= this.start) {
      this.end = addDays(this.start, 1);
    }
  }

  async continueBooking(): Promise<void> {
    if (!this.vehicle || this.vehicle.status !== 'Disponível') {
      await this.toast.show('Este veículo não está disponível para reserva');
      return;
    }
    if (this.end <= this.start) {
      await this.toast.show('A devolução deve ser depois da retirada');
      return;
    }
    this.booking.setDates(this.start, this.end);
    this.booking.setLocation(this.location);
    this.booking.setClientName(this.clientName);
    await this.router.navigateByUrl('/booking/confirmar');
  }
}
