import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-pop-over',
  templateUrl: './pop-over.component.html',
  styleUrls: ['./pop-over.component.scss'],
})
export class PopOverComponent {
  @Input() text!: string; // Accept text from the calling component
}
