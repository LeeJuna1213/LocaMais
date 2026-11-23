import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client, ClientType } from '../../core/models';
import { ClientService } from '../../core/services/client.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { DocumentInputDirective } from '../auth/register-validators.directive';
import { normalizeDocument, validateDocument } from '../../core/utils/document.validation';

@Component({
  selector: 'app-client-edit',
  standalone: true,
  imports: [FormsModule, AppShellComponent, DocumentInputDirective],
  styles: [`.field-error{display:block;margin:-6px 0 10px;color:#b42318;font-size:12px}`],
  template: `
    <app-shell
      [title]="isNew ? 'Novo cliente' : 'Editar cliente'"
      [back]="true"
      defaultHref="/admin/clientes"
      [showNav]="true"
      role="admin"
      activeTab="menu"
    >
      @if (clientService.loading() && !isNew) {
        <div class="card empty" role="status">Carregando cliente...</div>
      } @else if (clientService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else if (isNew || client) {
        <form class="card" (ngSubmit)="save()" novalidate>
          <label>{{ isNew ? (type === 'PF' ? 'Nome completo' : 'Nome do responsável') : 'Nome' }}</label>
          <input name="name" [(ngModel)]="name" required maxlength="150" autocomplete="off" />
          <label>Tipo</label>
          <select name="type" [ngModel]="type" (ngModelChange)="changeType($event)">
            <option value="PF">PF</option>
            <option value="PJ">PJ</option>
          </select>
          <label>{{ type === 'PF' ? 'CPF' : 'CNPJ' }}</label>
          <input name="document" [(ngModel)]="document" required [appDocumentInput]="type" [maxlength]="type === 'PF' ? 14 : 18" [placeholder]="type === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'" inputmode="numeric" autocomplete="off" />
          @if (document && validateDocument(type, document)) {
            <small class="field-error">{{ validateDocument(type, document) }}</small>
          }

          @if (isNew) {
            <label>E-mail de acesso</label>
            <input name="email" type="email" [(ngModel)]="email" required maxlength="180" autocomplete="email" />
            <label>Senha inicial</label>
            <input name="password" type="password" [(ngModel)]="password" required minlength="8" maxlength="72" autocomplete="new-password" />
            @if (type === 'PF') {
              <label>Data de nascimento</label>
              <input name="birthDate" type="date" [(ngModel)]="birthDate" required />
            } @else {
              <label>Razão social</label>
              <input name="companyName" [(ngModel)]="companyName" required minlength="2" maxlength="200" autocomplete="organization" />
            }
            <label>Logradouro</label>
            <input name="street" [(ngModel)]="street" required maxlength="200" autocomplete="address-line1" />
            <label>Número</label>
            <input name="number" [(ngModel)]="number" required maxlength="20" autocomplete="off" />
            <label>Complemento (opcional)</label>
            <input name="complement" [(ngModel)]="complement" maxlength="100" autocomplete="address-line2" />
            <label>Bairro</label>
            <input name="district" [(ngModel)]="district" required maxlength="100" autocomplete="address-level3" />
            <label>Cidade</label>
            <input name="city" [(ngModel)]="city" required maxlength="100" autocomplete="address-level2" />
            <label>UF</label>
            <input name="state" [(ngModel)]="state" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="address-level1" />
            <label>CEP</label>
            <input name="zipCode" [(ngModel)]="zipCode" required pattern="[0-9]{5}-?[0-9]{3}" inputmode="numeric" autocomplete="postal-code" />
          }

          <button class="btn" type="submit">{{ isNew ? 'Criar cliente' : 'Salvar' }}</button>

          @if (!isNew) {
            <button class="btn" [class.red]="client?.status === 'Ativo'" [class.sec]="client?.status !== 'Ativo'" type="button" (click)="toggleStatus()">
              {{ client?.status === 'Ativo' ? 'Inativar cliente' : 'Reativar cliente' }}
            </button>
          }
        </form>
      } @else {
        <div class="card empty">Cliente não encontrado</div>
      }
    </app-shell>
  `,
})
export class ClientEditPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly clientService = inject(ClientService);
  private readonly toast = inject(ToastService);

  private readonly idParam = this.route.snapshot.paramMap.get('id') ?? 'novo';
  readonly isNew = this.idParam === 'novo';
  private readonly id = this.isNew ? -1 : Number(this.idParam);

  name = '';
  type: ClientType = 'PF';
  document = '';
  email = '';
  password = '';
  birthDate = '';
  companyName = '';
  street = '';
  number = '';
  complement = '';
  district = '';
  city = '';
  state = '';
  zipCode = '';

  readonly validateDocument = validateDocument;

  constructor() {
    if (!this.isNew) {
      void this.load();
    }
  }

  async load(): Promise<void> {
    const client = await this.clientService.getById(this.id);
    if (client) {
      this.name = client.name;
      this.type = client.type;
      this.document = client.document;
    }
  }

  get client(): Client | undefined {
    return this.isNew ? undefined : this.clientService.clients().find((c) => c.id === this.id);
  }

  async save(): Promise<void> {
    if (!this.name.trim()) {
      await this.toast.show('Informe o nome');
      return;
    }
    const documentError = validateDocument(this.type, this.document);
    if (documentError) {
      await this.toast.show(documentError);
      return;
    }

    try {
      if (this.isNew) {
        if (!this.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
          await this.toast.show('Informe um e-mail válido para o acesso do cliente');
          return;
        }
        if (this.password.length < 8 || this.password.length > 72) {
          await this.toast.show('A senha inicial deve ter entre 8 e 72 caracteres');
          return;
        }
        if (this.type === 'PF' && !this.birthDate) {
          await this.toast.show('Informe a data de nascimento');
          return;
        }
        if (this.type === 'PJ' && this.companyName.trim().length < 2) {
          await this.toast.show('Informe a razão social');
          return;
        }
        if ([this.street, this.number, this.district, this.city, this.state, this.zipCode].some((value) => !value.trim())) {
          await this.toast.show('Preencha todos os campos obrigatórios do endereço');
          return;
        }
        if (!/^[A-Za-z]{2}$/.test(this.state.trim()) || !/^\d{5}-?\d{3}$/.test(this.zipCode)) {
          await this.toast.show('Confira a UF e o CEP informados');
          return;
        }
        await this.clientService.add({
          name: this.name.trim(), type: this.type, document: normalizeDocument(this.document),
          email: this.email.trim(), password: this.password,
          ...(this.type === 'PF' ? { birthDate: this.birthDate } : { companyName: this.companyName.trim() }),
          address: {
            street: this.street, number: this.number, complement: this.complement,
            district: this.district, city: this.city, state: this.state, zipCode: this.zipCode,
          },
        });
      } else {
        await this.clientService.update(this.id, { name: this.name, type: this.type, document: normalizeDocument(this.document) });
      }
      await this.toast.show('Cliente salvo');
      await this.router.navigateByUrl('/admin/clientes');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar o cliente');
    }
  }

  changeType(type: ClientType): void {
    if (type !== this.type) this.document = '';
    this.type = type;
  }

  async toggleStatus(): Promise<void> {
    const updated = await this.clientService.toggleStatus(this.id);
    if (updated) {
      await this.toast.show('Cliente ' + updated.status.toLowerCase());
    }
  }
}
