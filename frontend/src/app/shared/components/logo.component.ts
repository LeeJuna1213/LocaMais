import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `<img [class]="size === 'lg' ? 'lg' : 'lgs'" src="assets/logo.png" alt="Loca+ locadora de veículos" />`,
})
export class LogoComponent {
  @Input() size: 'lg' | 'sm' = 'lg';
}
