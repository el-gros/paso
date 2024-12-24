import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';

@Component({
  selector: 'app-edit-modal',
  templateUrl: './edit-modal.component.html',
  styleUrls: ['./edit-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})

export class EditModalComponent  implements OnInit {
  // Input for modal content
  @Input() modalEdit = { name: '', place: '', description: '' };
  // Input for background color, with a default value
  @Input() backgroundColor: string = ''; // Default color
  editableName: string = '';
  editablePlace: string = '';
  editableDescription: string = '';

  translations = {
    headers:  ['Editeu les dades del trajecte', 'Editar datos del trayecto', 'Edit Track Details'],
    names: ['Nom','Nombre','Name'],
    places: ['Lloc','Lugar','Place'],
    descriptions: ['Descripció','Descripción','Description'],
    cancels: ['Cancel.lar', 'Cancelar', 'Cancel'],   
  }
  get header(): string { return this.translations.headers[global.languageIndex]; }
  get name(): string { return this.translations.names[global.languageIndex]; }
  get place(): string { return this.translations.places[global.languageIndex]; }
  get description(): string { return this.translations.descriptions[global.languageIndex]; }
  get cancel(): string { return this.translations.cancels[global.languageIndex]; }

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit() {
    this.editableName = this.modalEdit.name; 
    this.editablePlace = this.modalEdit.place; 
    this.editableDescription = this.modalEdit.description; 
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

}
