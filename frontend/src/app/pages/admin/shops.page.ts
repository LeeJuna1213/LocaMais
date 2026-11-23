import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { Shop, ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [AppShellComponent],
  template: `
    <app-shell title="Lojas" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <button class="btn add-shop" type="button" (click)="newShop()">Adicionar loja</button>
      @if (shops.loading()) { <div class="card empty" role="status">Carregando lojas...</div> }
      @else if (shops.error(); as error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="shops.load()">Tentar novamente</button> }
      @else {
        @for (shop of shops.shops(); track shop.id) {
          <article class="card">
            <div class="kv"><b>{{ shop.nome }}</b><span class="small">{{ shop.ativa ? 'Ativa' : 'Inativa' }}</span></div>
            <div class="small muted">Código comercial: {{ shop.codigo }} · {{ shop.cidade }}/{{ shop.uf }}</div>
            <div class="small">{{ shop.logradouro }}, {{ shop.numero }} · {{ shop.bairro }} · CEP {{ shop.cep }}</div>
            <div class="small">{{ shop.telefone }} · {{ shop.email }}</div>
            <div class="form-actions"><button class="lnk dark" type="button" (click)="edit(shop)">Editar</button><button class="lnk dark" type="button" (click)="toggle(shop)">{{ shop.ativa ? 'Desativar' : 'Ativar' }}</button></div>
          </article>
        } @empty { <div class="card empty">Nenhuma loja cadastrada.</div> }
      }

    </app-shell>
  `,
  styles: [`.add-shop{margin-bottom:20px}.form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}`],
})
export class ShopsPage {
  private readonly router = inject(Router);
  readonly shops = inject(ShopService);
  private readonly toast = inject(ToastService);
  constructor() { void this.shops.load(); }

  newShop(): void { void this.router.navigateByUrl('/admin/lojas/novo'); }
  edit(shop: Shop): void { void this.router.navigate(['/admin/lojas', shop.id]); }
  async toggle(shop: Shop): Promise<void> {
    try { await this.shops.save({ ativa: !shop.ativa }, shop.id); await this.toast.show(`Loja ${shop.ativa ? 'desativada' : 'ativada'} com sucesso.`); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível atualizar a loja.'); }
  }
}
