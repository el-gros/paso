import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, ModalController, IonicModule } from '@ionic/angular'; 
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { Waypoint } from '../globald';
import { Capacitor } from '@capacitor/core';
import { PhotoViewerComponent } from './photo-viewer.component';

@Component({
  selector: 'app-waypoint-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="popover-header">
          <ion-icon name="location-outline" class="header-icon"></ion-icon>
          <h2>{{ 'EDIT.HEADER' | translate }}</h2>
        </div>

        @if (editableWpt.photos && editableWpt.photos.length > 0) {
          <div class="photo-preview-container ion-activatable" (click)="openPhotoViewer()">
            <img [src]="getWebUrl(editableWpt.photos[0])" class="waypoint-photo" loading="lazy" />
            <div class="photo-badge"><ion-icon name="expand-outline"></ion-icon></div>
            @if(editableWpt.photos.length > 1) {
              <div class="photo-count-badge">+{{ editableWpt.photos.length - 1 }}</div>
            }
            <ion-ripple-effect></ion-ripple-effect>
          </div>
        }
        
        <div class="meta-tags-row">
          @if (editableWpt.altitude !== undefined && editableWpt.altitude !== null) {
            <span class="meta-tag">
              <ion-icon name="trending-up-outline"></ion-icon>
              {{ editableWpt.altitude | number:'1.0-0' }} m
            </span>
          }
        </div>
        
        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.NAME' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editableWpt.name" rows="1" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editableWpt.comment" rows="3" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
        </div>

        <div class="popover-button-grid">
          <button class="popover-btn btn-green ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="popover-btn btn-red ion-activatable" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    .photo-preview-container {
      position: relative; width: 100%; height: 120px; margin-bottom: 18px;
      border-radius: 18px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      cursor: pointer; transition: transform 0.2s; background: #f0f0f0;
      &:active { transform: scale(0.98); }
      .waypoint-photo { width: 100%; height: 100%; object-fit: cover; }
      .photo-badge {
        position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.5);
        color: white; padding: 5px; border-radius: 50%; display: flex;
        ion-icon { font-size: 14px; }
      }
      .photo-count-badge {
        position: absolute; bottom: 10px; right: 10px; background: rgba(0, 0, 0, 0.6);
        color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px;
        font-weight: 800; backdrop-filter: blur(4px);
      }
    }
    .meta-tags-row { display: flex; gap: 8px; margin-bottom: 15px; }
    .meta-tag {
      display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.05);
      color: #666; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 600;
    }
    .btn-green { color: #2dd36f; }
    .btn-red { color: #eb445a; }
  `]
})
export class WptPopoverComponent implements OnInit {
  @Input() wptEdit!: Waypoint;
  public editableWpt: any;
  private popoverCtrl = inject(PopoverController);
  private modalCtrl = inject(ModalController); 

  ngOnInit() { this.editableWpt = { ...this.wptEdit }; }

  public async openPhotoViewer() {
    if (!this.editableWpt.photos?.length) return;
    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: { photos: this.editableWpt.photos },
      cssClass: 'fullscreen-modal' 
    });
    await modal.present();
  }

  public cancel() { this.popoverCtrl.dismiss(); }
  public confirm() { this.popoverCtrl.dismiss({ action: 'ok', ...this.editableWpt }); }
  public getWebUrl(path: string): string { return path ? Capacitor.convertFileSrc(path) : ''; }
}