import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController } from '@ionic/angular';

@Component({
  standalone: true,
  selector: 'app-wiki-card',
  imports: [IonicModule, CommonModule],
  template: `
    <div class="wiki-floating-card" *ngIf="data">
      
      <div class="handle-container" 
           (touchstart)="onTouchStart($event)" 
           (touchend)="onTouchEnd($event)"
           (click)="close()">
        <div class="handlebar"></div>
      </div>
      
      <div class="wiki-header">
        <h3>{{ data.title }}</h3>
      </div>
      
      <div class="wiki-scroll-area">
        <img *ngIf="data.originalimage" [src]="data.originalimage.source" class="wiki-img">
        <div class="wiki-body">
          <p>{{ data.extract }}</p>
          <a [href]="data.content_urls?.desktop?.page" target="_blank">WIKIPEDIA</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wiki-floating-card {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 35vh;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 24px 24px 0 0;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      border-top: 1px solid rgba(255,255,255,0.4);
    }

    /* Creamos un contenedor más grande para que sea fácil tocar la barra */
    .handle-container {
      width: 100%;
      padding: 12px 0;
      cursor: pointer;
      display: flex;
      justify-content: center;
    }

    .handlebar {
      width: 50px; 
      height: 6px; 
      background: #ccc;
      border-radius: 3px; 
    }

    .wiki-header {
      padding: 0 20px 10px;
      h3 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #333; }
    }

    .wiki-scroll-area {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 30px;
      /* Importante: evitar que los toques aquí suban al contenedor de cierre */
      pointer-events: auto; 
    }

    .wiki-img { width: 100%; height: 160px; object-fit: cover; }
    .wiki-body { padding: 15px; p { font-size: 14px; color: #444; } }
    
    a { color: var(--ion-color-primary); font-weight: bold; text-decoration: none; font-size: 11px; margin-top: 10px; display: block; }
  `]
})
export class WikiCardComponent {
  @Input() data: any;
  @Output() onClose = new EventEmitter<void>();

  private startY: number = 0;

  close() { this.onClose.emit(); }

  onTouchStart(event: TouchEvent) {
    this.startY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent) {
    const endY = event.changedTouches[0].clientY;
    const deltaY = endY - this.startY;

    // Solo cerramos si el deslizamiento es en el handle y hacia abajo
    if (deltaY > 30) {
      this.close();
    }
  }
}