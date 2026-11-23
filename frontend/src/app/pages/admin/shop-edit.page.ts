import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShopInput, ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

const emptyShop = (): ShopInput => ({ codigo: '', nome: '', telefone: '', email: '', logradouro: '', numero: '', complemento: null, bairro: '', cidade: '', uf: '', cep: '', ativa: true });

const states = [
  ['Acre', 'AC'], ['Alagoas', 'AL'], ['Amapá', 'AP'], ['Amazonas', 'AM'],
  ['Bahia', 'BA'], ['Ceará', 'CE'], ['Espírito Santo', 'ES'], ['Goiás', 'GO'],
  ['Maranhão', 'MA'], ['Mato Grosso', 'MT'], ['Mato Grosso do Sul', 'MS'], ['Minas Gerais', 'MG'],
  ['Pará', 'PA'], ['Paraíba', 'PB'], ['Paraná', 'PR'], ['Pernambuco', 'PE'],
  ['Piauí', 'PI'], ['Rio de Janeiro', 'RJ'], ['Rio Grande do Norte', 'RN'], ['Rio Grande do Sul', 'RS'],
  ['Rondônia', 'RO'], ['Roraima', 'RR'], ['Santa Catarina', 'SC'], ['São Paulo', 'SP'],
  ['Sergipe', 'SE'], ['Tocantins', 'TO'],
] as const;

@Component({
  selector: 'app-shop-edit',
  standalone: true,
  imports: [FormsModule, AppShellComponent],
  template: `
    <app-shell [title]="shopId ? 'Editar loja' : 'Adicionar loja'" [back]="true" defaultHref="/admin/lojas" [showNav]="true" role="admin" activeTab="menu">
      @if (loading) { <div class="card empty" role="status">Carregando loja...</div> }
      @else if (loadError) { <div class="card empty" role="alert">{{ loadError }}</div><button class="btn" type="button" (click)="load()">Tentar novamente</button> }
      @else {
        <form class="card" #form="ngForm" (ngSubmit)="save()">
          <h2>{{ shopId ? 'Editar loja' : 'Dados da loja' }}</h2>
          <label for="shop-code">Código comercial *</label><input id="shop-code" name="codigo" [(ngModel)]="model.codigo" required maxlength="30" autocomplete="off" />
          <label for="shop-name">Nome *</label><input id="shop-name" name="nome" [(ngModel)]="model.nome" required maxlength="150" />
          <label for="shop-phone">Telefone *</label><input id="shop-phone" name="telefone" [(ngModel)]="model.telefone" required type="tel" />
          <label for="shop-email">E-mail *</label><input id="shop-email" name="email" [(ngModel)]="model.email" required type="email" maxlength="180" />
          <label for="shop-street">Logradouro *</label><input id="shop-street" name="logradouro" [(ngModel)]="model.logradouro" required maxlength="200" />
          <label for="shop-number">Número *</label><input id="shop-number" name="numero" [(ngModel)]="model.numero" required maxlength="20" />
          <label for="shop-extra">Complemento</label><input id="shop-extra" name="complemento" [(ngModel)]="model.complemento" maxlength="100" />
          <label for="shop-district">Bairro *</label><input id="shop-district" name="bairro" [(ngModel)]="model.bairro" required maxlength="100" />
          <label for="shop-city">Cidade *</label><input id="shop-city" name="cidade" [(ngModel)]="model.cidade" required maxlength="100" />
           <label for="shop-state">Estado (UF) *</label>
           <select id="shop-state" name="uf" [(ngModel)]="model.uf" required>
             <option value="" disabled>Selecione o estado</option>
             @for (state of states; track state[1]) { <option [value]="state[1]">{{ state[0] }} ({{ state[1] }})</option> }
           </select>
          <label for="shop-zip">CEP *</label><input id="shop-zip" name="cep" [(ngModel)]="model.cep" required pattern="[0-9]{8}" inputmode="numeric" />
           <div class="shop-status">
             <span id="shop-active-label">Loja ativa</span>
             <button
               class="status-switch"
               [class.on]="model.ativa"
               type="button"
               role="switch"
               aria-labelledby="shop-active-label"
               [attr.aria-checked]="model.ativa"
               [disabled]="saving"
               (click)="toggleActive()"
             >
               <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
               <span>{{ model.ativa ? 'Ativa' : 'Inativa' }}</span>
             </button>
           </div>
          <div class="actions"><button class="btn" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Salvando...' : shopId ? 'Salvar alterações' : 'Cadastrar loja' }}</button><button class="lnk dark" type="button" (click)="back()">Voltar</button></div>
        </form>
      }
    </app-shell>
  `,
  styles: [`
    .shop-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 12px}
    .status-switch{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:#2b1a0d;font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:4px}
    .status-switch:focus-visible{outline:2px solid #e86f12;outline-offset:3px;border-radius:8px}
    .status-switch:disabled{cursor:default;opacity:.65}
    .switch-track{width:42px;height:24px;border-radius:999px;background:#a9a9a9;padding:3px;box-sizing:border-box;transition:background .18s ease}
    .status-switch.on .switch-track{background:#2e9d5b}
    .switch-thumb{display:block;width:18px;height:18px;border-radius:50%;background:white;transform:translateX(0);transition:transform .18s ease}
    .status-switch.on .switch-thumb{transform:translateX(18px)}
    .actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
    @media (prefers-reduced-motion:reduce){.switch-track,.switch-thumb{transition:none}}
  `],
})
export class ShopEditPage {
  readonly states = states;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shopService = inject(ShopService);
  private readonly toast = inject(ToastService);
  readonly shopId = Number(this.route.snapshot.paramMap.get('id')) || null;
  model = emptyShop();
  loading = false;
  saving = false;
  loadError: string | null = null;

  constructor() { if (this.shopId) void this.load(); }

  toggleActive(): void {
    if (!this.saving) this.model.ativa = !this.model.ativa;
  }

  async load(): Promise<void> {
    this.loading = true; this.loadError = null;
    try {
      const shop = this.shopService.shops().find((item) => item.id === this.shopId);
      if (shop) this.model = { ...shop };
      else { await this.shopService.load(); if (this.shopService.error()) throw new Error(this.shopService.error()!); const found = this.shopService.shops().find((item) => item.id === this.shopId); if (!found) throw new Error('Loja não encontrada.'); this.model = { ...found }; }
    } catch (error) { this.loadError = error instanceof Error ? error.message : 'Não foi possível carregar a loja.'; }
    finally { this.loading = false; }
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      await this.shopService.save(this.writePayload(), this.shopId ?? undefined);
      await this.toast.show(this.shopId ? 'Loja atualizada com sucesso.' : 'Loja cadastrada com sucesso.');
      await this.router.navigateByUrl('/admin/lojas');
    } catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar a loja.'); }
    finally { this.saving = false; }
  }

  private writePayload(): ShopInput {
    const { codigo, nome, telefone, email, logradouro, numero, complemento, bairro, cidade, uf, cep, ativa } = this.model;
    return { codigo, nome, telefone, email, logradouro, numero, complemento, bairro, cidade, uf, cep, ativa };
  }

  async back(): Promise<void> { await this.router.navigateByUrl('/admin/lojas'); }
}
