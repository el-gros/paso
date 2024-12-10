import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { PopOverComponent } from './pop-over.component';
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@NgModule({
  declarations: [PopOverComponent],
  imports: [
    CommonModule,
    IonicModule, // Required for Ionic components like ion-content
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  exports: [PopOverComponent], // Export so it can be used in other modules
})
export class PopOverModule {}