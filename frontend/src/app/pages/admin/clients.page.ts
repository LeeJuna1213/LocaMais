import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Client } from '../../core/models';
import { ClientService } from '../../core/services/client.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  template: `
    <app-shell title="Clientes" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <input placeholder="Buscar cliente..." [ngModel]="query" (ngModelChange)="query = $event" autocomplete="off" />

      @if (clientService.loading()) {
        <div class="card empty" role="status">Carregando clientes...</div>
      } @else if (clientService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (client of filteredClients; track client.id) {
          <div class="card row card-click" (click)="edit(client)">
            <div>
              <b>{{ client.name }}</b>
              <div class="small muted">{{ client.type }} - {{ client.status }}</div>
            </div>
            <span class="chev">›</span>
          </div>
        } @empty {
          <div class="card empty">Nenhum cliente</div>
        }
      }

      <button class="btn" type="button" (click)="newClient()">Novo cliente</button>
    </app-shell>
  `,
})
export class ClientsPage {
  private readonly router = inject(Router);
  readonly clientService = inject(ClientService);

  query = '';

  constructor() {
    void this.clientService.load();
  }

  async load(): Promise<void> {
    await this.clientService.load();
  }

  get filteredClients(): Client[] {
    const term = this.query.trim().toLowerCase();
    return this.clientService.clients().filter((client) => client.name.toLowerCase().includes(term));
  }

  async edit(client: Client): Promise<void> {
    await this.router.navigate(['/admin/clientes', client.id]);
  }

  async newClient(): Promise<void> {
    await this.router.navigate(['/admin/clientes', 'novo']);
  }
}
