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
import { ModalController } from '@ionic/angular';
import { SharedImports } from '../shared-imports';
import { LanguageService } from '../services/language.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-wpt-modal',
    templateUrl: './wpt-modal.component.html',
    styleUrls: ['./wpt-modal.component.scss'],
    imports: [SharedImports]
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
    private modalController: ModalController,
    private languageService: LanguageService,
    private translate: TranslateService
  ) { }

  // 1, ON INIT
  // 2. ON NAME CHANGE
  // 3. ON COMMENT CHANGE
  // 4. DISMISS MODAL
  // 5. TOGGLE EDIT / NO EDIT

  // 1. ON INIT /////////////////////////
  ngOnInit() {
    this.editableName = this.wptEdit.name;
    this.editableComment = this.wptEdit.comment;
  }

  // 2. ON NAME CHANGE ///////////////////////////
  onNameChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableName = element.innerText; // Update the editableMessage with current content
  }

  // 3. ON COMMENT CHANGE ///////////////////////////
  onCommentChange(event: Event): void {
    const element = event.target as HTMLElement;
    this.editableComment = element.innerText; // Update the editableMessage with current content
  }

  // 4. DISMISS MODAL ///////////////////////////
  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      name: this.editableName,
      comment: this.editableComment
    });
  }

  // 5. TOGGLE EDIT / NO EDIT /////////////////////////
  toggleEdit() {
    this.edit = !this.edit;
  }

}
