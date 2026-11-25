import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { LogoComponent } from '../../shared/components/logo.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonContent, FormsModule, IonIcon, LogoComponent, SegmentTabsComponent],
  template: `
    <ion-content class="app-content">
      <div class="page login-layout">
        <div class="login-logo"><app-logo size="lg" /></div>

        <div class="card login-card">
          <h2 style="text-align: center; margin-bottom: 10px">
            {{ mode === 'admin' ? 'Acesso do funcionário' : 'Login' }}
          </h2>

          <app-segment-tabs
            variant="seg"
            [options]="roles"
            [active]="mode === 'admin' ? 'Funcionário' : 'Cliente'"
            (activeChange)="setRole($event)"
          />

          <form #loginForm="ngForm" novalidate (ngSubmit)="login()">
            <input name="identifier" [(ngModel)]="identifier" [placeholder]="mode === 'admin' ? 'E-mail corporativo' : 'E-mail'" autocomplete="username" aria-label="E-mail" data-lpignore="true" required />
            <div class="password-field">
              <input name="password" class="login-password" [type]="showPassword ? 'text' : 'password'" [(ngModel)]="password" placeholder="Senha" autocomplete="current-password" aria-label="Senha" data-lpignore="true" data-1p-ignore="true" required />
              <button type="button" class="pw-toggle" (click)="togglePassword()" [attr.aria-label]="showPassword ? 'Ocultar senha' : 'Exibir senha'">
                <ion-icon [name]="showPassword ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
              </button>
            </div>
            <button class="btn" type="submit" [disabled]="auth.loading()">{{ mode === 'admin' ? 'Entrar no painel' : 'Entrar' }}</button>
          </form>
          <button class="lnk dark" type="button" (click)="forgotPassword()">Esqueci minha senha</button>
        </div>

        @if (mode === 'admin') {
          <div class="login-notice">
            Acesso restrito a funcionários cadastrados
          </div>
        } @else {
          <button class="lnk login-register" type="button" (click)="goToRegister()">Não tem uma conta? Cadastre-se</button>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .login-layout {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      min-height: 100%;
      padding: 16px 0;
    }
    .login-logo,
    .login-card,
    .login-notice,
    .login-register {
      width: 100%;
      max-width: 420px;
    }
    .login-logo { flex: 0 0 auto; }
    .login-card { margin-bottom: 0; }
    .login-notice {
      color: #f9a45c;
      font-size: 12px;
      text-align: center;
    }
    .login-register { margin: 0; }
    form { margin: 0; }
    .password-field { position: relative; margin-bottom: 8px; }
    .password-field .login-password { padding-right: 52px; margin-bottom: 0; }
    .pw-toggle {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      display: grid; place-items: center; width: 36px; height: 36px;
      background: transparent; border: none; cursor: pointer; padding: 4px; line-height: 1; color: #e86f12;
    }
    .pw-toggle ion-icon { font-size: 20px; color: #e86f12; }
  `],
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly roles = ['Cliente', 'Funcionário'];
  mode: UserRole = 'client';
  identifier = '';
  password = '';
  showPassword = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
  }

  setRole(label: string): void {
    this.mode = label === 'Funcionário' ? 'admin' : 'client';
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
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
    await this.router.navigateByUrl('/recuperar-senha');
  }

  async goToRegister(): Promise<void> {
    await this.router.navigateByUrl('/cadastro');
  }
}
