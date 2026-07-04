import { Component, Input } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-folder-options-popover',
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island compact-island">
        <ion-list lines="none" class="popover-list">
          <ion-item button class="action-item" (click)="selectAction('display')">
            <ion-icon name="eye-outline" slot="start" color="primary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.SHOW' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('rename')">
            <ion-icon name="create-outline" slot="start" color="tertiary"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.RENAME' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('empty')">
            <ion-icon name="folder-open-outline" slot="start" color="warning"></ion-icon>
            <ion-label><strong>{{ 'ARCHIVE.EMPTY' | translate }}</strong></ion-label>
          </ion-item>
          <ion-item button class="action-item" (click)="selectAction('delete')" [disabled]="hasTracks">
            <ion-icon name="trash-outline" slot="start" [color]="hasTracks ? 'medium' : 'danger'"></ion-icon>
            <ion-label [color]="hasTracks ? 'medium' : 'danger'">
              <strong>{{ 'ARCHIVE.REMOVE' | translate }}</strong>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [``], /* ¡Cero CSS local! Todo lo gestiona el global */
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class FolderOptionsPopoverComponent {
  @Input() hasTracks: boolean = false;
  constructor(private popoverController: PopoverController) {}
  selectAction(action: string) { this.popoverController.dismiss({ action }); }
}