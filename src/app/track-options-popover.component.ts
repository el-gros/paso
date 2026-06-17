import { Component, Input } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TrackDefinition } from '../globald';

/**
 * Popover component to display options for a specific track in the archive.
 */
@Component({
  standalone: true,
  selector: 'app-track-options-popover',
  template: `
    <ion-content class="ion-no-padding">
      <div class="popover-island">
        <ion-list lines="none">
          <ion-item button (click)="selectAction('display')">
            <ion-icon [name]="isCurrentlyVisible ? 'eye-off-outline' : 'eye-outline'" slot="start" [color]="isCurrentlyVisible ? 'danger' : 'primary'"></ion-icon>
            <ion-label [color]="isCurrentlyVisible ? 'danger' : ''">{{ isCurrentlyVisible ? ('ARCHIVE.HIDE' | translate) : ('ARCHIVE.SHOW' | translate) }}</ion-label>
          </ion-item>
          <ion-item button (click)="selectAction('edit')">
            <ion-icon name="create-outline" slot="start" color="tertiary"></ion-icon>
            <ion-label>{{ 'ARCHIVE.EDIT' | translate }}</ion-label>
          </ion-item>
          <ion-item button (click)="selectAction('move')">
            <ion-icon name="folder-open-outline" slot="start" color="primary"></ion-icon>
            <ion-label>{{ 'ARCHIVE.MOVE_TO_FOLDER' | translate }}</ion-label>
          </ion-item>
          <ion-item button (click)="selectAction('export')">
            <ion-icon name="share-social-outline" slot="start" color="success"></ion-icon>
            <ion-label>{{ 'ARCHIVE.EXPORT_TRACK' | translate }}</ion-label>
          </ion-item>
          <ion-item button (click)="selectAction('delete')">
            <ion-icon name="trash-outline" slot="start" color="danger"></ion-icon>
            <ion-label color="danger">{{ 'ARCHIVE.REMOVE' | translate }}</ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content {
      --background: transparent;
    }

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

    ion-list {
      background: transparent;
      padding: 6px 0; /* Ajustado para que el padding del ion-item funcione mejor */
    }

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
export class TrackOptionsPopoverComponent {
  @Input() trackItem!: TrackDefinition;
  @Input() isCurrentlyVisible!: boolean;

  constructor(private popoverController: PopoverController) {}

  selectAction(action: string) {
    this.popoverController.dismiss({ action: action });
  }
}