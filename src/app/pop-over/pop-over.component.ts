import { Component, Input } from '@angular/core';
import { global } from '../../environments/environment';

@Component({
  selector: 'app-pop-over',
  templateUrl: './pop-over.component.html',
  styleUrls: ['./pop-over.component.scss'],
})
export class PopOverComponent {
  @Input() text!: string; // Accept text from the calling component
  altitude = ['Altitud:', 'Altitud:', 'Altitude:'];
  altit = this.altitude[global.languageIndex]
}
