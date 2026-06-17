import { Component, Input } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-folder-options-popover',
  template: `
    <ion-content class="ion-no-padding">
      <div class="popover-island">
        <ion-list lines="none">
          <ion-item button (click)="selectAction('display')">
            <ion-icon name="eye-outline" slot="start" color="primary"></ion-icon>
            <ion-label>{{ 'ARCHIVE.SHOW' | translate }}</ion-label>
          </ion-item>
          
          <ion-item button (click)="selectAction('rename')">
            <ion-icon name="create-outline" slot="start" color="tertiary"></ion-icon>
            <ion-label>{{ 'ARCHIVE.RENAME' | translate }}</ion-label>
          </ion-item>

          <ion-item button (click)="selectAction('empty')">
            <ion-icon name="trash-outline" slot="start" color="warning"></ion-icon>
            <ion-label>{{ 'ARCHIVE.EMPTY' | translate }}</ion-label>
          </ion-item>

          <ion-item button (click)="selectAction('delete')" [disabled]="hasTracks">
            <ion-icon name="trash-outline" slot="start" [color]="hasTracks ? 'medium' : 'danger'"></ion-icon>
            <ion-label [color]="hasTracks ? 'medium' : 'danger'">{{ 'ARCHIVE.REMOVE' | translate }}</ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: transparent; }
    .popover-island {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      margin: 10px;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
    ion-list { background: transparent; padding: 6px 0; }
    ion-item { 
      --padding-start: 16px; 
      --inner-padding-end: 16px; 
      --background: transparent; 
      --border-radius: 12px; 
      margin-bottom: 2px; 
    }
  `],
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class FolderOptionsPopoverComponent {
  @Input() hasTracks: boolean = false;
  constructor(private popoverController: PopoverController) {}
  selectAction(action: string) {
    this.popoverController.dismiss({ action });
  }
}