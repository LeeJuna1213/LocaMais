import { Component, inject } from '@angular/core';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { MatchValueValidatorDirective } from './register-validators.directive';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, AppShellComponent, MatchValueValidatorDirective],
  styles: [`
    .field-error { display: block; margin: -6px 0 10px; color: #b42318; font-size: 12px; }
    .notice { padding: 12px; border-radius: 10px; background: #fff1e4; color: #67380f; line-height: 1.5; }
    .password-row { display: flex; gap: 8px; align-items: center; }
    .password-row input { flex: 1; min-width: 0; }
    .visibility { border: 0; background: transparent; color: #713b17; padding: 8px; }
  `],
  template: `
    <app-shell title="Criar nova senha" [back]="true" defaultHref="/login">
      <div class="card">
        <h2>Criar nova senha</h2>
        @if (!token) {
          <p class="notice" role="alert">O link de recuperação está sem token. Solicite um novo link para continuar.</p>
          <button class="btn" type="button" (click)="requestNewLink()">Solicitar novo link</button>
        } @else if (success) {
          <p class="notice" role="status">Sua senha foi alterada com sucesso.</p>
          <button class="btn" type="button" (click)="backToLogin()">Voltar ao login</button>
        } @else {
          <form #resetForm="ngForm" novalidate (ngSubmit)="submit(resetForm)">
            <label for="new-password">Nova senha</label>
            <div class="password-row">
              <input id="new-password" name="newPassword" [type]="showNewPassword ? 'text' : 'password'" [(ngModel)]="newPassword" #newPasswordControl="ngModel" required minlength="8" maxlength="72" autocomplete="new-password" />
              <button class="visibility" type="button" [attr.aria-label]="showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'" (click)="showNewPassword = !showNewPassword">{{ showNewPassword ? 'Ocultar' : 'Mostrar' }}</button>
            </div>
            @if (showError(newPasswordControl)) { <small class="field-error">A senha deve ter entre 8 e 72 caracteres.</small> }

            <label for="confirm-password">Confirmar nova senha</label>
            <div class="password-row">
              <input id="confirm-password" name="confirmPassword" [type]="showConfirmPassword ? 'text' : 'password'" [(ngModel)]="confirmPassword" #confirmPasswordControl="ngModel" required [appMatchValue]="newPassword" autocomplete="new-password" />
              <button class="visibility" type="button" [attr.aria-label]="showConfirmPassword ? 'Ocultar confirmação' : 'Mostrar confirmação'" (click)="showConfirmPassword = !showConfirmPassword">{{ showConfirmPassword ? 'Ocultar' : 'Mostrar' }}</button>
            </div>
            @if (showError(confirmPasswordControl)) {
              <small class="field-error">{{ confirmPasswordControl.errors?.['required'] ? 'Confirme a nova senha.' : 'As senhas não conferem.' }}</small>
            }
            @if (errorMessage) {
              <p class="field-error" role="alert">{{ errorMessage }}</p>
              <button class="lnk dark" type="button" (click)="requestNewLink()">Solicitar um novo link</button>
            }
            <button class="btn" type="submit" [disabled]="resetForm.invalid || auth.loading()">
              {{ auth.loading() ? 'Salvando...' : 'Salvar nova senha' }}
            </button>
          </form>
        }
      </div>
    </app-shell>
  `,
})
export class ResetPasswordPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token')?.trim() ?? '';
  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;
  submitted = false;
  success = false;
  errorMessage = '';

  showError(control: NgModel | null | undefined): boolean {
    return !!control?.invalid && (!!control.touched || this.submitted);
  }

  async submit(form: NgForm): Promise<void> {
    this.submitted = true;
    this.errorMessage = '';
    if (!this.token || form.invalid || form.pending) {
      form.control.markAllAsTouched();
      return;
    }
    try {
      await this.auth.resetPassword(this.token, this.newPassword);
      this.success = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Não foi possível redefinir a senha.';
    }
  }

  async requestNewLink(): Promise<void> {
    await this.router.navigateByUrl('/recuperar-senha');
  }

  async backToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login');
  }
}
