import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client, ClientType } from '../../core/models';
import { ClientService } from '../../core/services/client.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-client-edit',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
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
        <div class="card">
          <label>Nome</label>
          <input [(ngModel)]="name" autocomplete="off" />
          <label>Tipo</label>
          <select [(ngModel)]="type">
            <option value="PF">PF</option>
            <option value="PJ">PJ</option>
          </select>
          <label>CPF/CNPJ</label>
          <input [(ngModel)]="document" autocomplete="off" />
          <button class="btn" type="button" (click)="save()">Salvar</button>

          @if (!isNew) {
            <button class="btn" [class.red]="client?.status === 'Ativo'" [class.sec]="client?.status !== 'Ativo'" type="button" (click)="toggleStatus()">
              {{ client?.status === 'Ativo' ? 'Inativar cliente' : 'Reativar cliente' }}
            </button>
          }
        </div>
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
    if (!this.name) {
      await this.toast.show('Informe o nome');
      return;
    }
    if (this.isNew) {
      await this.clientService.add({ name: this.name, type: this.type, document: this.document });
    } else {
      await this.clientService.update(this.id, { name: this.name, type: this.type, document: this.document });
    }
    await this.toast.show('Cliente salvo');
    await this.router.navigateByUrl('/admin/clientes');
  }

  async toggleStatus(): Promise<void> {
    const updated = await this.clientService.toggleStatus(this.id);
    if (updated) {
      await this.toast.show('Cliente ' + updated.status.toLowerCase());
    }
  }
}
