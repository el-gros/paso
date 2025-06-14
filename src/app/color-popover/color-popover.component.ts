/**
 * Standalone component that displays a popover for selecting a color from a provided list.
 * Emits the selected color and dismisses the popover on selection.
 *
 * Inputs:
 *   - colors: Array of color options to display.
 *   - currentColor: Currently selected color.
 * Output:
 *   - colorSelected: Emits the chosen color string.
 */
import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common'; // 👈 Required for *ngIf, *ngFor, ngClass

@Component({
  selector: 'app-color-popover',
  standalone: true,
  imports: [IonicModule, CommonModule], // 👈 Include CommonModule here
  templateUrl: './color-popover.component.html',
  styleUrls: ['./color-popover.component.scss'],
})
export class ColorPopoverComponent {
  @Input() colors: string[] = [];
  @Input() currentColor!: string;
  @Input() onSelect!: (color: string) => void;

  constructor(private popoverCtrl: PopoverController) {}

  selectColor(color: string) {
    this.onSelect(color);
    this.popoverCtrl.dismiss();
  }
}
