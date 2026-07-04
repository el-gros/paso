import { Component, Input } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TrackDefinition } from '../globald';

@Component({
  standalone: true,
  selector: 'app-track-options-popover',
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island compact-island">
        <ion-list lines="none" class="popover-list">
          <ion-item button class="action-item" (click)="selectAction('display')">
            <ion-icon [name]="isCurrentlyVisible ? 'eye-off-outline' : 'eye-outline'" slot="start" [color]="isCurrentlyVisible ? 'danger' : 'primary'"></ion-icon>
            <ion-label [color]="isCurrentlyVisible ? 'danger' : ''">
              <strong>{{ isCurrentlyVisible ? ('ARCHIVE.HIDE' | translate) : ('ARCHIVE.SHOW' | translate) }}</strong>
            </ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('edit')">
            <ion-icon name="create-outline" slot="start" color="tertiary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.EDIT' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('move')">
            <ion-icon name="folder-open-outline" slot="start" color="primary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.MOVE_TO_FOLDER' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('export')">
            <ion-icon name="share-social-outline" slot="start" color="success"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.EXPORT_TRACK' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('delete')">
            <ion-icon name="trash-outline" slot="start" color="danger"></ion-icon>
            <ion-label color="danger"><strong>{{ 'ARCHIVE.REMOVE' | translate }}</strong></ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [``], /* ¡Cero CSS local! */
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class TrackOptionsPopoverComponent {
  @Input() trackItem!: TrackDefinition;
  @Input() isCurrentlyVisible!: boolean;
  constructor(private popoverController: PopoverController) {}
  selectAction(action: string) { this.popoverController.dismiss({ action: action }); }
}