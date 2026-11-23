import { Component, Input } from '@angular/core';

const STATUS_CLASS: Record<string, string> = {
  'Em manutenção': 'am',
  Alugado: 'az',
  'Em andamento': 'az',
  Concluída: 'cz',
  Cancelada: 'vm',
  'Locação cancelada': 'vm',
  Pendente: 'am',
};

@Component({
  selector: 'app-badge',
  standalone: true,
  template: `<span class="badge" [class]="'badge ' + statusClass">{{ status }}</span>`,
})
export class BadgeComponent {
  @Input({ required: true }) status = '';

  get statusClass(): string {
    return STATUS_CLASS[this.status] ?? '';
  }
}
