import { Component, Input, inject } from '@angular/core';
import { ModalController, IonicModule } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share'; // 👈 Importamos el plugin de compartir
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [IonicModule],
  template: `
    <ion-content class="immersive-dark" [fullscreen]="true">
      
      <button class="floating-btn close-btn ion-activatable" (click)="dismiss()" aria-label="Cerrar visor">
        <ion-icon name="close-outline"></ion-icon>
        <ion-ripple-effect></ion-ripple-effect>
      </button>

      <div class="gallery-container">
        @for (photo of photos; track $index) {
          <div class="gallery-slide">
            <img [src]="getWebUrl(photo)" alt="Foto de la ruta" loading="lazy" />
            
            <button class="floating-btn share-btn ion-activatable" (click)="sharePhoto(photo)" aria-label="Compartir foto">
              <ion-icon name="share-social-outline"></ion-icon>
              <ion-ripple-effect></ion-ripple-effect>
            </button>
            
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

    /* 🚀 Clase base compartida para los botones flotantes */
    .floating-btn {
      position: absolute;
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
      font-size: 24px;
      cursor: pointer;
      overflow: hidden; 
    }

    .floating-btn ion-icon { pointer-events: none; }
    .floating-btn:active {
      background: rgba(255, 255, 255, 0.4);
      transform: scale(0.95);
    }

    /* Posición específica del botón CERRAR */
    .close-btn {
      top: calc(16px + var(--ion-safe-area-top, 0px)); 
      right: 16px;
      font-size: 28px;
    }

    /* Posición específica del botón COMPARTIR */
    .share-btn {
      bottom: calc(30px + var(--ion-safe-area-bottom, 0px));
      right: 16px;
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
      position: relative; /* Clave para que los absolutos se posicionen respecto a la foto */
    }
    
    .gallery-slide img {
      width: 100%;
      height: 100%;
      object-fit: contain; 
    }

    .slide-counter {
      position: absolute;
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

  // ==========================================================================
  // 1. INPUTS Y PROPIEDADES
  // ==========================================================================

  @Input() photos: string[] = [];
  @Input() routeName: string = '';

  private modalCtrl = inject(ModalController);
  private translate = inject(TranslateService);

  // ==========================================================================
  // 2. ACCIONES (API PÚBLICA)
  // ==========================================================================

  public dismiss() {
    this.modalCtrl.dismiss();
  }

  /**
   * Abre el menú nativo para compartir la fotografía seleccionada.
   */
  public async sharePhoto(photoUri: string) {
    try {
      const canShare = await Share.canShare();
      
      if (canShare.value) {
        // 1. Generamos el título dinámico (con o sin nombre de ruta)
        const dynamicTitle = this.routeName 
          ? this.translate.instant('PHOTO.SHARE_ROUTE_TITLE', { route: this.routeName })
          : this.translate.instant('PHOTO.SHARE_GENERIC_TITLE');

        // 2. Generamos el título del cuadro de diálogo
        const dialogTitle = this.translate.instant('PHOTO.SHARE_DIALOG');

        await Share.share({
          title: dynamicTitle, // Título para emails / mensajes
          text: dynamicTitle,  // 💡 Recomendable ponerlo también en 'text' para WhatsApp/Telegram
          files: [photoUri], 
          dialogTitle: dialogTitle // Título del menú nativo en Android
        });
      }
    } catch (e: any) {
      if (!e.toString().includes('Share canceled')) {
        console.error('Error al compartir:', e);
      }
    }
  }

  // ==========================================================================
  // 3. HELPERS
  // ==========================================================================

  public getWebUrl(uri: string): string {
    return uri ? Capacitor.convertFileSrc(uri) : '';
  }

}