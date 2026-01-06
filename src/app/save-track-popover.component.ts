import { Component, Input, OnInit } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 

@Component({
  selector: 'app-save-track-popover',
  standalone: true, // This is key
  imports: [
    CommonModule, 
    FormsModule, 
    IonicModule // This imports all ion- components
  ],
  template: `
    <ion-content class="ion-padding">
      <ion-list lines="none">
        <ion-item>
          <ion-label position="stacked">Track Name</ion-label>
          <ion-input [(ngModel)]="modalEdit.name" placeholder="Enter name"></ion-input>
        </ion-item>
        
        <ion-item>
          <ion-label position="stacked">Place</ion-label>
          <ion-input [(ngModel)]="modalEdit.place" placeholder="Location"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Description</ion-label>
          <ion-textarea [(ngModel)]="modalEdit.description" rows="3"></ion-textarea>
        </ion-item>
      </ion-list>

      <div class="ion-margin-top">
        <ion-button expand="block" (click)="confirm()">Save</ion-button>
        <ion-button expand="block" fill="clear" color="medium" (click)="cancel()">Cancel</ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: var(--ion-item-background); }
    ion-list { background: transparent; }
  `]
})
export class SaveTrackPopover implements OnInit {
  @Input() modalEdit: any;
  @Input() edit: boolean | undefined;

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    // Clone the data so we don't mutate the original until 'Save' is clicked
    this.modalEdit = { ...this.modalEdit };
  }

  cancel() {
    this.popoverCtrl.dismiss();
  }

  confirm() {
    this.popoverCtrl.dismiss({
      action: 'ok',
      ...this.modalEdit
    });
  }
}