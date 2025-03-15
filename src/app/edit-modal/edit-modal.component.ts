import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';

@Component({
    selector: 'app-edit-modal',
    templateUrl: './edit-modal.component.html',
    styleUrls: ['./edit-modal.component.scss'],
    imports: [CommonModule, IonicModule]
})

export class EditModalComponent  implements OnInit {
  // Input for modal content
  @Input() modalEdit = { name: '', place: '', description: '' };
  // Input for editable or non-editable content
  @Input() edit: boolean = false;
  editableName: string = '';
  editablePlace: string = '';
  editableDescription: string = '';
  header: string = '';
  name: string = '';
  place: string = '';
  description: string = '';
  cancel: string = '';

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit() {
    this.editableName = this.modalEdit.name; 
    this.editablePlace = this.modalEdit.place; 
    this.editableDescription = this.modalEdit.description; 
  }

  ionViewWillEnter() {
    const headers =  ['Editeu les dades del trajecte', 'Editar datos del trayecto', 'Edit Track Details'];
    const names = ['Nom','Nombre','Name'];
    const places = ['Lloc','Lugar','Place'];
    const descriptions = ['Descripció','Descripción','Description'];
    const cancels = ['Cancel.lar', 'Cancelar', 'Cancel'];   
    this.header = headers[global.languageIndex];
    this.name = names[global.languageIndex];
    this.place = places[global.languageIndex]; 
    this.description = descriptions[global.languageIndex];
    this.cancel = cancels[global.languageIndex]; 
  }

  onNameChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableName = element.innerText; // Update the editableMessage with current content
  }

  onPlaceChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editablePlace = element.innerText; // Update the editableMessage with current content
  }

  onDescriptionChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableDescription = element.innerText; // Update the editableMessage with current content
  }

  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      name: this.editableName,
      place: this.editablePlace,
      description: this.editableDescription
    });
  }

  toggleEdit() {
    this.edit = !this.edit;
    console.log('Edit mode:', this.edit);
  }

}
