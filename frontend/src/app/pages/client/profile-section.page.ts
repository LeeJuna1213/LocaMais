import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-profile-section',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  styles: [`
    .preference-toggle {
      display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px;
      padding: 10px 12px; margin: 6px 0; border: 1px solid #eadfd5; border-radius: 12px;
      background: #fffaf5; color: #2b1a0d; text-align: left; font: inherit; cursor: pointer;
    }
    .preference-toggle .indicator {
      display: grid; place-items: center; width: 20px; height: 20px; flex: none;
      border: 2px solid #c9a98c; border-radius: 6px; color: #fff;
    }
    .preference-toggle[aria-checked="true"] .indicator { border-color: #e86f12; background: #e86f12; }
    .preference-toggle:focus-visible { outline: 2px solid #e86f12; outline-offset: 2px; }
  `],
  template: `
    <app-shell
      [title]="section"
      [back]="true"
      defaultHref="/client/perfil"
      [showNav]="true"
      role="client"
      activeTab="perfil"
    >
      <div class="card">
        @switch (section) {
          @case ('Dados pessoais') {
            <label>Nome</label>
            <input [(ngModel)]="name" autocomplete="off" />
            <label>E-mail</label>
            <input [(ngModel)]="email" autocomplete="email" readonly aria-readonly="true" />
            <label>Telefone</label>
            <input type="tel" [(ngModel)]="phone" autocomplete="tel" />
          }
          @case ('CNH') {
            <label>Número da CNH</label>
            <input [(ngModel)]="cnh" autocomplete="off" />
            <label>Validade</label>
            <input type="date" [(ngModel)]="cnhValidity" />
          }
          @case ('Endereço') {
            <label>Logradouro</label>
            <input [(ngModel)]="street" autocomplete="address-line1" />
            <label>Número</label>
            <input [(ngModel)]="addressNumber" autocomplete="address-line2" />
            <label>Complemento</label>
            <input [(ngModel)]="addressComplement" autocomplete="off" />
            <label>Bairro</label>
            <input [(ngModel)]="addressDistrict" autocomplete="off" />
            <label>Cidade</label>
            <input [(ngModel)]="city" autocomplete="address-level2" />
            <label>Estado (UF)</label>
            <input [(ngModel)]="addressState" maxlength="2" autocomplete="address-level1" />
            <label>CEP</label>
            <input [(ngModel)]="addressZipCode" inputmode="numeric" maxlength="8" autocomplete="postal-code" />
          }
          @case ('Preferências') {
            <button class="preference-toggle" type="button" role="switch" [attr.aria-checked]="notifyReservations" (click)="notifyReservations = !notifyReservations">
              <span class="indicator" aria-hidden="true">{{ notifyReservations ? '✓' : '' }}</span>Notificações de reserva
            </button>
            <button class="preference-toggle" type="button" role="switch" [attr.aria-checked]="notifyPromos" (click)="notifyPromos = !notifyPromos">
              <span class="indicator" aria-hidden="true">{{ notifyPromos ? '✓' : '' }}</span>Promoções por e-mail
            </button>
          }
          @case ('Pagamentos') {
            <p class="small muted">Métodos suportados atualmente: PIX, cartão de crédito, cartão de débito e dinheiro. O sistema usa processamento demonstrativo e não possui integração de tokenização para cadastrar cartões.</p>
            <label for="payment-preference">Forma de pagamento preferencial</label>
            <select id="payment-preference" [(ngModel)]="paymentPreference">
              <option value="">Sem preferência</option>
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de crédito</option>
              <option value="cartao_debito">Cartão de débito</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          }
          @case ('Alterar senha') {
            <label>Senha atual</label>
            <input type="text" class="pw" [(ngModel)]="currentPassword" autocomplete="off" />
            <label>Nova senha</label>
            <input type="text" class="pw" [(ngModel)]="newPassword" autocomplete="off" />
            <label>Confirmar nova senha</label>
            <input type="text" class="pw" [(ngModel)]="newPasswordConfirmation" autocomplete="off" />
          }
        }

        <button class="btn" type="button" (click)="save()">Salvar</button>
      </div>
    </app-shell>
  `,
})
export class ProfileSectionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly section = this.route.snapshot.paramMap.get('section') ?? 'Dados pessoais';

  name = '';
  email = '';
  phone = '';
  cnh = '';
  cnhValidity = '';
  street = '';
  city = '';
  addressNumber = '';
  addressComplement = '';
  addressDistrict = '';
  addressState = '';
  addressZipCode = '';
  notifyReservations = false;
  notifyPromos = false;
  paymentPreference = '';
  currentPassword = '';
  newPassword = '';
  newPasswordConfirmation = '';

  constructor() {
    const profile = this.auth.profile();
    this.name = profile.name;
    this.email = profile.email;
    this.phone = profile.phone;
    this.cnh = profile.cnh;
    this.cnhValidity = profile.cnhValidity;
    this.street = profile.street;
    this.city = profile.city;
    this.addressNumber = profile.addressNumber;
    this.addressComplement = profile.addressComplement;
    this.addressDistrict = profile.addressDistrict;
    this.addressState = profile.addressState;
    this.addressZipCode = profile.addressZipCode;
    this.notifyReservations = profile.notifyReservations;
    this.notifyPromos = profile.notifyPromos;
    this.paymentPreference = profile.paymentPreference;
  }

  async save(): Promise<void> {
    if (this.section === 'Alterar senha') {
      if (!this.newPassword || this.newPassword !== this.newPasswordConfirmation) {
        await this.toast.show('As senhas não conferem');
        return;
      }
    } else {
      try {
        if (this.section === 'Dados pessoais') {
          await this.auth.updateProfile({ name: this.name, phone: this.phone });
        } else if (this.section === 'CNH') {
          await this.auth.updateProfile({ cnh: this.cnh, cnhValidity: this.cnhValidity });
        } else if (this.section === 'Endereço') {
          await this.auth.updateProfile({
            street: this.street,
            addressNumber: this.addressNumber,
            addressComplement: this.addressComplement,
            addressDistrict: this.addressDistrict,
            city: this.city,
            addressState: this.addressState,
            addressZipCode: this.addressZipCode,
          });
        } else if (this.section === 'Preferências') {
          await this.auth.updateProfile({ notifyReservations: this.notifyReservations, notifyPromos: this.notifyPromos });
        } else if (this.section === 'Pagamentos') {
          await this.auth.updateProfile({ paymentPreference: this.paymentPreference });
        }
      } catch (error) {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar as alterações.');
        return;
      }
    }

    await this.toast.show('Alterações salvas');
    const returnVehicleId = Number(this.route.snapshot.queryParamMap.get('returnVehicleId'));
    await this.router.navigateByUrl(returnVehicleId > 0 ? `/booking/reservar/${returnVehicleId}` : '/client/perfil');
  }
}
