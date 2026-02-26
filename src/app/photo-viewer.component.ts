import { Component, Input } from '@angular/core';
import { ModalController, IonicModule } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-photo-viewer',
  standalone: true, // Ideal para no tener que declararlo en ningún module.ts
  imports: [IonicModule],
  template: `
    <ion-content class="immersive-dark">
      
      <button class="floating-close" (click)="dismiss()">
        <ion-icon name="close-outline"></ion-icon>
      </button>

      <div class="gallery-container">
        @for (photo of photos; track photo; let i = $index) {
          <div class="gallery-slide">
            <img [src]="getWebUrl(photo)" alt="Foto de la ruta" />
            
            <div class="slide-counter">
              {{ i + 1 }} / {{ photos.length }}
            </div>
          </div>
        }
      </div>

    </ion-content>
  `,
  styles: [`
    /* Fondo negro para el visor */
    .immersive-dark {
      --background: #000000;
    }

    /* Botón de cerrar flotante (Glass-morphism) */
    .floating-close {
      position: absolute;
      top: 40px; 
      right: 16px;
      z-index: 100;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 28px;
      cursor: pointer;
    }

    .floating-close:active {
      background: rgba(255, 255, 255, 0.4);
      transform: scale(0.95);
    }

    /* El truco del carrusel: Scroll Snap Horizontal */
    .gallery-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      
      /* Ocultar la barra de scroll */
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    
    .gallery-container::-webkit-scrollbar { 
      display: none; 
    }

    /* Cada "diapositiva" ocupa toda la pantalla */
    .gallery-slide {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      scroll-snap-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    
    .gallery-slide img {
      width: 100%;
      height: 100%;
      object-fit: contain; /* Mantiene la proporción sin recortar */
    }

    /* Contador flotante */
    .slide-counter {
      position: absolute;
      bottom: 30px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 1px;
    }
  `]
})
export class PhotoViewerComponent {
  // Recibimos el array de fotos desde el componente que abre el modal
  @Input() photos: string[] = [];

  constructor(private modalCtrl: ModalController) {}

  // Función para que el WebView pueda leer el archivo local
  getWebUrl(uri: string): string {
    if (!uri) return '';
    return Capacitor.convertFileSrc(uri);
  }

  // Cierra el modal
  dismiss() {
    this.modalCtrl.dismiss();
  }
}