import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { global } from '../../environments/environment';

@Component({
  selector: 'app-description-modal',
  templateUrl: './description-modal.component.html',
  styleUrls: ['./description-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class DescriptionModalComponent  implements OnInit {

  @Input() modalText = {header: '', message: ''};
  editableMessage: string = '';
  cancelText: string = '';
 
  constructor(
    private sanitizer: DomSanitizer,
    private modalController: ModalController
  ) {}
 
  ngOnInit(): void {
    this.editableMessage = this.modalText.message; // Initialize the editable message
    const cancel = ['Cancel.lar', 'Cancelar', 'Cancel'];   
    this.cancelText = cancel[global.languageIndex]
  }
  
  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      message: this.editableMessage,
    });
  }

  dismiss() {
    this.modalController.dismiss();    
  }
  
  onMessageChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableMessage = element.innerText; // Update the editableMessage with current content
  }

}
