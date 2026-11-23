import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ReservationQuote, ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';

registerLocaleData(localePtBr);

@Component({
  selector: 'app-confirm-reservation',
  standalone: true,
  imports: [AppShellComponent, CarComponent, CurrencyPipe, DatePipe],
  styles: [`.confirm-photo{width:100px;height:72px;object-fit:cover;border-radius:10px;flex:none}.vehicle-summary{align-items:center}.small{font-size:12px;color:#7a5a40}.financial-summary{margin-top:14px;padding-top:12px;border-top:1px solid #eadfd5}.financial-summary h3{margin:0 0 8px;font-size:15px}.financial-summary .grand-total{margin-top:8px;padding-top:10px;border-top:1px solid #eadfd5;font-size:17px}.financial-summary .grand-total b{font-size:20px;color:#c65308}`],
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
          <div class="kv"><span>Loja de retirada</span><b>{{ booking.location() || 'Não selecionada' }}</b></div>
          <section class="financial-summary" aria-labelledby="financial-summary-title">
            <h3 id="financial-summary-title">Resumo financeiro</h3>
            <div class="kv"><span>Período da reserva</span><b>{{ booking.start() | date: 'dd/MM/yyyy' }} a {{ booking.end() | date: 'dd/MM/yyyy' }}</b></div>
            @if (quoteLoading) { <div class="kv" role="status">Consultando valores...</div> }
            @else if (quoteError) { <div class="small" role="alert">{{ quoteError }}</div><button class="lnk dark" type="button" (click)="loadFee()">Tentar novamente</button> }
            @else if (quote; as values) {
              <div class="kv"><span>Quantidade de diárias</span><b>{{ values.diarias }} {{ values.diarias === 1 ? 'diária' : 'diárias' }}</b></div>
              <div class="kv"><span>Valor da diária</span><b>{{ values.valorDiaria | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv"><span>Subtotal das diárias</span><b>{{ values.valorSubtotal | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv"><span>Taxa de serviço</span><b>{{ values.taxaServico | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv grand-total"><span>Total da reserva</span><b>{{ values.valorTotal | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            }
          </section>

          <button class="btn" type="button" [disabled]="quoteLoading || !!quoteError || !quote" (click)="confirm()">Confirmar reserva</button>
          <button class="lnk dark" type="button" (click)="edit()">Voltar e editar</button>
        </div>
      } @else if (quoteLoading) {
        <div class="card empty" role="status">Carregando veículo e consultando valores...</div>
      } @else if (quoteError) {
        <div class="card empty" role="alert">{{ quoteError }}</div>
        <button class="btn" type="button" (click)="loadFee()">Tentar novamente</button>
      } @else {
        <div class="card empty">Nenhuma reserva em andamento</div>
      }
    </app-shell>
  `,
})
export class ConfirmReservationPage implements OnInit {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly booking = inject(BookingService);
  private readonly imageUrls = inject(ImageUrlService);
  private readonly vehicles = inject(VehicleService);
  private readonly reservations = inject(ReservationService);
  quote: ReservationQuote | null = null;
  quoteLoading = true;
  quoteError: string | null = null;
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
    if (!this.booking.vehicleId()) {
      void this.router.navigateByUrl(this.auth.home());
      return;
    }
    void this.loadFee();
  }

  async loadFee(): Promise<void> {
    const vehicleId = this.booking.vehicleId();
    if (!vehicleId) return;
    this.quoteLoading = true;
    this.quoteError = null;
    this.quote = null;
    this.booking.setQuotedServiceFee(null);
    try {
      if (!this.booking.vehicle()) await this.vehicles.loadOne(vehicleId);
      this.quote = await this.reservations.quote({ vehicleId, start: this.booking.start(), end: this.booking.end(), pickupTime: this.booking.pickupTime(), returnTime: this.booking.returnTime() });
      this.booking.setQuotedServiceFee(this.quote.taxaServico);
    } catch (error) {
      this.quoteError = error instanceof Error ? error.message : 'Não foi possível consultar os valores.';
    } finally {
      this.quoteLoading = false;
      // The app runs without Zone.js; refresh the view after the async quote.
      this.changeDetector.markForCheck();
    }
  }

  async confirm(): Promise<void> {
    await this.router.navigateByUrl('/booking/pagamento');
  }

  async edit(): Promise<void> {
    await this.router.navigate(['/booking/reservar', this.booking.vehicleId() ?? 0]);
  }
}
