import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, daysBetween, todayISO } from '../../core/data';
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

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CarComponent, CurrencyPipe],
  styles: [`
    .reservation-photo { display:block;width:104px;height:76px;object-fit:cover;border-radius:12px;flex:none }
    .pickup-shop-select { display:block;width:100%;max-width:100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
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
          <input type="time" [(ngModel)]="pickupTime" />

          <label>Data de devolução</label>
          <input type="date" [min]="minEnd" [ngModel]="end" (ngModelChange)="end = $event" />
          <label>Horário de devolução</label>
          <input type="time" [(ngModel)]="returnTime" />

           @if (shops.loading()) { <div class="small muted" role="status">Carregando lojas...</div> }
           @else if (shops.error(); as shopError) { <div class="small" role="alert">{{ shopError }}</div><button class="lnk dark" type="button" (click)="loadShops()">Tentar novamente</button> }
           @else {
             <label for="pickup-shop">Loja de retirada *</label>
              <select id="pickup-shop" class="pickup-shop-select" [ngModel]="selectedShopId" (ngModelChange)="selectShop($event)" required>
                <option [ngValue]="null" disabled>Selecione uma loja</option>
                @for (shop of shops.shops(); track shop.id) { <option [ngValue]="shop.id">{{ shop.nome }} — {{ shop.cidade }}/{{ shop.uf }}</option> }
             </select>
           }

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
  readonly clientService = inject(ClientService);
  private readonly vehicleService = inject(VehicleService);
  private readonly booking = inject(BookingService);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(AlertController);
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

  constructor() {
    if (this.isStaff) void this.loadClients();
    void this.loadShops();

    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    if (this.booking.vehicleId() !== id) {
      this.booking.selectVehicle(id);
    }
    if (id > 0 && !this.booking.vehicle()) {
      void this.vehicleService.loadOne(id).catch(async (error: unknown) => {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo');
      });
    }
    this.start = this.booking.start();
    this.end = this.booking.end();
    this.pickupTime = this.booking.pickupTime();
    this.returnTime = this.booking.returnTime();
    this.location = this.booking.location();
    this.selectedShopId = this.booking.pickupShopId();
    this.clientName = this.booking.clientName() || this.activeClients()[0]?.name || '';
    this.selectedClientId = this.booking.clientId() ?? null;
  }

  async load(): Promise<void> {
    await this.loadClients();
  }

  async loadShops(): Promise<void> {
    await this.shops.loadActive();
    const current = this.shops.shops().find((shop) => shop.id === this.booking.pickupShopId());
    if (current) this.selectShop(current.id);
  }

  selectShop(id: number | null): void {
    this.selectedShopId = id;
    const shop = this.shops.shops().find((item) => item.id === id);
    this.location = shop ? `${shop.nome} — ${shop.logradouro}, ${shop.numero}, ${shop.cidade}/${shop.uf}` : '';
    this.booking.setPickupShop(shop?.id ?? null, this.location);
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
    if (this.end < this.start || (this.end === this.start && this.returnTime <= this.pickupTime)) {
      this.end = addDays(this.start, 1);
    }
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
    if (!this.shops.shops().some((shop) => shop.id === this.selectedShopId && shop.ativa)) {
      await this.toast.show('Selecione uma loja ativa para retirada.');
      return;
    }
    if (this.end <= this.start) {
      await this.toast.show('A devolução deve ser depois da retirada');
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
