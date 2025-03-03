import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { global } from '../../environments/environment';
import { Map } from '../../globald';

@Component({
  selector: 'app-update-modal',
  templateUrl: './update-modal.component.html',
  styleUrls: ['./update-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class UpdateModalComponent  implements OnInit {
  // Input for modal content
  @Input() missingMaps: Map[ ]= [];
  // Input maps
  @Input() availableMaps: Map[ ]= [];
  // Input upload or remove
  @Input() upload = true;
  header: string = '';
  header2: string = '';
  cancel: string = '';
  selectedMap: any = null; // Track the selected map
  language: number = global.languageIndex;

  constructor(private modalController: ModalController) { }
  
  ngOnInit(): void {}

  ionViewWillEnter() {
    const headers =  ['Carregueu un mapa', 'Subir un mapa', 'Upload a map'];
    const headers2 =  ['Elimineu un mapa', 'Eliminar un mapa', 'Remove a map'];
    const cancels = ['Cancel.lar', 'Cancelar', 'Cancel'];   
    this.header = headers[global.languageIndex];
    this.header2 = headers2[global.languageIndex];
    this.cancel = cancels[global.languageIndex]; 
  }

  dismiss(): void {
    this.modalController.dismiss();
  }

  dismissWithAction(action: 'ok' | 'cancel'): void {
    this.modalController.dismiss({
      action,
      selectedMap: this.selectedMap,
    });
  }

  toggleSelection(map: any) {
    if (this.selectedMap?.filename === map.filename) {
      this.selectedMap = null; // Unselect if already selected
    } else {
      this.selectedMap = map; // Select new map
    }
  }

}
