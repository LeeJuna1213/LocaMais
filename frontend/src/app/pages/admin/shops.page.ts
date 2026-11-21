import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { Shop, ShopInput, ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';

const emptyShop = (): ShopInput => ({ codigo: '', nome: '', telefone: '', email: '', logradouro: '', numero: '', complemento: null, bairro: '', cidade: '', uf: '', cep: '', ativa: true });

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  template: `
    <app-shell title="Lojas" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      @if (shops.loading()) { <div class="card empty" role="status">Carregando lojas...</div> }
      @else if (shops.error(); as error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="shops.load()">Tentar novamente</button> }
      @else {
        @for (shop of shops.shops(); track shop.id) {
          <article class="card">
            <div class="kv"><b>{{ shop.nome }}</b><span class="small">{{ shop.ativa ? 'Ativa' : 'Inativa' }}</span></div>
            <div class="small muted">{{ shop.codigo }} · {{ shop.cidade }}/{{ shop.uf }}</div>
            <div class="small">{{ shop.logradouro }}, {{ shop.numero }} · {{ shop.bairro }} · CEP {{ shop.cep }}</div>
            <div class="small">{{ shop.telefone }} · {{ shop.email }}</div>
            <div class="form-actions"><button class="lnk dark" type="button" (click)="edit(shop)">Editar</button><button class="lnk dark" type="button" (click)="toggle(shop)">{{ shop.ativa ? 'Desativar' : 'Ativar' }}</button></div>
          </article>
        } @empty { <div class="card empty">Nenhuma loja cadastrada.</div> }
      }

      <form class="card" #form="ngForm" (ngSubmit)="save()">
        <h2>{{ editingId ? 'Editar loja' : 'Cadastrar loja' }}</h2>
        <label>Código *</label><input name="codigo" [(ngModel)]="model.codigo" required maxlength="30" />
        <label>Nome *</label><input name="nome" [(ngModel)]="model.nome" required maxlength="150" />
        <label>Telefone *</label><input name="telefone" [(ngModel)]="model.telefone" required type="tel" />
        <label>E-mail *</label><input name="email" [(ngModel)]="model.email" required type="email" maxlength="180" />
        <label>Logradouro *</label><input name="logradouro" [(ngModel)]="model.logradouro" required maxlength="200" />
        <label>Número *</label><input name="numero" [(ngModel)]="model.numero" required maxlength="20" />
        <label>Complemento</label><input name="complemento" [(ngModel)]="model.complemento" maxlength="100" />
        <label>Bairro *</label><input name="bairro" [(ngModel)]="model.bairro" required maxlength="100" />
        <label>Cidade *</label><input name="cidade" [(ngModel)]="model.cidade" required maxlength="100" />
        <label>UF *</label><input name="uf" [(ngModel)]="model.uf" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" />
        <label>CEP *</label><input name="cep" [(ngModel)]="model.cep" required pattern="[0-9]{8}" inputmode="numeric" />
        <label class="active"><input name="ativa" type="checkbox" [(ngModel)]="model.ativa" /> Loja ativa</label>
        <div class="form-actions"><button class="btn" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar loja' }}</button>@if (editingId) { <button class="lnk dark" type="button" (click)="reset()">Cancelar edição</button> }</div>
      </form>
    </app-shell>
  `,
  styles: [`.form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.active{display:flex;align-items:center;gap:8px}.active input{width:auto;margin:0}`],
})
export class ShopsPage {
  readonly shops = inject(ShopService);
  private readonly toast = inject(ToastService);
  model = emptyShop();
  editingId: number | null = null;
  saving = false;
  constructor() { void this.shops.load(); }

  edit(shop: Shop): void { this.editingId = shop.id; this.model = { ...shop }; }
  async toggle(shop: Shop): Promise<void> {
    try { await this.shops.save({ ativa: !shop.ativa }, shop.id); await this.toast.show(`Loja ${shop.ativa ? 'desativada' : 'ativada'} com sucesso.`); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível atualizar a loja.'); }
  }
  async save(): Promise<void> {
    this.saving = true;
    try { await this.shops.save(this.model, this.editingId ?? undefined); await this.toast.show('Loja salva com sucesso.'); this.reset(); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar a loja.'); }
    finally { this.saving = false; }
  }
  reset(): void { this.model = emptyShop(); this.editingId = null; }
}
