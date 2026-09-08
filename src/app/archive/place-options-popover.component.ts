import { Component, inject } from '@angular/core';
import { PopoverController } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { IONIC_COMPONENTS } from '../ionic-imports';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'app-place-options-popover',
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island compact-island">
        <ion-list lines="none" class="popover-list">
          
          <ion-item button class="action-item" (click)="selectAction('center')">
            <ion-icon name="locate-outline" slot="start" color="primary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.CENTER_MAP' | translate }}</strong></ion-label>
          </ion-item>
          
          <ion-item button class="action-item" (click)="selectAction('edit')">
            <ion-icon name="create-outline" slot="start" color="tertiary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.EDIT' | translate }}</strong></ion-label>
          </ion-item>
          
          <ion-item button class="action-item" (click)="selectAction('delete')">
            <ion-icon name="trash-outline" slot="start" color="danger"></ion-icon>
            <ion-label color="danger"><strong>{{ 'ARCHIVE.REMOVE' | translate }}</strong></ion-label>
          </ion-item>
          
        </ion-list>
      </div>
    </ion-content>
  `,
  imports: [CommonModule, TranslateModule, FormsModule, ...IONIC_COMPONENTS]
})
export class PlaceOptionsPopoverComponent {
  private popoverController = inject(PopoverController);

  selectAction(action: string) {
    this.popoverController.dismiss({ action: action });
  }
}