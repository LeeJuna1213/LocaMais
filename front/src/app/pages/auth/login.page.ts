import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { LogoComponent } from '../../shared/components/logo.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonContent, FormsModule, LogoComponent, SegmentTabsComponent],
  template: `
    <ion-content class="app-content">
      <div class="page">
        <div style="margin: 6px 0 22px"><app-logo size="lg" /></div>

        <div class="card">
          <h2 style="text-align: center; margin-bottom: 10px">
            {{ mode === 'admin' ? 'Acesso do funcionário' : 'Login' }}
          </h2>

          <app-segment-tabs
            variant="seg"
            [options]="roles"
            [active]="mode === 'admin' ? 'Funcionário' : 'Cliente'"
            (activeChange)="setRole($event)"
          />

          <input
            [(ngModel)]="identifier"
            [placeholder]="mode === 'admin' ? 'E-mail corporativo ou matrícula' : 'E-mail ou usuário'"
            autocomplete="off"
            data-lpignore="true"
          />
          <input
            type="text"
            class="pw"
            [(ngModel)]="password"
            placeholder="Senha"
            autocomplete="off"
            data-lpignore="true"
            data-1p-ignore
          />

          <button class="btn" type="button" (click)="login()">
            {{ mode === 'admin' ? 'Entrar no painel' : 'Entrar' }}
          </button>
          <button class="lnk dark" type="button" (click)="forgotPassword()">Esqueci minha senha</button>
        </div>

        @if (mode === 'admin') {
          <div style="text-align: center; font-size: 12px; color: #f9a45c; margin-top: 12px">
            Acesso restrito a funcionários cadastrados
          </div>
        } @else {
          <button class="lnk" type="button" (click)="goToRegister()">Não tem uma conta? Cadastre-se</button>
        }
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly roles = ['Cliente', 'Funcionário'];
  mode: UserRole = 'client';
  identifier = '';
  password = '';

  setRole(label: string): void {
    this.mode = label === 'Funcionário' ? 'admin' : 'client';
  }

  async login(): Promise<void> {
    try {
      await this.auth.login(this.identifier, this.password, this.mode);
      this.identifier = '';
      this.password = '';
      await this.router.navigateByUrl(this.auth.home());
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível entrar');
    }
  }

  async forgotPassword(): Promise<void> {
    await this.toast.show('Link de recuperação enviado');
  }

  async goToRegister(): Promise<void> {
    await this.router.navigateByUrl('/cadastro');
  }
}
