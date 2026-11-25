import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, todayISO } from '../../core/data';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ClientService } from '../../core/services/client.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ShopService } from '../../core/services/shop.service';
import { ReservationAvailability, ReservationQuote, ReservationService } from '../../core/services/reservation.service';

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CarComponent, CurrencyPipe, DatePipe],
  styles: [`
    .reservation-photo { display:block;width:104px;height:76px;object-fit:cover;border-radius:12px;flex:none }
    .pickup-shop-list { display:grid;gap:8px;width:100%;margin:8px 0 12px; }
    .pickup-shop-option { box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:10px;border:1px solid #eadfd5;border-radius:10px;background:#fff;cursor:pointer; }
    .pickup-shop-option input { flex:none;width:18px;height:18px;margin:0;padding:0;background-color:#fff;color-scheme:light;appearance:auto;-webkit-appearance:checkbox;accent-color:#e86f12; }
    .pickup-shop-option span { min-width:0; }
    .pickup-shop-option small { display:block;margin-top:3px;color:#7a5a40; }
    .availability { margin:12px 0; padding:12px; border:1px solid #e8d8c8; border-radius:12px; overflow-wrap:anywhere; }
    .availability[ data-state="available"] { background:#f1f8f2; border-color:#c7dfca; }
    .availability[ data-state="unavailable"] { background:#fff6ef; border-color:#edc9ad; }
    .availability-options { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; width:100%; max-width:100%; min-width:0; margin-top:10px; }
    .availability-option { box-sizing:border-box; display:flex; flex-direction:column; align-items:flex-start; gap:5px; width:100%; min-width:0; max-width:100%; padding:10px; border:1px solid #eadfd5; border-radius:10px; background:#fff; color:inherit; text-align:left; }
    .availability-option span { max-width:100%; white-space:nowrap; }
    .availability-option .period-action { margin-top:2px; color:#a04b0c; font-size:12px; font-weight:700; }
    input, select, button { box-sizing:border-box; max-width:100%; }
  `],
  template: `
    <app-shell title="Reserva do veículo" [back]="true" [defaultHref]="backHref">
      @if (isStaff && clientService.loading()) {
        <div class="card empty" role="status">Carregando clientes...</div>
      } @else if (isStaff && clientService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else if (vehicle; as v) {
        <div class="card row">
          @if (vehiclePhoto; as src) { <img class="reservation-photo" [src]="src" [alt]="'Foto de ' + v.name" /> } @else { <app-car [color]="v.color" /> }
          <div style="flex: 1">
            <b>{{ v.name }}</b>
            <div class="pr">{{ v.pricePerDay | currency: 'BRL' }} / diária</div>
          </div>
        </div>

        <div class="card">
          @if (isStaff) {
            <label for="reservation-client">Cliente *</label>
            <select id="reservation-client" [ngModel]="selectedClientId" (ngModelChange)="selectClient($event)" required>
              <option [ngValue]="null" disabled>Selecione o cliente</option>
              @for (client of activeClients(); track client.id) {
                <option [ngValue]="client.id">{{ client.name }}</option>
              }
            </select>
          }

          <label>Data de retirada</label>
          <input type="date" [min]="today" [ngModel]="start" (ngModelChange)="onStartChange($event)" />
          <label>Horário de retirada</label>
          <input type="time" [ngModel]="pickupTime" (ngModelChange)="pickupTime = $event; scheduleAvailability()" />

          <label>Data de devolução</label>
          <input type="date" [min]="start" [ngModel]="end" (ngModelChange)="end = $event; scheduleAvailability()" />
          <label>Horário de devolução</label>
          <input type="time" [ngModel]="returnTime" (ngModelChange)="returnTime = $event; scheduleAvailability()" />

          @if (availabilityLoading) { <div class="availability" role="status">Consultando disponibilidade...</div> }
          @else if (availabilityError) { <div class="availability" role="alert">{{ availabilityError }}</div> }
          @else if (availability; as result) {
            <section class="availability" [attr.data-state]="result.disponivel ? 'available' : 'unavailable'" aria-live="polite">
              @if (result.disponivel) { <b>Veículo disponível para o período selecionado.</b> }
              @else {
                <b>Este veículo não está disponível para o período selecionado.</b>
                @if (result.dependeDeDevolucao) { <p>Este veículo está atualmente em locação. A disponibilidade dependerá da devolução efetiva e da liberação do veículo.</p> }
                @else if (result.motivo === 'conflito') { <p>Já existe uma reserva válida nesse intervalo.</p> }
                @else if (result.motivo === 'manutencao') { <p>O veículo está em manutenção.</p> }
                @else { <p>Existe outro impedimento operacional para este veículo.</p> }
                @if (result.alternativas.length) {
                  <b>Outros períodos disponíveis</b>
                  <div class="availability-options">
                    @for (alternative of result.alternativas; track alternative.dataRetirada) {
                      <button class="availability-option" type="button" (click)="selectAlternative(alternative)">
                        <span>{{ alternative.dataRetirada | date:'dd/MM/yyyy HH:mm' }}</span>
                        <span>até {{ alternative.dataDevolucao | date:'dd/MM/yyyy HH:mm' }}</span>
                        <span class="period-action">Selecionar período</span>
                      </button>
                    }
                  </div>
                } @else if (!result.dependeDeDevolucao) { <p>Não há alternativas dentro dos próximos {{ result.horizonteAlternativasDias }} dias.</p> }
              }
            </section>
          }

            @if (shops.loading()) { <div class="small muted" role="status">Carregando lojas...</div> }
            @else if (shops.error(); as shopError) { <div class="small" role="alert">{{ shopError }}</div><button class="lnk dark" type="button" (click)="loadShops()">Tentar novamente</button> }
            @else {
              @if (!shops.shops().length) { <div class="small" role="alert">Este veículo ainda não está associado a nenhuma loja disponível. Entre em contato com a equipe LocaMais.</div> }
              <div id="pickup-shop-label">Loja de retirada *</div>
              <div class="pickup-shop-list" role="group" aria-labelledby="pickup-shop-label">
                @for (shop of shops.shops(); track shop.id) {
                  <label class="pickup-shop-option">
                    <input type="checkbox" [checked]="selectedShopId === shop.id" [disabled]="shops.loading()" [attr.aria-label]="'Retirar em ' + shop.nome" (change)="togglePickupShop(shop.id, $event)" />
                    <span><b>{{ shop.nome }}</b><small>{{ shop.cidade }}/{{ shop.uf }}</small></span>
                  </label>
                }
              </div>
           }

          <div class="kv"><span>Período</span><b>{{ days }} diárias</b></div>
          <div class="kv"><span>Valor total estimado</span><b>{{ availability?.disponivel === false ? '—' : (estimate?.valorTotal ?? total | currency: 'BRL') }}</b></div>

          <button class="btn" type="button" [disabled]="availabilityLoading || shops.loading() || !shops.shops().length || availabilityError !== null || availability?.disponivel === false" (click)="continueBooking()">Continuar</button>
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
  readonly clientService = inject(ClientService);
  private readonly vehicleService = inject(VehicleService);
  private readonly booking = inject(BookingService);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(AlertController);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly reservations = inject(ReservationService);
  private readonly imageUrls = inject(ImageUrlService);
  readonly shops = inject(ShopService);

  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';
  readonly today = todayISO();
  readonly activeClients = this.clientService.activeClients;

  start = '';
  end = '';
  location = '';
  clientName = '';
  selectedClientId: number | null = null;
  selectedShopId: number | null = null;
  pickupTime = '10:00';
  returnTime = '10:00';
  availability: ReservationAvailability | null = null;
  availabilityLoading = false;
  availabilityError: string | null = null;
  estimate: ReservationQuote | null = null;
  private availabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private availabilityRequest = 0;
  private shopRequest = 0;

  constructor() {
    if (this.isStaff) void this.loadClients();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.loadVehicleForRoute(Number(params.get('id') ?? 0));
    });
    this.start = this.booking.start();
    this.end = this.booking.end();
    this.pickupTime = this.booking.pickupTime();
    this.returnTime = this.booking.returnTime();
    this.location = this.booking.location();
    this.selectedShopId = this.booking.pickupShopId();
    this.clientName = this.booking.clientName() || this.activeClients()[0]?.name || '';
    this.selectedClientId = this.booking.clientId() ?? null;
    this.scheduleAvailability();
  }

  private async loadVehicleForRoute(id: number): Promise<void> {
    if (id <= 0) return;
    if (this.booking.vehicleId() !== id) {
      this.booking.selectVehicle(id);
      this.selectedShopId = this.booking.pickupShopId();
      this.location = this.booking.location();
    }
    try {
      if (!this.booking.vehicle()) await this.vehicleService.loadOne(id);
      this.scheduleAvailability();
      await this.loadShops(id);
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo');
    }
  }

  async load(): Promise<void> {
    await this.loadClients();
  }

  async loadShops(carId = this.vehicle?.id): Promise<void> {
    const request = ++this.shopRequest;
    if (!carId) return;
    await this.shops.loadForVehicle(carId);
    if (request !== this.shopRequest) return;
    const current = this.shops.shops().find((shop) => shop.id === this.selectedShopId && shop.ativa);
    if (current) this.selectShop(current.id);
    else this.selectShop(null);
    this.changeDetector.markForCheck();
  }

  selectShop(id: number | null): void {
    this.selectedShopId = id;
    const shop = this.shops.shops().find((item) => item.id === id);
    this.location = shop ? `${shop.nome} — ${shop.logradouro}, ${shop.numero}, ${shop.cidade}/${shop.uf}` : '';
    this.booking.setPickupShop(shop?.id ?? null, this.location);
  }

  togglePickupShop(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) this.selectShop(id);
    else if (this.selectedShopId === id) this.selectShop(null);
    this.changeDetector.markForCheck();
  }

  private async loadClients(): Promise<void> {
    await this.clientService.load();
    const selected = this.activeClients().find((client) => client.id === this.booking.clientId())
      ?? this.activeClients()[0];
    if (selected) this.selectClient(selected.id);
  }

  selectClient(id: number | null): void {
    this.selectedClientId = id;
    const client = this.activeClients().find((item) => item.id === id);
    this.clientName = client?.name ?? '';
    this.booking.setClient(id, this.clientName);
  }

  get vehicle(): Vehicle | undefined {
    return this.booking.vehicle();
  }

  get vehiclePhoto(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }

  get backHref(): string {
    return this.isStaff ? '/admin/reserva' : '/client/veiculos';
  }

  get minEnd(): string {
    return this.start;
  }

  get days(): number {
    const duration = this.toLocalDateTime(this.end, this.returnTime) - this.toLocalDateTime(this.start, this.pickupTime);
    return Math.max(1, Math.ceil(duration / (24 * 60 * 60 * 1000)));
  }

  get total(): number {
    return this.days * (this.vehicle?.pricePerDay ?? 0);
  }

  onStartChange(value: string): void {
    this.start = value;
    if (this.end < this.start || (this.end === this.start && this.returnTime <= this.pickupTime)) {
      this.end = addDays(this.start, 1);
    }
    this.scheduleAvailability();
  }

  scheduleAvailability(): void {
    if (this.availabilityTimer) clearTimeout(this.availabilityTimer);
    this.availability = null;
    this.availabilityError = null;
    this.estimate = null;
    if (!this.vehicle || !this.start || !this.end || !this.pickupTime || !this.returnTime) {
      this.availabilityLoading = false;
      return;
    }
    this.availabilityLoading = true;
    this.availabilityTimer = setTimeout(() => { void this.refreshAvailability(); }, 350);
  }

  async refreshAvailability(): Promise<boolean> {
    const vehicle = this.vehicle;
    if (!vehicle || !this.start || !this.end) return false;
    const request = ++this.availabilityRequest;
    this.availabilityLoading = true;
    this.availabilityError = null;
    this.changeDetector.markForCheck();
    try {
      const input = { vehicleId: vehicle.id, start: this.start, end: this.end, pickupTime: this.pickupTime, returnTime: this.returnTime };
      const result = await this.reservations.checkAvailability(input);
      if (request !== this.availabilityRequest) return false;
      this.availability = result;
      if (result.disponivel) this.estimate = await this.reservations.quote(input);
      return result.disponivel;
    } catch (error) {
      if (request === this.availabilityRequest) this.availabilityError = error instanceof Error ? error.message : 'Não foi possível consultar a disponibilidade.';
      return false;
    } finally {
      if (request === this.availabilityRequest) {
        this.availabilityLoading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  selectAlternative(alternative: { dataRetirada: string; dataDevolucao: string }): void {
    const start = new Date(alternative.dataRetirada);
    const end = new Date(alternative.dataDevolucao);
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const localTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    this.start = localDate(start);
    this.end = localDate(end);
    this.pickupTime = localTime(start);
    this.returnTime = localTime(end);
    this.booking.setDates(this.start, this.end);
    this.booking.setTimes(this.pickupTime, this.returnTime);
    this.scheduleAvailability();
  }

  async continueBooking(): Promise<void> {
    if (!this.vehicle || this.vehicle.status === 'Em manutenção') {
      await this.toast.show('Este veículo não está disponível para reserva');
      return;
    }
    if (this.isStaff && !this.activeClients().some((client) => client.id === this.selectedClientId)) {
      await this.toast.show('Selecione um cliente ativo para a reserva.');
      return;
    }
    if (!this.shops.shops().length) {
      await this.toast.show('Este veículo ainda não está associado a nenhuma loja disponível.');
      return;
    }
    if (!this.shops.shops().some((shop) => shop.id === this.selectedShopId && shop.ativa)) {
      await this.toast.show('Selecione uma loja ativa associada a este veículo.');
      return;
    }
    if (this.toLocalDateTime(this.end, this.returnTime) <= this.toLocalDateTime(this.start, this.pickupTime)) {
      await this.toast.show('A devolução deve ser depois da retirada');
      return;
    }
    if (!await this.refreshAvailability()) {
      if (this.availabilityError) await this.toast.show(this.availabilityError);
      return;
    }
    if (!this.isStaff) {
      try {
        const result = await this.clientService.getOwnCompleteness();
        if (!result.completo) {
          await this.showProfileRequirements(result.pendencias);
          return;
        }
      } catch (error) {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível verificar seu cadastro.');
        return;
      }
    }
    this.booking.setDates(this.start, this.end);
    this.booking.setTimes(this.pickupTime, this.returnTime);
    this.booking.setLocation(this.location);
    this.booking.setPickupShop(this.selectedShopId, this.location);
    this.booking.setClientName(this.clientName);
    await this.router.navigateByUrl('/booking/confirmar');
  }

  private toLocalDateTime(day: string, time: string): number {
    const [year, month, date] = day.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, date, hours, minutes).getTime();
  }

  private async showProfileRequirements(pendencias: string[]): Promise<void> {
    const targets: Record<string, { label: string; section: string; missing: string }> = {
      'dados-pessoais': { label: 'Dados pessoais', section: 'Dados pessoais', missing: 'Revise seu nome e documento cadastral.' },
      telefone: { label: 'Adicionar telefone', section: 'Dados pessoais', missing: 'Informe um telefone válido para contato.' },
      cnh: { label: 'Cadastrar CNH', section: 'CNH', missing: 'Informe o número e a validade da CNH.' },
      endereco: { label: 'Completar endereço', section: 'Endereço', missing: 'Preencha todos os campos obrigatórios do endereço.' },
    };
    const missing = pendencias.map((key) => targets[key]).filter((item): item is NonNullable<typeof item> => !!item);
    const alert = await this.alerts.create({
      header: 'Complete seu cadastro para reservar!',
      message: `Antes de realizar sua primeira reserva, precisamos de algumas informações para garantir a segurança e concluir seu cadastro.<br><br>${missing.map((item) => `• ${item.missing}`).join('<br>')}`,
      buttons: [
        ...missing.map((item) => ({ text: item.label, handler: () => { void this.router.navigate(['/client/perfil', item.section], { queryParams: { returnVehicleId: this.vehicle?.id } }); } })),
        { text: 'Continuar navegando', role: 'cancel' },
      ],
    });
    await alert.present();
  }
}
