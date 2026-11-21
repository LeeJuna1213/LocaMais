import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, trashOutline } from 'ionicons/icons';

import { Transmission, Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { VehicleService, VehicleWriteInput } from '../../core/services/vehicle.service';
import { vehiclePhotoError } from '../../core/utils/photo.validation';
import { AppShellComponent } from '../../shared/components/app-shell.component';

type VehicleField = 'placa' | 'marca' | 'modelo' | 'categoria' | 'ano' | 'valorDiaria' | 'lugares';

@Component({
  selector: 'app-new-vehicle',
  standalone: true,
  imports: [FormsModule, IonIcon, AppShellComponent],
  styles: [`
    .vehicle-form { display: grid; gap: 4px; }
    .field-error { color: #b42318; font-size: 12px; margin: -2px 0 8px; }
    input[aria-invalid="true"], select[aria-invalid="true"] { border-color: #b42318; }
    .form-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .form-actions button:focus-visible { outline: 2px solid #e86f12; outline-offset: 2px; }
    .photo-section { margin-bottom: 12px; }
    .photo-label { font-weight: 600; color: #7a5a40; }
    .photo-dropzone {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 4px; min-height: 130px; padding: 12px; border: 2px dashed #e2cdb8;
      border-radius: 16px; background: #fffaf5; text-align: center; color: #7a5a40;
    }
    .photo-dropzone ion-icon { font-size: 30px; color: #e86f12; }
    .photo-dropzone p { margin: 0; font-size: 13px; font-weight: 600; color: #2b1a0d; }
    .photo-dropzone small { font-size: 11px; }
    .photo-dropzone img {
      width: 100%; max-height: 190px; object-fit: cover; border-radius: 12px;
    }
    .file-input { display: none; }
    .photo-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
    .photo-actions .btn { width: auto; min-width: 150px; margin-top: 8px; }
    .photo-actions .lnk { width: auto; margin-top: 8px; }
    .photo-actions .remove-photo {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      min-height: 40px; padding: 8px 12px; border: 1px solid #b42318; border-radius: 12px;
      background: #fff; color: #b42318; font: inherit; font-weight: 600; cursor: pointer;
    }
    .photo-actions .remove-photo ion-icon { font-size: 18px; }
    input[type="number"] { color-scheme: light; }
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button { opacity: 1; background: transparent; filter: grayscale(1); }
    .photo-file-name { font-size: 11px; color: #7a5a40; overflow-wrap: anywhere; }
  `],
  template: `
    <app-shell
      [title]="editing ? 'Editar veículo' : 'Cadastrar veículo'"
      [back]="true"
      defaultHref="/admin/veiculos"
      [showNav]="true"
      role="admin"
      activeTab="veiculos"
    >
      @if (!ready) {
        <div class="card empty" role="status">{{ loadError || 'Carregando veículo...' }}</div>
        @if (loadError) {
          <button class="btn" type="button" (click)="loadVehicle()">Tentar novamente</button>
        }
      } @else {
        <form #vehicleForm="ngForm" class="card vehicle-form" novalidate (ngSubmit)="save()">
          <div class="photo-section">
              <label class="photo-label">Foto do veículo (opcional)</label>
              <div class="photo-dropzone">
                @if (previewUrl) {
                  <img [src]="previewUrl" alt="Pré-visualização da foto selecionada" />
                  <span class="photo-file-name">{{ pendingPhoto?.name }}</span>
                } @else if (editing && currentPhotoUrl && !removeCurrentPhoto) {
                  <img [src]="currentPhotoUrl" alt="Foto atual do veículo" />
                  <p>Foto atual</p>
                } @else {
                  <ion-icon name="camera-outline" aria-hidden="true"></ion-icon>
                  <p>Adicione uma foto do veículo</p>
                  <small>JPG, PNG ou WebP · até 5 MB</small>
                }
              </div>
              <input
                #photoInput
                class="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                aria-label="Selecionar foto do veículo"
                (change)="selectPhoto($event)"
              />
              <div class="photo-actions">
                <button class="btn sec" type="button" [disabled]="saving" (click)="photoInput.click()">
                  {{ previewUrl || currentPhotoUrl ? 'Trocar foto' : 'Selecionar foto' }}
                </button>
                @if (previewUrl || photoError || (editing && currentPhotoUrl && !removeCurrentPhoto)) {
                  <button class="remove-photo" type="button" [disabled]="saving" (click)="removePhoto()" [attr.aria-label]="previewUrl ? 'Cancelar foto selecionada' : 'Remover foto do veículo'" [title]="previewUrl ? 'Cancelar foto selecionada' : 'Remover foto do veículo'">
                    <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
                    <span>{{ previewUrl ? 'Cancelar seleção' : 'Remover foto' }}</span>
                  </button>
                }
              </div>
              @if (photoError) { <div class="field-error" role="alert">{{ photoError }}</div> }
          </div>

          <h2>Dados do veículo</h2>

          <label for="vehicle-plate">Placa *</label>
          <input id="vehicle-plate" name="placa" [(ngModel)]="placa" required maxlength="20" autocomplete="off" [attr.aria-invalid]="fieldError('placa') ? 'true' : null" />
          @if (fieldError('placa'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-make">Marca *</label>
          <input id="vehicle-make" name="marca" [(ngModel)]="marca" required maxlength="100" autocomplete="off" [attr.aria-invalid]="fieldError('marca') ? 'true' : null" />
          @if (fieldError('marca'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-model">Modelo *</label>
          <input id="vehicle-model" name="modelo" list="vehicle-model-options" [(ngModel)]="modelo" required maxlength="100" autocomplete="off" [attr.aria-invalid]="fieldError('modelo') ? 'true' : null" />
          <datalist id="vehicle-model-options">
            @for (option of modelOptions; track option) { <option [value]="option"></option> }
          </datalist>
          @if (fieldError('modelo'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-category">Categoria *</label>
          <input id="vehicle-category" name="categoria" [(ngModel)]="categoria" required maxlength="50" autocomplete="off" [attr.aria-invalid]="fieldError('categoria') ? 'true' : null" />
          @if (fieldError('categoria'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-year">Ano *</label>
          <input id="vehicle-year" name="ano" type="number" [(ngModel)]="ano" required min="1900" [max]="maximumYear" step="1" [attr.aria-invalid]="fieldError('ano') ? 'true' : null" />
          @if (fieldError('ano'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-rate">Valor da diária (R$) *</label>
          <input id="vehicle-rate" name="valorDiaria" type="number" [(ngModel)]="valorDiaria" required min="0.01" step="0.01" [attr.aria-invalid]="fieldError('valorDiaria') ? 'true' : null" />
          @if (fieldError('valorDiaria'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-status">Status</label>
          <select id="vehicle-status" name="status" [(ngModel)]="status">
            <option value="disponivel">Disponível</option>
            <option value="alugado">Alugado</option>
            <option value="em manutenção">Em manutenção</option>
          </select>

          <label for="vehicle-transmission">Câmbio *</label>
          <select id="vehicle-transmission" name="transmission" [(ngModel)]="transmission" required>
            <option value="" disabled>Selecione o câmbio</option>
            <option value="Automático">Automático</option>
            <option value="Manual">Manual</option>
          </select>

          <label for="vehicle-seats">Lugares *</label>
          <input id="vehicle-seats" name="lugares" type="number" inputmode="numeric" [(ngModel)]="lugares" required min="1" max="9" step="1" [attr.aria-invalid]="fieldError('lugares') ? 'true' : null" />
          @if (fieldError('lugares'); as error) { <div class="field-error" role="alert">{{ error }}</div> }

          <label for="vehicle-description">Descrição</label>
          <textarea id="vehicle-description" name="descricao" [(ngModel)]="descricao" maxlength="1000" rows="4" placeholder="Descrição opcional do veículo"></textarea>

          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="saving">
              {{ saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar veículo' }}
            </button>
            <button class="lnk dark" type="button" [disabled]="saving" (click)="cancel()">Cancelar</button>
          </div>
        </form>
      }
    </app-shell>
  `,
})
export class NewVehiclePage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vehicleService = inject(VehicleService);
  private readonly toast = inject(ToastService);
  private readonly imageUrls = inject(ImageUrlService);
  // O app roda sem zone.js: estados alterados depois de um `await` precisam
  // marcar a view para não ficarem presos em "Carregando..." (issue de edição).
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly maximumYear = new Date().getFullYear() + 1;
  readonly vehicleId = Number(this.route.snapshot.paramMap.get('id'));
  readonly editing = Number.isInteger(this.vehicleId) && this.vehicleId > 0;

  placa = '';
  marca = '';
  modelo = '';
  categoria = '';
  ano = new Date().getFullYear();
  valorDiaria = 100;
  status: NonNullable<VehicleWriteInput['status']> = 'disponivel';
  transmission: Transmission | '' = '';
  lugares: number | null = null;
  descricao = '';
  currentPhoto: string | null = null;
  removeCurrentPhoto = false;
  ready = !this.editing;
  saving = false;
  submitted = false;
  loadError: string | null = null;
  pendingPhoto: File | null = null;
  previewUrl: string | null = null;
  photoError: string | null = null;
  private baseline: VehicleWriteInput | null = null;
  private baselinePhoto: string | null = null;

  constructor() {
    addIcons({ cameraOutline, trashOutline });
  }

  ngOnInit(): void {
    void this.vehicleService.load();
    if (this.editing) void this.loadVehicle();
  }

  ngOnDestroy(): void {
    this.releasePreview();
  }

  async loadVehicle(): Promise<void> {
    this.ready = false;
    this.loadError = null;
    this.changeDetector.markForCheck();
    try {
      const vehicle = await this.vehicleService.loadOne(this.vehicleId);
      if (!vehicle?.plate || !vehicle.make || !vehicle.model || vehicle.year === undefined) {
        throw new Error('Os dados do veículo não estão disponíveis para edição.');
      }
      this.placa = vehicle.plate;
      this.marca = vehicle.make;
      this.modelo = vehicle.model;
      this.categoria = vehicle.category;
      this.ano = vehicle.year;
      this.valorDiaria = vehicle.pricePerDay;
      this.status = vehicle.status === 'Disponível' ? 'disponivel'
        : vehicle.status === 'Alugado' ? 'alugado' : 'em manutenção';
      this.transmission = vehicle.transmission ?? '';
      this.lugares = vehicle.lugares ?? null;
      this.descricao = vehicle.descricao ?? '';
      this.currentPhoto = vehicle.photo ?? null;
      this.baselinePhoto = this.currentPhoto;
      this.baseline = this.payload();
      this.ready = true;
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Não foi possível carregar o veículo.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  get currentPhotoUrl(): string | null {
    return this.imageUrls.resolve(this.currentPhoto);
  }

  get modelOptions(): string[] {
    const seen = new Set<string>();
    return this.vehicleService.vehicles().map((vehicle) => vehicle.model?.trim().replace(/\s+/g, ' '))
      .filter((model): model is string => !!model)
      .filter((model) => {
        const normalized = model.toLocaleLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  fieldError(field: VehicleField): string | null {
    if (!this.submitted) return null;
    const values: Record<VehicleField, string | number | null> = {
      placa: this.placa,
      marca: this.marca,
      modelo: this.modelo,
      categoria: this.categoria,
      ano: this.ano,
      valorDiaria: this.valorDiaria,
      lugares: this.lugares,
    };
    const value = values[field];
    if (value === null || (typeof value === 'string' && !value.trim())) return 'Este campo é obrigatório.';
    if (field === 'placa' && this.placa.trim().length > 20) return 'A placa deve ter no máximo 20 caracteres.';
    if (field === 'marca' && this.marca.trim().length > 100) return 'A marca deve ter no máximo 100 caracteres.';
    if (field === 'modelo' && this.modelo.trim().length > 100) return 'O modelo deve ter no máximo 100 caracteres.';
    if (field === 'categoria' && this.categoria.trim().length > 50) return 'A categoria deve ter no máximo 50 caracteres.';
    if (field === 'ano' && (!Number.isInteger(this.ano) || this.ano < 1900 || this.ano > this.maximumYear)) {
      return `Informe um ano inteiro entre 1900 e ${this.maximumYear}.`;
    }
    if (field === 'valorDiaria' && (!Number.isFinite(this.valorDiaria) || this.valorDiaria <= 0)) {
      return 'O valor da diária deve ser maior que zero.';
    }
    if (field === 'lugares' && (this.lugares === null || !Number.isInteger(this.lugares) || this.lugares < 1 || this.lugares > 9)) {
      return 'Informe um número inteiro de lugares entre 1 e 9.';
    }
    return null;
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const error = vehiclePhotoError(file);
    if (error) {
      this.discardPhoto();
      this.photoError = error;
      this.changeDetector.markForCheck();
      return;
    }

    this.discardPhoto();
    this.pendingPhoto = file;
    this.previewUrl = URL.createObjectURL(file);
    this.removeCurrentPhoto = false;
    this.photoError = null;
    this.changeDetector.markForCheck();
  }

  removePhoto(): void {
    if (this.previewUrl) {
      this.discardPhoto();
    } else if (this.editing && this.currentPhoto) {
      this.removeCurrentPhoto = true;
    }
    this.photoError = null;
    this.changeDetector.markForCheck();
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.submitted = true;
    const invalid = (['placa', 'marca', 'modelo', 'categoria', 'ano', 'valorDiaria', 'lugares'] as const)
      .some((field) => this.fieldError(field) !== null);
    if (invalid) {
      this.changeDetector.markForCheck();
      await this.toast.show('Revise os campos destacados antes de continuar.');
      return;
    }
    if (!this.transmission) {
      await this.toast.show('Selecione o câmbio do veículo.');
      return;
    }

    this.saving = true;
    this.changeDetector.markForCheck();
    try {
      if (this.photoError) throw new Error(this.photoError);
      let message: string;
      if (this.editing) {
        const current = this.payload();
        const changes: Partial<VehicleWriteInput> = {};
        for (const key of Object.keys(current) as (keyof VehicleWriteInput)[]) {
          if (current[key] !== this.baseline?.[key]) Object.assign(changes, { [key]: current[key] });
        }
        if (Object.keys(changes).length > 0) await this.vehicleService.update(this.vehicleId, changes);
        let photoChanged = false;
        if (this.pendingPhoto) {
          const updated = await this.vehicleService.uploadPhoto(this.vehicleId, this.pendingPhoto);
          this.currentPhoto = updated.photo ?? null;
          this.discardPhoto();
          photoChanged = true;
        } else if (this.removeCurrentPhoto && this.baselinePhoto) {
          const updated = await this.vehicleService.removePhoto(this.vehicleId);
          this.currentPhoto = updated.photo ?? null;
          this.removeCurrentPhoto = false;
          photoChanged = true;
        }
        message = Object.keys(changes).length || photoChanged ? 'Veículo atualizado com sucesso.' : 'Nenhuma alteração para salvar.';
      } else {
        const created = await this.vehicleService.create(this.payload());
        message = 'Veículo cadastrado com sucesso.';
        if (this.pendingPhoto) {
          // A API não aceita a imagem no POST do carro: o upload usa o ID gerado.
          try {
            await this.vehicleService.uploadPhoto(created.id, this.pendingPhoto);
          } catch (error) {
            const detail = error instanceof Error ? error.message : 'erro desconhecido';
            message = `Veículo cadastrado, mas a foto não foi enviada (${detail}). Adicione a foto pelo menu de ações do veículo.`;
          }
        }
      }
      await this.toast.show(message);
      await this.router.navigateByUrl('/admin/veiculos');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar o veículo.');
      this.changeDetector.markForCheck();
    } finally {
      this.saving = false;
    }
  }

  async cancel(): Promise<void> {
    await this.router.navigateByUrl('/admin/veiculos');
  }

  private payload(): VehicleWriteInput {
    const normalizedModel = this.modelo.trim().replace(/\s+/g, ' ');
    const existingModel = this.modelOptions.find((model) => model.toLocaleLowerCase() === normalizedModel.toLocaleLowerCase());
    return {
      placa: this.placa.trim(),
      marca: this.marca.trim(),
      modelo: existingModel ?? normalizedModel,
      categoria: this.categoria.trim(),
      ano: Number(this.ano),
      valorDiaria: Number(this.valorDiaria),
      status: this.status,
      cambio: this.transmission || null,
      lugares: Number(this.lugares),
      descricao: this.descricao.trim() || null,
    };
  }

  private discardPhoto(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.pendingPhoto = null;
  }

  private releasePreview(): void {
    this.discardPhoto();
  }
}
