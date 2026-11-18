import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-car',
  standalone: true,
  template: `
    <svg class="car" [class.fluid]="fluid" viewBox="0 0 120 56">
      <ellipse cx="60" cy="51" rx="46" ry="4" fill="#0003" />
      <path
        d="M8 38c0-6 4-9 11-11l12-13c2-2 5-3 8-3h34c4 0 7 1 9 4l11 12c8 2 13 5 13 11v6c0 2-1 3-3 3H11c-2 0-3-1-3-3z"
        [attr.fill]="color"
      />
      <path d="M36 17c1-1 3-2 5-2h16v12H29zM63 15h12c2 0 4 1 5 3l8 9H63z" fill="#cfe6f5" opacity=".9" />
      <path
        d="M8 38c0-6 4-9 11-11l12-13c2-2 5-3 8-3h34"
        fill="none"
        stroke="#fff"
        stroke-opacity=".4"
        stroke-width="1.5"
      />
      <rect x="8" y="35" width="98" height="3" fill="#000" opacity=".12" />
      <circle cx="31" cy="44" r="9" fill="#1b1b1b" />
      <circle cx="31" cy="44" r="4.5" fill="#bbb" />
      <circle cx="89" cy="44" r="9" fill="#1b1b1b" />
      <circle cx="89" cy="44" r="4.5" fill="#bbb" />
      <rect x="101" y="31" width="5" height="4" rx="1" fill="#ffe9a8" />
      <rect x="8" y="31" width="4" height="4" rx="1" fill="#ff6b5e" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: none;
      }
      .car {
        width: 96px;
        display: block;
      }
      .car.fluid {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class CarComponent {
  @Input() color = '#c0392b';
  @Input() fluid = false;
}
