import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonIcon, IonImg } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline } from 'ionicons/icons';
import { todayISO } from '../../core/data';
import { RevisaoApi, Vehicle, VehicleStatus } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { RevisaoService } from '../../core/services/revisao.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ImageUrlService } from '../../core/services/image-url.service';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-vehicle-revisions',
  standalone: true,
  imports: [FormsModule, AppShellComponent, IonImg, IonIcon, CarComponent, DatePipe, CurrencyPipe],
  styles: [
    `
      .revision-photo {
        width: 100%;
        height: 200px;
        border-radius: 14px;
        object-fit: cover;
        display: block;
      }
      .revision-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      .revision-actions button {
        min-height: 34px;
        padding: 0 10px;
        font-size: 12px;
      }
      .revision-item { display: flex; align-items: center; gap: 12px; }
      .revision-info { min-width: 0; flex: 1; }
      .revision-tools { display: flex; gap: 4px; flex: none; }
      .revision-tools button { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 10px; background: transparent; color: #111; cursor: pointer; }
      .revision-tools button:hover { background: #fff0e2; }
      .revision-tools .delete { color: #b42318; }
      .revision-tools ion-icon { font-size: 19px; }
    `,
  ],
  template: `
    <app-shell
      title="Revisões e status"
      [back]="true"
      defaultHref="/admin/veiculos"
      [showNav]="true"
      [role]="null"
      activeTab="veiculos"
    >
      @if (vehicleService.loading()) {
        <div class="card empty" role="status">Carregando veículo...</div>
      } @else if (vehicleService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else if (vehicle; as v) {
        <div class="card">
          @if (photoUrl && !photoFailed) {
            <ion-img class="revision-photo" [src]="photoUrl" alt="Foto do veículo" (error)="photoFailed = true" />
          } @else {
            <div class="big"><app-car [color]="v.color" [fluid]="true" /></div>
          }
          <h2 style="margin-top: 10px">{{ v.name }}</h2>
        </div>

        <div class="card">
          <label>Status do veículo</label>
          <select [ngModel]="v.status" (ngModelChange)="changeStatus($event)">
            <option value="Disponível">Disponível</option>
            <option value="Alugado">Alugado</option>
            <option value="Em manutenção">Em manutenção</option>
          </select>
        </div>

        <div class="card">
          <b>Histórico de Revisões</b>
          @if (revisaoService.loading()) {
            <div class="card empty" role="status">Carregando revisões...</div>
          } @else if (revisaoService.error(); as error) {
            <div class="card empty" role="alert">{{ error }}</div>
            <button class="btn" type="button" (click)="loadRevisoes()">Tentar novamente</button>
          } @else {
            @for (revisao of revisoes; track revisao.id) {
              <div class="card revision-item">
                <div class="revision-info">
                  <span style="font-size: 12px; color: #7a5a40">
                    {{ revisao.data | date: 'dd/MM/yyyy' }}
                  </span>
                  <b>{{ revisao.descricao }}</b>
                </div>
                <div class="pr">
                  {{ revisao.km }} km · {{ revisao.valor | currency: 'BRL' }}
                </div>
                <div class="revision-tools">
                  <button type="button" aria-label="Editar revisão" title="Editar revisão" (click)="editRevisao(revisao)"><ion-icon name="create-outline"></ion-icon></button>
                  <button class="delete" type="button" aria-label="Excluir revisão" title="Excluir revisão" (click)="confirmDelete(revisao)"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
              </div>
            } @empty {
              <div style="font-size: 13px; color: #7a5a40">Sem revisões cadastradas</div>
            }
          }
        </div>

        <div class="card">
          <label>Quilometragem (km)</label>
          <input [(ngModel)]="km" type="number" placeholder="ex.: 15000" autocomplete="off" min="0" step="1" [readonly]="!!editingRevisaoId" />
          <label>Descrição</label>
          <textarea [(ngModel)]="descricao" placeholder="ex.: Troca de óleo e filtros" rows="3" maxlength="1000"></textarea>
          <label>Data da revisão</label>
          <input [(ngModel)]="data" type="date" />
          <label>Valor (R$)</label>
          <input [(ngModel)]="valor" type="number" placeholder="ex.: 250,00" autocomplete="off" min="0" step="0.01" />
          <div class="revision-actions">
            <button class="btn" type="button" [disabled]="savingRevisao" (click)="addRevisao(v.id)">
              {{ savingRevisao ? 'Salvando...' : 'Adicionar revisão' }}
            </button>
            <button class="lnk dark" type="button" [disabled]="savingRevisao" (click)="clearRevisaoForm()">Limpar</button>
          </div>
        </div>
      } @else {
        <div class="card empty">Veículo não encontrado</div>
      }
    </app-shell>
  `,
})
export class VehicleRevisionsPage {
  private readonly route = inject(ActivatedRoute);
  readonly vehicleService = inject(VehicleService);
  readonly revisaoService = inject(RevisaoService);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(AlertController);
  private readonly imageUrls = inject(ImageUrlService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  km = '';
  descricao = '';
  valor = 0;
  data = todayISO();
  photoFailed = false;
  savingRevisao = false;
  editingRevisaoId: string | null = null;

  constructor() {
    addIcons({ createOutline, trashOutline });
    void this.load();
    void this.loadRevisoes();
  }

  async load(): Promise<void> {
    await this.vehicleService.loadOne(this.id).catch(async (error: unknown) => {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo');
    });
  }

  async loadRevisoes(): Promise<void> {
    await this.revisaoService.loadByCarro(this.id).catch(async (error: unknown) => {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar as revisões');
    });
  }

  get vehicle(): Vehicle | undefined {
    return this.vehicleService.getById(this.id);
  }

  get revisoes(): RevisaoApi[] {
    return this.revisaoService.revisoes();
  }

  get photoUrl(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }

  async changeStatus(status: VehicleStatus): Promise<void> {
    try {
      await this.vehicleService.setStatus(this.id, status);
      await this.toast.show('Status atualizado');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível atualizar o status.');
    }
  }

  async addRevisao(carroId: number): Promise<void> {
    if (!this.descricao || !this.descricao.trim()) {
      await this.toast.show('Descreva a revisão');
      return;
    }
    if (!this.km || Number(this.km) < 0) {
      await this.toast.show('Informe uma quilometragem válida');
      return;
    }
    if (!this.valor || Number(this.valor) < 0) {
      await this.toast.show('Informe um valor válido');
      return;
    }

    this.savingRevisao = true;
    try {
      if (this.editingRevisaoId) {
        await this.revisaoService.update(this.editingRevisaoId, {
          descricao: this.descricao.trim(),
          valor: Number(this.valor),
          data: this.data,
        });
        await this.toast.show('Revisão atualizada com sucesso.');
        this.editingRevisaoId = null;
      } else {
        await this.revisaoService.create({
          data: this.data,
          descricao: this.descricao.trim(),
          km: Number(this.km),
          valor: Number(this.valor),
          carroId,
        });
        await this.toast.show('Revisão registrada com sucesso.');
      }
      this.clearRevisaoForm();
      await this.loadRevisoes();
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar a revisão.');
    } finally {
      this.savingRevisao = false;
    }
  }

  async editRevisao(revisao: RevisaoApi): Promise<void> {
    this.descricao = revisao.descricao;
    this.km = String(revisao.km);
    this.valor = revisao.valor;
    this.data = revisao.data.slice(0, 10);
    this.editingRevisaoId = revisao.id;
  }

  async confirmDelete(revisao: RevisaoApi): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Excluir revisão?',
      message: `A revisão “${revisao.descricao}” será removida permanentemente do histórico. Esta ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Excluir', role: 'destructive', handler: () => this.deleteRevisao(revisao.id) },
      ],
    });
    await alert.present();
  }

  async deleteRevisao(id: string): Promise<void> {
    try {
      await this.revisaoService.remove(id);
      await this.toast.show('Revisão excluída com sucesso.');
      await this.loadRevisoes();
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível excluir a revisão.');
    }
  }

  clearRevisaoForm(): void {
    this.km = '';
    this.descricao = '';
    this.valor = 0;
    this.data = todayISO();
    this.editingRevisaoId = null;
  }
}
