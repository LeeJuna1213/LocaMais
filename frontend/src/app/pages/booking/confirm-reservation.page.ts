import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ImageUrlService } from '../../core/services/image-url.service';

@Component({
  selector: 'app-confirm-reservation',
  standalone: true,
  imports: [AppShellComponent, CarComponent, CurrencyPipe, DatePipe],
  styles: [`.confirm-photo{width:100px;height:72px;object-fit:cover;border-radius:10px;flex:none}.vehicle-summary{align-items:center}.small{font-size:12px;color:#7a5a40}`],
  template: `
    <app-shell title="Confirmar reserva" [back]="true" [defaultHref]="backHref">
      @if (booking.vehicle(); as vehicle) {
        <div class="card row vehicle-summary">
          @if (vehiclePhoto; as photo) { <img class="confirm-photo" [src]="photo" [alt]="'Foto de ' + vehicle.name" (error)="photoFailed = true" /> }
          @else { <app-car [color]="vehicle.color" /> }
          <div><b>{{ vehicle.name }}</b><div class="small">{{ vehicle.version }}</div></div>
        </div>

        <div class="card">
          <div class="kv"><span>Cliente</span><b>{{ clientName }}</b></div>
          <div class="kv">
            <span>Data de retirada</span><b>{{ booking.start() | date: 'dd/MM/yyyy' }}</b>
          </div>
          <div class="kv"><span>Horário de retirada</span><b>{{ booking.pickupTime() }}</b></div>
          <div class="kv">
            <span>Data de devolução</span><b>{{ booking.end() | date: 'dd/MM/yyyy' }}</b>
          </div>
          <div class="kv"><span>Horário de devolução</span><b>{{ booking.returnTime() }}</b></div>
          <div class="kv"><span>Local</span><b>{{ booking.location() }}</b></div>
          <div class="kv"><span>Diárias</span><b>{{ booking.days() }}</b></div>
          <div class="kv"><span>Subtotal de diárias</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Taxa de serviço</span><b>Informada pela API ao confirmar</b></div>

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
  private readonly imageUrls = inject(ImageUrlService);
  photoFailed = false;

  get vehiclePhoto(): string | null {
    return this.photoFailed ? null : this.imageUrls.resolve(this.booking.vehicle()?.photo);
  }

  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';

  get clientName(): string {
    return this.isStaff ? this.booking.clientName() : this.auth.profile().name;
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
