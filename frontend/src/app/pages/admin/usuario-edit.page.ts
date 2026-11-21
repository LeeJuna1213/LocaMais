import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { Usuario } from '../../core/models';
import { UsuarioService } from '../../core/services/usuario.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-usuario-edit',
  standalone: true,
  imports: [FormsModule, IonIcon, AppShellComponent],
  template: `
    <app-shell
      [title]="isNew ? 'Novo funcionário' : 'Editar funcionário'"
      [back]="true"
      defaultHref="/admin/usuarios"
      [showNav]="true"
      role="admin"
      activeTab="menu"
    >
      @if (usuarioService.loading() && !isNew) {
        <div class="card empty" role="status">Carregando funcionário...</div>
      } @else if (usuarioService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else if (isNew || usuario) {
        <div class="card">
          <label for="usuario-name">Nome completo *</label>
          <input id="usuario-name" name="name" [(ngModel)]="name" required maxlength="150" autocomplete="off" />

          <label for="usuario-email">E-mail *</label>
          <input id="usuario-email" name="email" type="email" [(ngModel)]="email" required maxlength="180" autocomplete="email" />

          <label for="usuario-type">Perfil *</label>
          <select id="usuario-type" name="type" [(ngModel)]="type">
            <option value="funcionario">Funcionário</option>
            <option value="admin">Administrador</option>
          </select>

          <div class="password-field">
            <label for="usuario-password">Senha *</label>
            <input
              id="usuario-password"
              name="password"
              [type]="showPassword ? 'text' : 'password'"
              [(ngModel)]="password"
              required
              minlength="8"
              maxlength="72"
              autocomplete="new-password"
            />
            <button type="button" class="pw-toggle" (click)="togglePassword()" [attr.aria-label]="showPassword ? 'Ocultar senha' : 'Exibir senha'">
              <ion-icon [name]="showPassword ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
            </button>
          </div>

          <label for="usuario-active">Ativo</label>
          <select id="usuario-active" name="active" [(ngModel)]="activeStr">
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>

          <div class="form-actions">
            <button class="btn" type="button" [disabled]="saving" (click)="save()">
              {{ saving ? 'Salvando...' : isNew ? 'Cadastrar funcionário' : 'Salvar alterações' }}
            </button>
            <button class="lnk dark" type="button" [disabled]="saving" (click)="cancel()">Cancelar</button>
            @if (!isNew && usuario && usuario.type !== 'admin' && auth.role() === 'admin') {
              <button class="btn red" type="button" [disabled]="saving" (click)="desativar()">
                {{ usuarioActive ? 'Desativar' : 'Reativar' }}
              </button>
            }
          </div>
        </div>
      } @else {
        <div class="card empty">Funcionário não encontrado</div>
      }
    </app-shell>
  `,
  styles: [`
    .password-field { position: relative; }
    .password-field input {
      padding-right: 36px;
    }
    .pw-toggle {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      color: #e86f12;
    }
    .pw-toggle ion-icon { font-size: 20px; color: #e86f12; }
    .form-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .form-actions button { min-height: 38px; }
  `],
})
export class UsuarioEditPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly usuarioService = inject(UsuarioService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly idParam = this.route.snapshot.paramMap.get('id') ?? 'novo';
  readonly isNew = this.idParam === 'novo';
  private readonly id = this.isNew ? -1 : Number(this.idParam);

  name = '';
  email = '';
  type: 'admin' | 'funcionario' = 'funcionario';
  password = '';
  activeStr = 'true';
  showPassword = false;
  saving = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });

    if (!this.isNew) {
      void this.load();
    }
  }

  async load(): Promise<void> {
    const found = this.usuarioService.usuarios().find((u) => u.id === this.id);
    if (found) {
      this.name = found.name;
      this.email = found.email;
      this.type = found.type as 'admin' | 'funcionario';
      this.activeStr = found.active ? 'true' : 'false';
    }
  }

  get usuario(): Usuario | undefined {
    return this.usuarioService.usuarios().find((u) => u.id === this.id);
  }

  get usuarioActive(): boolean {
    return this.usuario?.active ?? true;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  async save(): Promise<void> {
    if (!this.name || !this.email || !this.password) {
      await this.toast.show('Preencha todos os campos obrigatórios.');
      return;
    }
    if (this.password.length < 8) {
      await this.toast.show('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    this.saving = true;
    try {
      if (this.isNew) {
        await this.usuarioService.create({
          name: this.name.trim(),
          email: this.email.trim(),
          password: this.password,
          type: this.type,
        });
        await this.toast.show('Funcionário cadastrado com sucesso.');
      } else {
        await this.usuarioService.update(this.id, {
          name: this.name.trim(),
          email: this.email.trim(),
          password: this.password,
          active: this.activeStr === 'true',
        });
        await this.toast.show('Funcionário atualizado com sucesso.');
      }
      await this.router.navigateByUrl('/admin/usuarios');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível salvar o funcionário.');
    } finally {
      this.saving = false;
    }
  }

  async desativar(): Promise<void> {
    const usuario = this.usuario;
    if (!usuario) return;
    await this.usuarioService.update(this.id, { active: !usuario.active });
    await this.toast.show(`Funcionário ${usuario.active ? 'desativado' : 'reativado'} com sucesso.`);
    await this.router.navigateByUrl('/admin/usuarios');
  }

  async cancel(): Promise<void> {
    await this.router.navigateByUrl('/admin/usuarios');
  }
}
