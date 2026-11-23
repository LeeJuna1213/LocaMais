import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { SystemSettingsService } from '../../core/services/system-settings.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-service-fee',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, AppShellComponent],
  template: `
    <app-shell title="Taxa de serviço" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      @if (settings.loading()) { <div class="card empty" role="status">Carregando configuração...</div> }
      @if (settings.error(); as error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="load()">Tentar novamente</button> }
      <form class="card" #form="ngForm" (ngSubmit)="save()">
        <p>Valor aplicado a novas reservas. Reservas já criadas mantêm a taxa registrada no momento da criação.</p>
        <div class="current">Atual: <b>{{ settings.serviceFee() | currency:'BRL' }}</b></div>
        <label for="service-fee">Taxa de serviço (R$)</label>
        <input id="service-fee" class="service-fee-input" name="valor" type="number" min="0" step="0.01" inputmode="decimal" required [(ngModel)]="value" />
        <button class="btn" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Salvando...' : 'Salvar taxa' }}</button>
      </form>
    </app-shell>
  `,
  styles: [`
    .current { margin:12px 0 18px; color:#7a5a40; }
    .service-fee-input { color-scheme:light; }
    .service-fee-input::-webkit-inner-spin-button,
    .service-fee-input::-webkit-outer-spin-button { opacity:1; background:transparent; filter:grayscale(1); }
  `],
})
export class ServiceFeePage {
  readonly settings = inject(SystemSettingsService);
  private readonly toast = inject(ToastService);
  value = 0;
  saving = false;
  constructor() { void this.load(); }
  async load(): Promise<void> { try { this.value = await this.settings.load(); } catch { /* surfaced in the page state */ } }
  async save(): Promise<void> {
    if (!Number.isFinite(this.value) || this.value < 0) return;
    this.saving = true;
    try { this.value = await this.settings.save(this.value); await this.toast.show('Taxa de serviço salva com sucesso.'); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar a taxa.'); }
    finally { this.saving = false; }
  }
}
