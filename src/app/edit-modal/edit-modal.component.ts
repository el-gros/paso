/**
 * EditModalComponent provides a modal interface for editing track details such as name, place, and description.
 * Supports multi-language labels and toggling between editable and non-editable modes.
 * Handles user input changes and modal dismissal actions using Ionic's ModalController.
 *
 * @component
 * @input modalEdit - Object containing initial values for name, place, and description.
 * @input edit - Boolean flag to enable or disable editing.
 */

import { ModalController } from '@ionic/angular';
import { SharedImports } from '../shared-imports';
import { global } from '../../environments/environment';
import { DomSanitizer } from '@angular/platform-browser';
import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { LanguageService } from '../services/language.service';
import { TranslateService } from '@ngx-translate/core';
import { ModalEditData } from '../../globald';

@Component({
    selector: 'app-edit-modal',
    templateUrl: './edit-modal.component.html',
    styleUrls: ['./edit-modal.component.scss'],
    imports: [SharedImports],
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
    private sanitizer: DomSanitizer,
    private languageService: LanguageService,
    private translate: TranslateService
  ) { }

  // 1. ON INIT

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
