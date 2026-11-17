import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-segment-tabs',
  standalone: true,
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
