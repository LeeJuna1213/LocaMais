import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePtBr from '@angular/common/locales/pt';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ImageUrlService } from '../../core/services/image-url.service';
import { AvailabilityAlternative, ReservationAvailability, ReservationQuote, ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { ApiSessionStore } from '../../core/services/api-session.store';
import { ToastService } from '../../core/services/toast.service';

registerLocaleData(localePtBr);

@Component({
  selector: 'app-confirm-reservation',
  standalone: true,
  imports: [AppShellComponent, CarComponent, CurrencyPipe, DatePipe],
  styles: [`.confirm-photo{width:100px;height:72px;object-fit:cover;border-radius:10px;flex:none}.vehicle-summary{align-items:center}.small{font-size:12px;color:#7a5a40}.financial-summary{margin-top:14px;padding-top:12px;border-top:1px solid #eadfd5}.financial-summary h3{margin:0 0 8px;font-size:15px}.financial-summary .grand-total{margin-top:8px;padding-top:10px;border-top:1px solid #eadfd5;font-size:17px}.financial-summary .grand-total b{font-size:20px;color:#c65308}.availability{box-sizing:border-box;margin:12px 0;padding:12px;border:1px solid #e8d8c8;border-radius:12px;overflow-wrap:anywhere;background:#fff6ef}.availability-list{display:grid;gap:8px;margin-top:10px}.availability-choice{box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;max-width:100%;padding:9px 10px;border:1px solid #eadfd5;border-radius:10px;background:#fff;color:inherit;text-align:left}.availability-choice span{min-width:0;overflow-wrap:anywhere}@media(min-width:720px){.availability-list{grid-template-columns:repeat(2,minmax(0,1fr))}}`],
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
            @else if (quoteError) { <div class="availability" role="alert">{{ quoteError }}
              @if (availability?.dependeDeDevolucao) { <p>Este veículo está atualmente em locação. A disponibilidade dependerá da devolução efetiva e da liberação do veículo.</p> }
              @if (availability?.alternativas?.length) { <b>Outros períodos disponíveis</b><div class="availability-list">@for (alternative of availability!.alternativas; track alternative.dataRetirada) { <button class="availability-choice" type="button" (click)="selectAlternative(alternative)"><span>{{ alternative.dataRetirada | date:'dd/MM/yyyy HH:mm' }} — {{ alternative.dataDevolucao | date:'dd/MM/yyyy HH:mm' }}</span><span>Selecionar</span></button> }</div> }
              @else if (availability && !availability.dependeDeDevolucao && !availability.disponivel) { <p>Não há alternativas dentro dos próximos {{ availability.horizonteAlternativasDias }} dias.</p> }
            </div><button class="lnk dark" type="button" (click)="loadFee()">Consultar novamente</button> }
            @else if (quote; as values) {
              <div class="kv"><span>Quantidade de diárias</span><b>{{ values.diarias }} {{ values.diarias === 1 ? 'diária' : 'diárias' }}</b></div>
              <div class="kv"><span>Valor da diária</span><b>{{ values.valorDiaria | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv"><span>Subtotal das diárias</span><b>{{ values.valorSubtotal | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv"><span>Taxa de serviço</span><b>{{ values.taxaServico | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
              <div class="kv grand-total"><span>Total da reserva</span><b>{{ values.valorTotal | currency: 'BRL':'symbol':'1.2-2':'pt-BR' }}</b></div>
            }
          </section>

          <button class="btn" type="button" [disabled]="quoteLoading || !!quoteError || !quote || saving" (click)="confirm()">{{ saving ? 'Registrando reserva...' : 'Confirmar reserva' }}</button>
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
  private readonly session = inject(ApiSessionStore);
  private readonly toast = inject(ToastService);
  saving = false;
  quote: ReservationQuote | null = null;
  quoteLoading = true;
  quoteError: string | null = null;
  availability: ReservationAvailability | null = null;
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
      const input = { vehicleId, start: this.booking.start(), end: this.booking.end(), pickupTime: this.booking.pickupTime(), returnTime: this.booking.returnTime() };
      this.availability = await this.reservations.checkAvailability(input);
      if (!this.availability.disponivel) {
        this.quoteError = this.availability.dependeDeDevolucao
          ? 'A disponibilidade depende da devolução efetiva deste veículo.'
          : this.availability.motivo === 'conflito'
            ? 'Este veículo não está disponível para o período selecionado, pois já possui uma reserva nesse intervalo.'
            : this.availability.motivo === 'manutencao'
              ? 'Este veículo está em manutenção.'
              : 'Este veículo possui outro impedimento operacional.';
        return;
      }
      this.quote = await this.reservations.quote(input);
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
    if (this.saving || !this.quote) return;
    const vehicle = this.booking.vehicle();
    if (!vehicle) return;
    const clientId = this.isStaff ? this.booking.clientId?.() : this.session.user()?.client?.id;
    if (!clientId) {
      await this.toast.show('Não foi possível identificar o cliente da reserva.');
      return;
    }
    const pickupShopId = this.booking.pickupShopId();
    if (!pickupShopId) {
      await this.toast.show('Selecione uma loja ativa para retirada.');
      return;
    }
    this.saving = true;
    try {
      const input = { vehicleId: vehicle.id, start: this.booking.start(), end: this.booking.end(), pickupTime: this.booking.pickupTime(), returnTime: this.booking.returnTime() };
      this.availability = await this.reservations.checkAvailability(input);
      if (!this.availability.disponivel) {
        await this.loadFee();
        return;
      }
      this.quote = await this.reservations.quote(input);
      const reservation = await this.reservations.create({
        clientId,
        vehicleId: vehicle.id,
        start: this.booking.start(),
        end: this.booking.end(),
        pickupTime: this.booking.pickupTime(),
        returnTime: this.booking.returnTime(),
        pickupShopId,
        quotedServiceFee: this.quote.taxaServico,
      });
      this.booking.setCreatedReservation(reservation);
      if (this.isStaff) await this.router.navigateByUrl('/admin/reservas');
      else await this.router.navigate(['/booking/pagamento'], { queryParams: { id: reservation.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível criar a reserva.';
      if (/409|conflito|indispon.vel|disponibilidade/i.test(message)) {
        this.quoteError = 'O período acabou de ficar indisponível. Consultando alternativas atualizadas…';
        await this.loadFee();
        if (!this.availability || this.availability.disponivel) this.quoteError = message;
      } else await this.toast.show(message);
    } finally { this.saving = false; }
  }

  async selectAlternative(alternative: AvailabilityAlternative): Promise<void> {
    const start = new Date(alternative.dataRetirada);
    const end = new Date(alternative.dataDevolucao);
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const localTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    this.booking.setDates(localDate(start), localDate(end));
    this.booking.setTimes(localTime(start), localTime(end));
    await this.loadFee();
  }

  async edit(): Promise<void> {
    await this.router.navigate(['/booking/reservar', this.booking.vehicleId() ?? 0]);
  }
}
