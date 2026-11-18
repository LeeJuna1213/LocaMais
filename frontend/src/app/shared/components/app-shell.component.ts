import { Component, Input } from '@angular/core';
import { IonBackButton, IonContent, IonFooter, IonHeader, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBack } from 'ionicons/icons';
import { UserRole } from '../../core/models';
import { BottomNavComponent } from './bottom-nav.component';
import { LogoComponent } from './logo.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonBackButton, LogoComponent, BottomNavComponent],
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      ion-header,
      ion-footer {
        flex: 0 0 auto;
      }

      ion-content {
        flex: 1 1 auto;
        min-height: 0;
      }
    `,
  ],
  template: `
    <ion-header class="ion-no-border app-header">
      <ion-toolbar class="app-toolbar">
        <div class="hd">
          @if (back) {
            <ion-back-button class="bk" [defaultHref]="defaultHref" text="" icon="chevron-back"></ion-back-button>
          } @else {
            <span class="bk-space"></span>
          }
          <b>
            @if (logo) {
              <span style="display: inline-flex; align-items: center; gap: 10px">
                <app-logo size="sm" />
                @if (title) {
                  <span>{{ title }}</span>
                }
              </span>
            } @else {
              {{ title }}
            }
          </b>
          <div class="hd-right"><ng-content select="[slot=right]"></ng-content></div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-content">
      <div class="page"><ng-content></ng-content></div>
    </ion-content>

    @if (showNav && role) {
      <ion-footer class="ion-no-border app-footer">
        <app-bottom-nav [role]="role" [active]="activeTab" />
      </ion-footer>
    }
  `,
})
export class AppShellComponent {
  @Input() title = '';
  @Input() logo = false;
  @Input() back = false;
  @Input() defaultHref = '/login';
  @Input() showNav = false;
  @Input() role: UserRole | null = null;
  @Input() activeTab = 'inicio';

  constructor() {
    addIcons({ chevronBack });
  }
}

