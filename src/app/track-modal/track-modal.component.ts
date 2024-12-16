import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { global } from '../../environments/environment';

@Component({
  selector: 'app-track-modal',
  templateUrl: './track-modal.component.html',
  styleUrls: ['./track-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TrackModalComponent  implements OnInit {
  @Input() modalText = {header: '', message: ''};
  editableMessage: string = '';
  cancelText: string = '';
 
  constructor(
    private sanitizer: DomSanitizer,
    private modalController: ModalController
  ) {}
 
  ngOnInit(): void {
//    this.modalText.message = this.modalText.message.replace('<![CDATA[', '').replace(']]>', '').replace(/\n/g, '<br>');  
    this.editableMessage = this.modalText.message; // Initialize the editable message
    const cancel = ['Cancel.lar', 'Cancelar', 'Cancel'];   
    this.cancelText = cancel[global.languageIndex]
  }
  
  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      message: this.editableMessage,
      //message: this.modalText.message,
    });
  }

  dismissOnBackdrop(event: MouseEvent) {
    // Check if the target is the wrapper or backdrop and dismiss
    if ((event.target as HTMLElement).classList.contains('custom-modal-wrapper')) {
      this.modalController.dismiss();
    }
  }

  dismiss() {
    this.modalController.dismiss();    
  }
  
  // Update modalText.message when the content changes
  onMessageChange(event: Event): void {
    //const target = event.target as HTMLElement;
    //this.modalText.message = target.innerHTML;
    const element = event.target as HTMLElement;
    this.editableMessage = element.innerText; // Update the editableMessage with current content
  }

}