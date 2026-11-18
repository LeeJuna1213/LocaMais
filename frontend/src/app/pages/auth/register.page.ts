import { Component, ViewChild, inject } from '@angular/core';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientType } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { normalizeDocument } from '../../core/utils/document.validation';
import { DocumentInputDirective, MatchValueValidatorDirective } from './register-validators.directive';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, AppShellComponent, SegmentTabsComponent, DocumentInputDirective, MatchValueValidatorDirective],
  styles: [`
    .field-error { display: block; margin: -6px 0 10px; color: #b42318; font-size: 12px; }
  `],
  template: `
    <app-shell title="Cadastro" [back]="true" defaultHref="/login">
      <app-segment-tabs
        variant="tabs"
        [options]="types"
        [active]="type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'"
        (activeChange)="setType($event)"
      />

      <p class="small muted">Campos marcados com * são obrigatórios.</p>
      <form #registrationForm="ngForm" class="card" novalidate (ngSubmit)="register(registrationForm)">
        <input name="name" [(ngModel)]="name" #nameControl="ngModel" required maxlength="150" [placeholder]="type === 'PF' ? 'Nome completo *' : 'Nome do responsável *'" autocomplete="name" />
        @if (showError(nameControl)) {
          <small class="field-error">{{ nameControl.errors?.['required'] ? 'Informe o nome.' : 'O nome deve ter até 150 caracteres.' }}</small>
        }
        <input name="email" type="email" [(ngModel)]="email" #emailControl="ngModel" required email maxlength="180" placeholder="E-mail *" autocomplete="email" />
        @if (showError(emailControl)) {
          <small class="field-error">{{ emailControl.errors?.['required'] ? 'Informe o e-mail.' : 'Informe um e-mail válido.' }}</small>
        }
        <input name="document" type="text" [(ngModel)]="document" #documentControl="ngModel" required [appDocumentInput]="type" [placeholder]="type === 'PF' ? 'CPF *' : 'CNPJ *'" inputmode="numeric" autocomplete="off" />
        @if (showError(documentControl)) {
          <small class="field-error">{{ documentControl.errors?.['required'] ? (type === 'PF' ? 'Informe o CPF.' : 'Informe o CNPJ.') : (documentControl.errors?.['documentIncomplete']?.message ?? documentControl.errors?.['documentInvalid']?.message) }}</small>
        }
        @if (type === 'PF') {
          <label class="small">Data de nascimento *</label>
          <input name="birthDate" type="date" [(ngModel)]="birthDate" #birthDateControl="ngModel" required aria-label="Data de nascimento" />
          @if (showError(birthDateControl)) {
            <small class="field-error">Informe a data de nascimento.</small>
          }
        } @else {
          <input name="companyName" [(ngModel)]="companyName" #companyNameControl="ngModel" required minlength="2" maxlength="200" placeholder="Razão social *" autocomplete="organization" />
          @if (showError(companyNameControl)) {
            <small class="field-error">{{ companyNameControl.errors?.['required'] ? 'Informe a razão social.' : 'A razão social deve ter entre 2 e 200 caracteres.' }}</small>
          }
        }
        <input name="street" [(ngModel)]="street" #streetControl="ngModel" required maxlength="200" placeholder="Logradouro *" autocomplete="address-line1" />
        @if (showError(streetControl)) { <small class="field-error">Informe o logradouro (até 200 caracteres).</small> }
        <input name="number" [(ngModel)]="number" #numberControl="ngModel" required maxlength="20" placeholder="Número *" autocomplete="off" />
        @if (showError(numberControl)) { <small class="field-error">Informe o número (até 20 caracteres).</small> }
        <input name="complement" [(ngModel)]="complement" #complementControl="ngModel" maxlength="100" placeholder="Complemento (opcional)" autocomplete="address-line2" />
        @if (showError(complementControl)) { <small class="field-error">O complemento deve ter até 100 caracteres.</small> }
        <input name="district" [(ngModel)]="district" #districtControl="ngModel" required maxlength="100" placeholder="Bairro *" autocomplete="address-level3" />
        @if (showError(districtControl)) { <small class="field-error">Informe o bairro (até 100 caracteres).</small> }
        <input name="city" [(ngModel)]="city" #cityControl="ngModel" required maxlength="100" placeholder="Cidade *" autocomplete="address-level2" />
        @if (showError(cityControl)) { <small class="field-error">Informe a cidade (até 100 caracteres).</small> }
        <input name="state" [(ngModel)]="state" #stateControl="ngModel" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" placeholder="UF *" autocomplete="address-level1" />
        @if (showError(stateControl)) { <small class="field-error">Informe a sigla do estado com 2 letras.</small> }
        <input name="zipCode" [(ngModel)]="zipCode" #zipCodeControl="ngModel" required pattern="[0-9]{5}-?[0-9]{3}" placeholder="CEP * (ex.: 24000-000)" inputmode="numeric" autocomplete="postal-code" />
        @if (showError(zipCodeControl)) { <small class="field-error">Informe um CEP com 8 dígitos, com ou sem hífen.</small> }
        <input name="password" type="password" class="pw" [(ngModel)]="password" #passwordControl="ngModel" required minlength="8" maxlength="72" placeholder="Senha * (8 a 72 caracteres)" autocomplete="new-password" />
        @if (showError(passwordControl)) { <small class="field-error">A senha deve ter entre 8 e 72 caracteres.</small> }
        <input name="passwordConfirmation" type="password" class="pw" [(ngModel)]="passwordConfirmation" #passwordConfirmationControl="ngModel" required [appMatchValue]="password" placeholder="Confirmar senha *" autocomplete="new-password" />
        @if (showError(passwordConfirmationControl)) {
          <small class="field-error">{{ passwordConfirmationControl.errors?.['required'] ? 'Confirme a senha.' : 'As senhas não conferem.' }}</small>
        }
        <button class="btn" type="submit" [disabled]="auth.loading() || registrationForm.invalid || registrationForm.pending">Cadastrar</button>
        <button class="lnk dark" type="button" (click)="goToLogin()">Já tem uma conta? Entrar</button>
      </form>
    </app-shell>
  `,
})
export class RegisterPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  @ViewChild('registrationForm') registrationForm?: NgForm;

  readonly types = ['Pessoa Física', 'Pessoa Jurídica'];
  type: ClientType = 'PF';
  name = '';
  email = '';
  document = '';
  password = '';
  passwordConfirmation = '';
  birthDate = '';
  companyName = '';
  street = '';
  number = '';
  complement = '';
  district = '';
  city = '';
  state = '';
  zipCode = '';

  setType(label: string): void {
    this.type = label === 'Pessoa Jurídica' ? 'PJ' : 'PF';
  }

  submitted = false;

  showError(control: NgModel | null | undefined): boolean {
    return !!control?.invalid && (!!control.touched || this.submitted);
  }

  async register(form: NgForm): Promise<void> {
    this.submitted = true;
    if (form.invalid || form.pending) {
      form.control.markAllAsTouched();
      return;
    }

    try {
      const normalizedDocument = normalizeDocument(this.document);
      await this.auth.register({
        name: this.name, type: this.type, email: this.email, password: this.password,
        ...(this.type === 'PF' ? { cpf: normalizedDocument, birthDate: this.birthDate } : { cnpj: normalizedDocument, companyName: this.companyName }),
        address: { street: this.street, number: this.number, complement: this.complement, district: this.district, city: this.city, state: this.state, zipCode: this.zipCode },
      });
      await this.toast.show('Cadastro realizado!');
      await this.router.navigateByUrl('/client/veiculos');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível concluir o cadastro');
    }
  }

  async goToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login');
  }
}
