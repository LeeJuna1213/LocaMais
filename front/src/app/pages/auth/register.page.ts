import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientType } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, AppShellComponent, SegmentTabsComponent],
  template: `
    <app-shell title="Cadastro" [back]="true" defaultHref="/login">
      <app-segment-tabs
        variant="tabs"
        [options]="types"
        [active]="type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'"
        (activeChange)="setType($event)"
      />

      <div class="card">
        <input [(ngModel)]="name" [placeholder]="type === 'PF' ? 'Nome completo' : 'Razão social'" autocomplete="off" />
        <input [(ngModel)]="email" placeholder="E-mail" autocomplete="off" />
        <input [(ngModel)]="phone" placeholder="Telefone" autocomplete="off" />
        <input [(ngModel)]="document" [placeholder]="type === 'PF' ? 'CPF' : 'CNPJ'" autocomplete="off" />
        <input type="text" class="pw" [(ngModel)]="password" placeholder="Senha" autocomplete="off" />
        <input type="text" class="pw" [(ngModel)]="passwordConfirmation" placeholder="Confirmar senha" autocomplete="off" />
        <button class="btn" type="button" (click)="register()">Cadastrar</button>
        <button class="lnk dark" type="button" (click)="goToLogin()">Já tem uma conta? Entrar</button>
      </div>
    </app-shell>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly types = ['Pessoa Física', 'Pessoa Jurídica'];
  type: ClientType = 'PF';
  name = '';
  email = '';
  phone = '';
  document = '';
  password = '';
  passwordConfirmation = '';

  setType(label: string): void {
    this.type = label === 'Pessoa Jurídica' ? 'PJ' : 'PF';
  }

  async register(): Promise<void> {
    if (!this.name || !this.email || !this.password) {
      await this.toast.show('Preencha nome, e-mail e senha');
      return;
    }
    if (this.password !== this.passwordConfirmation) {
      await this.toast.show('As senhas não conferem');
      return;
    }

    await this.auth.register({
      name: this.name,
      type: this.type,
      email: this.email,
      phone: this.phone,
      document: this.document,
      password: this.password,
    });
    await this.toast.show('Cadastro realizado!');
    await this.router.navigateByUrl('/client/veiculos');
  }

  async goToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login');
  }
}
