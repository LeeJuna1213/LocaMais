import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-confirm-reservation',
  standalone: true,
  imports: [AppShellComponent, CarComponent, CurrencyPipe, DatePipe],
  template: `
    <app-shell title="Confirmar reserva" [back]="true" [defaultHref]="backHref">
      @if (booking.vehicle(); as vehicle) {
        <div class="card row">
          <app-car [color]="vehicle.color" />
          <b>{{ vehicle.name }}</b>
        </div>

        <div class="card">
          <div class="kv"><span>Cliente</span><b>{{ clientName }}</b></div>
          <div class="kv">
            <span>Retirada</span><b>{{ booking.start() | date: 'dd/MM/yyyy' }} · 10:00</b>
          </div>
          <div class="kv">
            <span>Devolução</span><b>{{ booking.end() | date: 'dd/MM/yyyy' }} · 10:00</b>
          </div>
          <div class="kv"><span>Local</span><b>{{ booking.location() }}</b></div>
          <div class="kv"><span>Diárias</span><b>{{ booking.days() }}</b></div>
          <div class="kv"><span>Valor total</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>

          <button class="btn" type="button" (click)="confirm()">Confirmar reserva</button>
          <button class="lnk dark" type="button" (click)="edit()">Voltar e editar</button>
        </div>
      } @else {
        <div class="card empty">Nenhuma reserva em andamento</div>
      }
    </app-shell>
  `,
})
export class ConfirmReservationPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly booking = inject(BookingService);

  readonly isAdmin = this.auth.role() === 'admin';

  get clientName(): string {
    return this.isAdmin ? this.booking.clientName() : this.auth.profile().name;
  }

  get backHref(): string {
    return `/booking/reservar/${this.booking.vehicleId() ?? 0}`;
  }

  ngOnInit(): void {
    if (!this.booking.vehicle()) {
      void this.router.navigateByUrl(this.auth.home());
    }
  }

  async confirm(): Promise<void> {
    await this.router.navigateByUrl('/booking/pagamento');
  }

  async edit(): Promise<void> {
    await this.router.navigate(['/booking/reservar', this.booking.vehicleId() ?? 0]);
  }
}
