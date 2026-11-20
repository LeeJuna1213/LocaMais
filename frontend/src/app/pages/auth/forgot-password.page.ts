import { Component, inject } from '@angular/core';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  styles: [`
    .field-error { display: block; margin: -6px 0 10px; color: #b42318; font-size: 12px; }
    .explanation, .notice { line-height: 1.5; }
    .notice { padding: 12px; border-radius: 10px; background: #fff1e4; color: #67380f; }
  `],
  template: `
    <app-shell title="Recuperar senha" [back]="true" defaultHref="/login">
      <div class="card">
        <h2>Recuperar senha</h2>
        <p class="explanation">Informe o e-mail cadastrado na sua conta. Enviaremos um link para você criar uma nova senha.</p>

        @if (success) {
          <p class="notice" role="status">{{ successMessage }}</p>
        } @else {
          <form #recoveryForm="ngForm" novalidate (ngSubmit)="submit(recoveryForm)">
            <input name="email" type="email" [(ngModel)]="email" #emailControl="ngModel" required email maxlength="180" placeholder="E-mail" autocomplete="email" />
            @if (showError(emailControl)) {
              <small class="field-error">{{ emailControl.errors?.['required'] ? 'Informe o e-mail.' : 'Informe um e-mail válido.' }}</small>
            }
            @if (errorMessage) { <p class="field-error" role="alert">{{ errorMessage }}</p> }
            <button class="btn" type="submit" [disabled]="recoveryForm.invalid || auth.loading()">
              {{ auth.loading() ? 'Enviando...' : 'Enviar link de recuperação' }}
            </button>
          </form>
        }
        <button class="lnk dark" type="button" (click)="backToLogin()">Voltar ao login</button>
      </div>
    </app-shell>
  `,
})
export class ForgotPasswordPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  email = '';
  submitted = false;
  success = false;
  errorMessage = '';
  readonly successMessage = 'Se existir uma conta vinculada a esse e-mail, você receberá uma mensagem com as instruções para redefinir sua senha.';

  showError(control: NgModel | null | undefined): boolean {
    return !!control?.invalid && (!!control.touched || this.submitted);
  }

  async submit(form: NgForm): Promise<void> {
    this.submitted = true;
    this.errorMessage = '';
    if (form.invalid || form.pending) {
      form.control.markAllAsTouched();
      return;
    }
    try {
      await this.auth.requestPasswordRecovery(this.email);
      this.success = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação de senha.';
    }
  }

  async backToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login');
  }
}
