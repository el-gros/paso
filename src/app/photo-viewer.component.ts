import { Component, Input, inject } from '@angular/core';
import { ModalController, IonicModule } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [IonicModule],
  template: `
    <ion-content class="immersive-dark" [fullscreen]="true">
      
      <button class="floating-close ion-activatable" (click)="dismiss()" aria-label="Cerrar visor">
        <ion-icon name="close-outline"></ion-icon>
        <ion-ripple-effect></ion-ripple-effect>
      </button>

      <div class="gallery-container">
        @for (photo of photos; track $index) {
          <div class="gallery-slide">
            <img [src]="getWebUrl(photo)" alt="Foto de la ruta" loading="lazy" />
            
            @if (photos.length > 1) {
              <div class="slide-counter">
                {{ $index + 1 }} / {{ photos.length }}
              </div>
            }
          </div>
        }
      </div>

    </ion-content>
  `,
  styles: [`
    .immersive-dark {
      --background: #000000;
    }

    .floating-close {
      position: absolute;
      /* 🚀 Respetamos el notch/isla dinámica del móvil */
      top: calc(16px + var(--ion-safe-area-top, 0px)); 
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
      overflow: hidden; /* Para contener el ripple */
    }

    .floating-close ion-icon {
      pointer-events: none;
    }

    .floating-close:active {
      background: rgba(255, 255, 255, 0.4);
      transform: scale(0.95);
    }

    .gallery-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    
    .gallery-container::-webkit-scrollbar { 
      display: none; 
    }

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
      object-fit: contain; 
    }

    .slide-counter {
      position: absolute;
      /* 🚀 Respetamos la zona de gestos inferior de iOS/Android */
      bottom: calc(30px + var(--ion-safe-area-bottom, 0px));
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
  @Input() photos: string[] = [];

  private modalCtrl = inject(ModalController);

  public getWebUrl(uri: string): string {
    return uri ? Capacitor.convertFileSrc(uri) : '';
  }

  public dismiss() {
    this.modalCtrl.dismiss();
  }
}