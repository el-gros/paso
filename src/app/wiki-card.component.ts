import { Component, EventEmitter, Input, Output, inject, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-wiki-card',
  imports: [IonicModule, CommonModule, TranslateModule],
  template: `
    <div class="wiki-floating-card" *ngIf="data">
      <div class="handle-container" (touchstart)="onTouchStart($event)" (touchend)="onTouchEnd($event)" (click)="close()">
        <div class="handlebar"></div>
      </div>
      
      <div class="wiki-header">
        <h3>{{ data.wiki?.title || data.locationName }}</h3>
        
        <div class="weather-pill" *ngIf="data.weather">
          <img [src]="data.weather.icon" class="weather-icon" alt="weather icon">
          <span class="temp">{{ data.weather.temp }}°C</span>
          <span class="separator">|</span>
          <span class="desc">{{ data.weather.description }}</span>
          <div class="weather-details">
            <ion-icon name="water-outline"></ion-icon>
            <span>{{ data.weather.humidity }}%</span>
          </div>
        </div>
      </div>
      
      <div class="wiki-scroll-area">
        <img *ngIf="data.wiki?.originalimage" [src]="data.wiki.originalimage.source" class="wiki-img">
        <div class="wiki-body">
          <p *ngIf="data.wiki?.extract">{{ data.wiki.extract }}</p>
          <p *ngIf="!data.wiki?.extract" class="no-data">{{ 'SEARCH.NO_DESCRIPTION' | translate }}</p>
          <a *ngIf="data.wiki?.content_urls?.desktop?.page" [href]="data.wiki.content_urls.desktop.page" target="_blank">VER EN WIKIPEDIA</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Tu CSS se mantiene igual, está perfecto */
    .wiki-floating-card { position: fixed; bottom: 0; left: 0; width: 100%; height: 38vh; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 28px 28px 0 0; box-shadow: 0 -8px 32px rgba(0,0,0,0.15); z-index: 1001; display: flex; flex-direction: column; border-top: 1px solid rgba(255,255,255,0.5); animation: slideUp 0.3s ease-out; }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .handle-container { width: 100%; padding: 12px 0; cursor: pointer; display: flex; justify-content: center; }
    .handlebar { width: 40px; height: 5px; background: rgba(0,0,0,0.15); border-radius: 10px; }
    .wiki-header { padding: 0 20px 15px; h3 { margin: 0 0 8px; font-size: 1.25rem; font-weight: 800; color: #111; letter-spacing: -0.5px; } }
    .weather-pill { display: inline-flex; align-items: center; background: rgba(0, 0, 0, 0.06); padding: 6px 14px; border-radius: 100px; gap: 8px;
      .weather-icon { width: 28px; height: 28px; margin: -5px 0; }
      .temp { font-weight: 700; color: #222; font-size: 15px; }
      .separator { color: rgba(0,0,0,0.15); }
      .desc { font-size: 12px; color: #555; text-transform: capitalize; }
      .weather-details { margin-left: 4px; font-size: 11px; color: #777; display: flex; align-items: center; gap: 2px; }
    }
    .wiki-scroll-area { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 40px; }
    .wiki-img { width: 100%; max-height: 200px; object-fit: cover; margin-bottom: 12px; mask-image: linear-gradient(to bottom, black 80%, transparent 100%); }
    .wiki-body { padding: 0 20px; p { font-size: 15px; line-height: 1.6; color: #333; margin: 0; } .no-data { font-style: italic; color: #888; text-align: center; padding: 20px 0; } }
    a { color: var(--ion-color-primary); font-weight: 800; text-decoration: none; font-size: 11px; margin-top: 18px; display: inline-block; letter-spacing: 1px; border: 1.5px solid var(--ion-color-primary); padding: 6px 14px; border-radius: 8px; }
  `]
})
export class WikiCardComponent implements OnChanges {
  @Input() data: any;
  @Output() onClose = new EventEmitter<void>();

  private cdr = inject(ChangeDetectorRef);
  private startY: number = 0;

  // ESTO ES LO QUE FALTABA:
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      console.log('WikiCard: Datos actualizados', this.data);
      this.cdr.detectChanges(); // Fuerza a la UI a pintar el clima
    }
  }

  close() { this.onClose.emit(); }

  onTouchStart(event: TouchEvent) {
    this.startY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent) {
    const endY = event.changedTouches[0].clientY;
    const deltaY = endY - this.startY;
    if (deltaY > 60) this.close();
  }
}