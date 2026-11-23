import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, powerOutline, trashOutline } from 'ionicons/icons';
import { Client } from '../../core/models';
import { ClientService } from '../../core/services/client.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [FormsModule, AppShellComponent, IonIcon],
  styles: [`
    .client-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .client-info { min-width:0; flex:1; }
    .client-actions { display:flex; align-items:center; gap:6px; }
    .client-actions button { min-width:38px; min-height:38px; border:0; border-radius:8px; background:transparent; color:var(--ion-color-medium-shade); }
    .client-actions button.danger { color:var(--ion-color-danger); }
    .client-actions ion-icon { font-size:20px; }
    .client-name-line { display:flex; align-items:center; gap:8px; }
    .status-badge { display:inline-block; padding:2px 7px; border-radius:10px; background:#fee4e2; color:#b42318; font-size:11px; font-weight:600; }
    @media (max-width:420px) { .client-row { align-items:flex-start; } .client-actions { gap:0; } }
  `],
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
          <div class="card row client-row">
            <div class="client-info">
              <div class="client-name-line">
                <b>{{ client.name }}</b>
                @if (client.status === 'Inativo') { <span class="status-badge">Inativo</span> }
              </div>
              <div class="small muted">{{ client.type }} - {{ client.status }}</div>
            </div>
            <div class="client-actions">
              <button type="button" [attr.aria-label]="'Editar ' + client.name" title="Editar" (click)="edit(client)"><ion-icon name="create-outline"></ion-icon></button>
              <button type="button" [attr.aria-label]="(client.status === 'Ativo' ? 'Inativar ' : 'Reativar ') + client.name" [title]="client.status === 'Ativo' ? 'Inativar' : 'Reativar'" (click)="toggleStatus(client)"><ion-icon name="power-outline"></ion-icon></button>
              @if (canDelete) { <button class="danger" type="button" [attr.aria-label]="'Excluir ' + client.name" title="Excluir" (click)="confirmDelete(client)"><ion-icon name="trash-outline"></ion-icon></button> }
            </div>
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
  private readonly alerts = inject(AlertController);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  readonly clientService = inject(ClientService);
  readonly canDelete = this.auth.role() === 'admin';

  query = '';

  constructor() {
    addIcons({ createOutline, powerOutline, trashOutline });
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

  async toggleStatus(client: Client): Promise<void> {
    try {
      const updated = await this.clientService.toggleStatus(client.id);
      if (updated) await this.toast.show(`Cliente ${updated.status.toLowerCase()}.`);
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível alterar o status.');
    }
  }

  async confirmDelete(client: Client): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Excluir cliente?',
      message: `O cadastro de “${client.name}” será excluído da gestão. Reservas e histórico serão preservados.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Excluir', role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
    try {
      await this.clientService.remove(client.id);
      await this.toast.show('Cliente excluído. O histórico foi preservado.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível excluir o cliente.');
    }
  }
}
