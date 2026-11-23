import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-profile-section',
  standalone: true,
  imports: [FormsModule, AppShellComponent, IonIcon],
  styles: [`
    .password-field { position: relative; margin-bottom: 8px; }
    .password-field input { padding-right: 52px; margin-bottom: 0; }
    .pw-toggle {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      display: grid; place-items: center; width: 36px; height: 36px;
      background: transparent; border: none; cursor: pointer; padding: 4px; line-height: 1; color: #e86f12;
    }
    .pw-toggle ion-icon { font-size: 20px; color: #e86f12; }
    .pw-toggle:focus-visible { outline: 2px solid #e86f12; outline-offset: 1px; border-radius: 6px; }
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
          @case ('Alterar senha') {
            <label for="current-password">Senha atual</label>
            <div class="password-field">
              <input id="current-password" name="currentPassword" [type]="showCurrentPassword ? 'text' : 'password'" [(ngModel)]="currentPassword" autocomplete="current-password" />
              <button class="pw-toggle" type="button" [attr.aria-label]="showCurrentPassword ? 'Ocultar senha atual' : 'Exibir senha atual'" (click)="showCurrentPassword = !showCurrentPassword"><ion-icon [name]="showCurrentPassword ? 'eye-outline' : 'eye-off-outline'" aria-hidden="true"></ion-icon></button>
            </div>
            <label for="new-password">Nova senha</label>
            <div class="password-field">
              <input id="new-password" name="newPassword" [type]="showNewPassword ? 'text' : 'password'" [(ngModel)]="newPassword" autocomplete="new-password" />
              <button class="pw-toggle" type="button" [attr.aria-label]="showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'" (click)="showNewPassword = !showNewPassword"><ion-icon [name]="showNewPassword ? 'eye-outline' : 'eye-off-outline'" aria-hidden="true"></ion-icon></button>
            </div>
            <label for="confirm-new-password">Confirmar nova senha</label>
            <div class="password-field">
              <input id="confirm-new-password" name="newPasswordConfirmation" [type]="showNewPasswordConfirmation ? 'text' : 'password'" [(ngModel)]="newPasswordConfirmation" autocomplete="new-password" />
              <button class="pw-toggle" type="button" [attr.aria-label]="showNewPasswordConfirmation ? 'Ocultar confirmação da senha' : 'Exibir confirmação da senha'" (click)="showNewPasswordConfirmation = !showNewPasswordConfirmation"><ion-icon [name]="showNewPasswordConfirmation ? 'eye-outline' : 'eye-off-outline'" aria-hidden="true"></ion-icon></button>
            </div>
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
  currentPassword = '';
  newPassword = '';
  newPasswordConfirmation = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showNewPasswordConfirmation = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
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
    if (this.section === 'Preferências' || this.section === 'Pagamentos') {
      void this.router.navigateByUrl('/client/perfil');
    }
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
