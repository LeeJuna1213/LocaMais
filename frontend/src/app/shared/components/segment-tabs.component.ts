import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-segment-tabs',
  standalone: true,
  styles: [`
    .tabs { display:flex; gap:4px; width:100%; min-width:0; padding:5px; border-radius:14px; background:#5b3822; overflow-x:auto; overscroll-behavior-inline:contain; scrollbar-width:thin; scrollbar-color:#f57c1f transparent; }
    .tabs button { flex:1 0 auto; min-width:max-content; max-width:100%; padding:9px 12px; border:0; border-radius:10px; background:transparent; color:#fff; white-space:nowrap; font:inherit; cursor:pointer; }
    .tabs button.on { background:#fff; color:#5b3822; font-weight:700; }
    @media(max-width:600px){ .tabs button { padding:8px 10px; font-size:13px; } }
  `],
  template: `
    <div [class]="variant">
      @for (option of options; track option) {
        <button type="button" [class.on]="option === active" (click)="select(option)">{{ option }}</button>
      }
    </div>
  `,
})
export class SegmentTabsComponent {
  @Input() options: string[] = [];
  @Input() active = '';
  @Input() variant: 'tabs' | 'seg' = 'tabs';
  @Output() activeChange = new EventEmitter<string>();

  select(option: string): void {
    this.active = option;
    this.activeChange.emit(option);
  }
}
