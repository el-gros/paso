import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-color-popover',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-list lines="none">
      <ion-item 
        *ngFor="let color of colors" 
        (click)="selectColor(color)"
        [class.selected-item]="color === currentColor"
        button>
        <ion-label>{{ color }}</ion-label>
        <div class="color-preview" [style.background-color]="color"></div>
      </ion-item>
    </ion-list>
  `,
  styles: [`
    ion-list { margin: 0; padding: 0; }
    ion-item {
      --min-height: 44px;
      --padding-start: 16px;
      --inner-border-width: 0;
      --border-width: 0;
      --background: transparent;
    }
    ion-label { font-size: 1rem; }
    .color-preview {
      width: 50px;
      height: 5px;
      border-radius: 2px;
      margin-left: 16px;
    }
    .selected-item {
      --background: rgba(163, 191, 255, 0.3); /* Un azul suave */
      border-radius: 8px;
    }
  `]
})
export class ColorPopoverComponent {
  @Input() colors: string[] = [];
  @Input() currentColor!: string;
  @Input() onSelect!: (color: string) => void;

  constructor(private popoverCtrl: PopoverController) {}

  selectColor(color: string) {
    if (this.onSelect) {
      this.onSelect(color);
    }
    // Cierra el popover después de elegir el color
    this.popoverCtrl.dismiss();
  }
}