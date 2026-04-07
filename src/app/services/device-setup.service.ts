import { Injectable } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

// --- INTERNAL IMPORTS ---
import MyService from '../../plugins/MyServicePlugin';
import { BatteryPopoverComponent } from '../battery-popover.component';

@Injectable({
  providedIn: 'root'
})
export class DeviceSetupService {

  constructor(private popoverController: PopoverController) {}

  // ==========================================================================
  // 1. PERMISOS
  // ==========================================================================

  /** Verifica y solicita permisos para notificaciones (requerido para el servicio en primer plano) */
  public async checkAndRequestNotifications(): Promise<boolean> {
    try {
      const permNotif = await LocalNotifications.checkPermissions();
      if (permNotif.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        return req.display === 'granted';
      }
      return true;
    } catch (error) {
      console.error("[DeviceSetup] Error con permisos de notificaciones:", error);
      return false;
    }
  }

  /** Verifica y solicita permisos de ubicación precisa */
  public async checkGpsPermissions(): Promise<boolean> {
    try {
      let check = await Geolocation.checkPermissions();
      if (check.location !== 'granted') {
        const request = await Geolocation.requestPermissions();
        if (request.location !== 'granted') return false;
      }
      return true;
    } catch (error) {
      console.error("[DeviceSetup] Error chequeando permisos de GPS:", error);
      return false;
    }
  }

  // ==========================================================================
  // 2. CONFIGURACIÓN DEL SISTEMA
  // ==========================================================================

  /** Gestiona la desactivación del ahorro de batería en marcas con políticas agresivas */
  public async checkBatteryOptimizations(evento?: Event): Promise<void> {
    try {
      const { value: isAlreadyIgnored } = await MyService.isIgnoringBatteryOptimizations();
      if (isAlreadyIgnored) return;

      const hasBeenWarned = localStorage.getItem('battery_warning_dismissed');
      if (hasBeenWarned) return;

      const info = await Device.getInfo();
      const brand = info.manufacturer.toLowerCase();
      const aggressiveBrands = ['xiaomi', 'samsung', 'huawei', 'oneplus', 'oppo', 'vivo', 'realme'];

      if (aggressiveBrands.includes(brand)) {
        const popover = await this.popoverController.create({
          component: BatteryPopoverComponent,
          componentProps: { brand: brand },
          event: evento,
          translucent: true,
          backdropDismiss: false 
        });
        await popover.present();
        const { data } = await popover.onDidDismiss();
        
        if (data?.action === 'settings') {
          if (brand === 'xiaomi') {
            await MyService.openAutostartSettings();
            await MyService.openBatteryOptimization(); 
          } else {
            await MyService.openBatteryOptimization();
          }
          localStorage.setItem('battery_warning_dismissed', 'true');
        }
      }
    } catch (error) {
      console.error('[DeviceSetup] Error en checkBatteryOptimizations:', error);
    }
  }
}