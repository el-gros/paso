/**
 * EditModalComponent provides a modal interface for editing track details such as name, place, and description.
 * Supports multi-language labels and toggling between editable and non-editable modes.
 * Handles user input changes and modal dismissal actions using Ionic's ModalController.
 *
 * @component
 * @input modalEdit - Object containing initial values for name, place, and description.
 * @input edit - Boolean flag to enable or disable editing.
 */

import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';
import { DomSanitizer } from '@angular/platform-browser';
import { Component, Input, OnInit, OnChanges } from '@angular/core';

// Move language label arrays to constants outside the component class
const HEADERS = ['Editeu les dades del trajecte', 'Editar datos del trayecto', 'Edit Track Details'];
const NAMES = ['Nom','Nombre','Name'];
const PLACES = ['Lloc','Lugar','Place'];
const DESCRIPTIONS = ['Descripció','Descripción','Description'];
const CANCELS = ['Cancel.lar', 'Cancelar', 'Cancel'];

// Define interface for modalEdit input
interface ModalEditData {
  name: string;
  place: string;
  description: string;
}

@Component({
    selector: 'app-edit-modal',
    templateUrl: './edit-modal.component.html',
    styleUrls: ['./edit-modal.component.scss'],
    imports: [CommonModule, IonicModule],
    standalone: true
})

export class EditModalComponent  implements OnInit, OnChanges {

  @Input() modalEdit: ModalEditData = { name: '', place: '', description: '' };
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
    private modalController: ModalController,
    private sanitizer: DomSanitizer
  ) { }

  // 1. ON INIT
  // 2. ON VIEW WILL ENTER
  // 3. ON NAME CHANGE
  // 4. ON PLACE CHANGE
  // 5. ON DESCRIPTION CHANGE
  // 6. DISMISS MODAL
  // 7. TOGGLE EDIT / NO EDIT
  // 8. SANITIZE INPUT
  // 9. ON CHANGES

  // 1. ON INIT ///////////////////////////////
  ngOnInit() {
    this.setEditableFields();
  }

  private setEditableFields() {
    this.editableName = this.modalEdit.name;
    this.editablePlace = this.modalEdit.place;
    this.editableDescription = this.modalEdit.description;
  }

  // 2. ON VIEW WILL ENTER /////////////////
  ionViewWillEnter() {
    this.header = HEADERS[global.languageIndex];
    this.name = NAMES[global.languageIndex];
    this.place = PLACES[global.languageIndex];
    this.description = DESCRIPTIONS[global.languageIndex];
    this.cancel = CANCELS[global.languageIndex];
  }

  // 3. ON NAME CHANGE /////////////////////
  onNameChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableName = this.sanitizeInput(element.innerText);
  }

  // 4. ON PLACE CHANGE ///////////////////////
  onPlaceChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editablePlace = this.sanitizeInput(element.innerText);
  }

  // 5. ON DESCRIPTION CHANGE ////////////////
  onDescriptionChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableDescription = this.sanitizeInput(element.innerText);
  }

  // 6. DISMISS MODAL ////////////////////////
  async dismissWithAction(action: 'ok' | 'cancel'): Promise<void> {
    await this.modalController.dismiss({
      action,
      name: this.editableName,
      place: this.editablePlace,
      description: this.editableDescription
    });
  }

  // 7. TOGGLE EDIT / NO EDIT ////////////////////////////
  toggleEdit() {
    this.edit = !this.edit;
  }

  // 8. SANITIZE INPUT ////////////////////
  sanitizeInput(input: string): string {
    return input.replace(/<script.*?>.*?<\/script>/gi, '').trim();
  }

  // 9. ON CHANGES ///////////////////////
  ngOnChanges() {
    this.setEditableFields();
  }

}
