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
            <input [(ngModel)]="email" autocomplete="off" />
            <label>Telefone</label>
            <input [(ngModel)]="phone" autocomplete="off" />
          }
          @case ('CNH') {
            <label>Número da CNH</label>
            <input [(ngModel)]="cnh" autocomplete="off" />
            <label>Validade</label>
            <input type="date" [(ngModel)]="cnhValidity" />
          }
          @case ('Endereço') {
            <label>Rua e número</label>
            <input [(ngModel)]="street" autocomplete="off" />
            <label>Cidade</label>
            <input [(ngModel)]="city" autocomplete="off" />
          }
          @case ('Preferências') {
            <div class="rd" [class.on]="notifyReservations" (click)="notifyReservations = !notifyReservations">
              {{ notifyReservations ? '☑' : '☐' }} Notificações de reserva
            </div>
            <div class="rd" [class.on]="notifyPromos" (click)="notifyPromos = !notifyPromos">
              {{ notifyPromos ? '☑' : '☐' }} Promoções por e-mail
            </div>
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
  notifyReservations = false;
  notifyPromos = false;
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
    this.notifyReservations = profile.notifyReservations;
    this.notifyPromos = profile.notifyPromos;
  }

  async save(): Promise<void> {
    if (this.section === 'Alterar senha') {
      if (!this.newPassword || this.newPassword !== this.newPasswordConfirmation) {
        await this.toast.show('As senhas não conferem');
        return;
      }
    } else if (this.section === 'Dados pessoais') {
      await this.auth.updateProfile({ name: this.name, email: this.email, phone: this.phone });
    } else if (this.section === 'CNH') {
      await this.auth.updateProfile({ cnh: this.cnh, cnhValidity: this.cnhValidity });
    } else if (this.section === 'Endereço') {
      await this.auth.updateProfile({ street: this.street, city: this.city });
    } else if (this.section === 'Preferências') {
      await this.auth.updateProfile({
        notifyReservations: this.notifyReservations,
        notifyPromos: this.notifyPromos,
      });
    }

    await this.toast.show('Alterações salvas');
    await this.router.navigateByUrl('/client/perfil');
  }
}
