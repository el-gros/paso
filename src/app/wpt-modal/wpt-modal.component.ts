/**
 * Modal component for editing waypoint details with multi-language support.
 *
 * Provides editable fields for name, comment, and optionally altitude.
 * Supports toggling between editable and read-only modes, and handles modal dismissal
 * with user actions. Uses Ionic and Angular Common modules for UI and functionality.
 *
 * @input wptEdit - Object containing waypoint data to edit.
 * @input edit - Boolean flag to enable or disable editing.
 * @input showAltitude - Boolean flag to show or hide altitude field.
 */
import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';
@Component({
    selector: 'app-wpt-modal',
    templateUrl: './wpt-modal.component.html',
    styleUrls: ['./wpt-modal.component.scss'],
    imports: [CommonModule, IonicModule]
})
export class WptModalComponent  implements OnInit {
  // Input for modal content
  @Input() wptEdit = { name: '', altitude: NaN, comment: '' };
  // Input for editable or non-editable content
  @Input() edit: boolean = false;
  // Input whether altitude will be shown
  @Input() showAltitude: boolean = false;
  editableName: string = '';
  editableComment: string = '';
  header: string = '';
  name: string = '';
  comment: string = '';
  altitude: string = '';
  cancel: string = '';

  constructor(
    private modalController: ModalController
  ) { }

  // 1, ON INIT
  // 2. ION VIEW WILL ENTER
  // 3. ON NAME CHANGE
  // 4. ON COMMENT CHANGE
  // 5. DISMISS MODAL
  // 6. TOGGLE EDIT / NO EDIT

  // 1. ON INIT /////////////////////////
  ngOnInit() {
    this.editableName = this.wptEdit.name;
    this.editableComment = this.wptEdit.comment;
  }

  // 2. ION VIEW WILL ENTER /////////////////////////
  ionViewWillEnter() {
    const headers =  ['Editeu el punt de ruta', 'Editar el punto de ruta', 'Edit Waypoint'];
    const names = ['Nom', 'Nombre', 'Name'];
    const comments = ['Comentari', 'Comentario', 'Comment'];
    const altitudes = ['Altitud', 'Altitud', 'Altitude'];
    const cancels = ['Cancel.lar', 'Cancelar', 'Cancel'];
    this.header = headers[global.languageIndex];
    this.name = names[global.languageIndex];
    this.comment = comments[global.languageIndex];
    this.altitude = altitudes[global.languageIndex];
    this.cancel = cancels[global.languageIndex];
  }

  // 3. ON NAME CHANGE ///////////////////////////
  onNameChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableName = element.innerText; // Update the editableMessage with current content
  }

  // 4. ON COMMENT CHANGE ///////////////////////////
  onCommentChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableComment = element.innerText; // Update the editableMessage with current content
  }

  // 5. DISMISS MODAL ///////////////////////////
  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      name: this.editableName,
      comment: this.editableComment
    });
  }

  // 6. TOGGLE EDIT / NO EDIT /////////////////////////
  toggleEdit() {
    this.edit = !this.edit;
    console.log('Edit mode:', this.edit);
  }

}
