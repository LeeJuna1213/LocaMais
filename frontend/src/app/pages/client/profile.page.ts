import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [AppShellComponent],
  template: `
    <app-shell title="Meu perfil" [showNav]="true" role="client" activeTab="perfil">
      <div class="card">
        <div class="row" style="justify-content: flex-start">
          <div class="avatar">{{ initial }}</div>
          <div>
            <b>{{ profile.name }}</b>
            <div class="small muted">{{ profile.email }}<br />{{ profile.phone || 'Telefone não informado' }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        @for (section of sections; track section) {
          <button class="mn" type="button" (click)="openSection(section)">
            {{ section }}<span>›</span>
          </button>
        }
      </div>

      <button class="btn red" type="button" (click)="logout()">Sair da conta</button>
    </app-shell>
  `,
})
export class ProfilePage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly sections = ['Dados pessoais', 'CNH', 'Alterar senha', 'Endereço', 'Preferências'];

  get profile() {
    return this.auth.profile();
  }

  get initial(): string {
    return (this.profile.name[0] || '?').toUpperCase();
  }

  async openSection(section: string): Promise<void> {
    await this.router.navigate(['/client/perfil', section]);
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
