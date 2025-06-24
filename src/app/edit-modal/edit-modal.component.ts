/**
 * EditModalComponent provides a modal interface for editing track details such as name, place, and description.
 * Supports multi-language labels and toggling between editable and non-editable modes.
 * Handles user input changes and modal dismissal actions using Ionic's ModalController.
 *
 * @component
 * @input modalEdit - Object containing initial values for name, place, and description.
 * @input edit - Boolean flag to enable or disable editing.
 */

import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';

// Move language label arrays to constants outside the component class
const HEADERS = ['Editeu les dades del trajecte', 'Editar datos del trayecto', 'Edit Track Details'];
const NAMES = ['Nom','Nombre','Name'];
const PLACES = ['Lloc','Lugar','Place'];
const DESCRIPTIONS = ['Descripció','Descripción','Description'];
const CANCELS = ['Cancel.lar', 'Cancelar', 'Cancel'];

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
    this.header = HEADERS[global.languageIndex];
    this.name = NAMES[global.languageIndex];
    this.place = PLACES[global.languageIndex];
    this.description = DESCRIPTIONS[global.languageIndex];
    this.cancel = CANCELS[global.languageIndex];
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

  async dismissWithAction(action: 'ok' | 'cancel'): Promise<void> {
    await this.modalController.dismiss({
      action,
      name: this.editableName,
      place: this.editablePlace,
      description: this.editableDescription
    });
  }

  toggleEdit() {
    this.edit = !this.edit;
  }

}
