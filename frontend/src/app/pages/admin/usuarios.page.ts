import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Usuario } from '../../core/models';
import { UsuarioService } from '../../core/services/usuario.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [AppShellComponent],
  template: `
    <app-shell
      title="Gerenciar Funcionários"
      [back]="true"
      defaultHref="/admin/menu"
      [showNav]="true"
      role="admin"
      activeTab="menu"
    >
      <button class="btn create-btn" type="button" (click)="newUsuario()">Novo funcionário</button>

      @if (usuarioService.loading()) {
        <div class="card empty" role="status">Carregando funcionários...</div>
      } @else if (usuarioService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (usuario of funcionarios; track usuario.id) {
          <div class="card row card-click" (click)="edit(usuario)">
            <div>
              <b>{{ usuario.name }}</b>
              <div class="small muted">
                {{ usuario.email }}
                <span class="badge" [class.on]="usuario.type === 'admin'" [class.off]="usuario.type !== 'admin'">{{ usuario.type === 'admin' ? 'Administrador' : 'Funcionário' }}</span>
                <span class="badge" [class.active]="usuario.active" [class.inactive]="!usuario.active">
                  {{ usuario.active ? 'Ativo' : 'Inativo' }}
                </span>
              </div>
            </div>
            <span class="chev">›</span>
          </div>
        } @empty {
          <div class="card empty">Nenhum funcionário cadastrado</div>
        }
      }
    </app-shell>
  `,
  styles: [`
    .create-btn {
      width: 100%;
      min-height: 48px;
      margin: 16px 0;
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 8px;
      margin-right: 4px;
      text-transform: uppercase;
      font-weight: bold;
    }
    .badge.on { background: #e86f12; color: #fff; }
    .badge.off { background: #d1d1d1; color: #666; }
    .badge.active { background: #4caf50; color: #fff; }
    .badge.inactive { background: #b42318; color: #fff; }
  `],
})
export class UsuariosPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  readonly usuarioService = inject(UsuarioService);

  constructor() {
    void this.usuarioService.load();
  }

  get funcionarios(): Usuario[] {
    return this.usuarioService.usuarios().filter(
      (u) => u.type === 'admin' || u.type === 'funcionario',
    );
  }

  async load(): Promise<void> {
    await this.usuarioService.load();
  }

  async edit(usuario: Usuario): Promise<void> {
    await this.router.navigate(['/admin/usuarios', usuario.id]);
  }

  async newUsuario(): Promise<void> {
    await this.router.navigateByUrl('/admin/usuarios/novo');
  }
}
