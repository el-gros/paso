import { Injectable } from '@angular/core';
import { PopoverController, ItemReorderEventDetail } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

import { FunctionsService } from '../services/functions.service';
import { TrackDefinition } from '../../globald';
import { FolderOptionsPopoverComponent } from '../folder-options-popover.component';
import { FolderActionPopover } from './folder-action-popover.component';
import { FolderMovePopover } from './folder-move-popover.component';

@Injectable({
  providedIn: 'root'
})
export class ArchiveFolderService {

  /** Ruta de navegación actual (nivel de carpeta) */
  public currentPath: string[] = [];

  constructor(
    public fs: FunctionsService,
    private translate: TranslateService,
    private popoverController: PopoverController
  ) { }

  // ==========================================================================
  // GETTERS DE NAVEGACIÓN
  // ==========================================================================

  /** Devuelve las carpetas únicas que existen en el nivel de navegación actual */
  get foldersAtCurrentLevel(): string[] {
    const level = this.currentPath.length;

    // 1. Carpetas explícitas creadas por el usuario (solo se muestran en la raíz)
    const explicitFolders = level === 0 ? this.fs.virtualFolders : [];

    // 2. Carpetas implícitas que vienen de los paths de los trayectos
    const foldersFromTracks = this.fs.collection
      .map(t => (t as any).folderPath || [])
      .filter(path =>
        path.length > level &&
        JSON.stringify(path.slice(0, level)) === JSON.stringify(this.currentPath)
      )
      .map(path => path[level]);

    // Unir y eliminar duplicados (mantenemos el orden manual si existe)
    return [...new Set([...explicitFolders, ...foldersFromTracks])];
  }

  /** Devuelve solo los trayectos que pertenecen exactamente a la carpeta actual */
  get tracksAtCurrentLevel(): TrackDefinition[] {
    return this.fs.collection.filter(track => {
      const path = (track as any).folderPath || [];
      return JSON.stringify(path) === JSON.stringify(this.currentPath);
    });
  }

  // ==========================================================================
  // NAVEGACIÓN
  // ==========================================================================

  enterFolder(folderName: string) {
    this.currentPath.push(folderName);
  }

  resetPath() {
    this.currentPath = [];
  }

  navigateTo(index: number) {
    this.currentPath = this.currentPath.slice(0, index + 1);
  }

  // ==========================================================================
  // OPCIONES DE CARPETA (Popover + acciones)
  // ==========================================================================

  async openFolderOptions(event: Event, folder: string) {
    event.stopPropagation();

    const fullPathStr = JSON.stringify([...this.currentPath, folder]);
    const hasTracks = this.fs.collection.some(t =>
      JSON.stringify((t as any).folderPath || []).startsWith(fullPathStr)
    );

    const popover = await this.popoverController.create({
      component: FolderOptionsPopoverComponent,
      componentProps: { hasTracks },
      cssClass: 'glass-island-wrapper',
      translucent: true,
      backdropDismiss: true,
      event: event
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (!data || !data.action) return;

    switch (data.action) {
      case 'display':
        this.enterFolder(folder);
        break;
      case 'rename':
        await this.renameFolder(folder);
        break;
      case 'empty':
        await this.emptyFolder(folder);
        break;
      case 'delete':
        if (!hasTracks) {
          await this.deleteFolder(folder);
        } else {
          this.fs.displayToast('ARCHIVE.FOLDER_NOT_EMPTY', 'warning');
        }
        break;
    }
  }

  // ==========================================================================
  // CRUD DE CARPETAS
  // ==========================================================================

  /** Abre un diálogo para crear una nueva carpeta virtual. */
async createNewFolder() {
    const popover = await this.popoverController.create({
      component: FolderActionPopover,
      componentProps: { 
        title: 'ARCHIVE.NEW_FOLDER',
        placeholder: 'ARCHIVE.FOLDER_NAME_PLACEHOLDER'
      },
      cssClass: 'confirm-popover' 
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();
    
    // 'data' contendrá el nombre de la carpeta si el usuario pulsó "OK"
    if (data && data.trim().length > 0) {
      this.fs.addFolder(data);
    }
  }

  /** Renombra una carpeta y actualiza el path de todos sus trayectos hijos. */
  async renameFolder(oldName: string) {
    const popover = await this.popoverController.create({
      component: FolderActionPopover,
      componentProps: { 
        title: 'ARCHIVE.RENAME',
        placeholder: 'ARCHIVE.FOLDER_NAME_PLACEHOLDER',
        inputValue: oldName // Esto prellena el input automáticamente
      },
      cssClass: 'confirm-popover'
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();

    // 'data' es el nuevo nombre que ha introducido el usuario
    if (data && data.trim().length > 0 && data.trim() !== oldName) {
      const newName = data.trim();

      const oldPathPrefix = JSON.stringify([...this.currentPath, oldName]);
      const newPathBase = [...this.currentPath, newName];
      const oldFull = [...this.currentPath, oldName];

      // Actualizar todos los trayectos afectados
      this.fs.collection.forEach(t => {
        const path = (t as any).folderPath || [];
        if (JSON.stringify(path).startsWith(oldPathPrefix)) {
          (t as any).folderPath = [...newPathBase, ...path.slice(oldFull.length)];
        }
      });

      // Si estamos en la raíz, actualizar la lista de carpetas virtuales
      if (this.currentPath.length === 0) {
        const idx = this.fs.virtualFolders.indexOf(oldName);
        if (idx > -1) {
          this.fs.virtualFolders[idx] = newName;
          await this.fs.storeSet('virtual_folders', this.fs.virtualFolders);
        }
      }

      await this.fs.storeSet('collection', this.fs.collection);
      this.fs.displayToast('ARCHIVE.TRACK_UPDATED', 'success');
    }
  }

  /** Envía todos los trayectos de esta carpeta a la carpeta inmediatamente superior. */
  async emptyFolder(folder: string) {
    const folderPathToEmptyStr = JSON.stringify([...this.currentPath, folder]);
    const parentPath = [...this.currentPath];

    this.fs.collection.forEach(t => {
      if (JSON.stringify((t as any).folderPath || []) === folderPathToEmptyStr) {
        (t as any).folderPath = parentPath;
      }
    });

    await this.fs.storeSet('collection', this.fs.collection);
    this.fs.displayToast('ARCHIVE.TRACK_UPDATED', 'success');
  }

  async deleteFolder(folder: string) {
    const idx = this.fs.virtualFolders.indexOf(folder);
    if (idx > -1) {
      this.fs.virtualFolders.splice(idx, 1);
      await this.fs.storeSet('virtual_folders', this.fs.virtualFolders);
    }
  }

  async handleFolderReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    if (this.currentPath.length === 0) {
      this.fs.virtualFolders = ev.detail.complete(this.fs.virtualFolders);
      await this.fs.storeSet('virtual_folders', this.fs.virtualFolders);
    } else {
      ev.detail.complete();
    }
  }

  /** Abre un selector para mover un trayecto a una carpeta existente o a la raíz. */
  async moveTrackToFolder(item: TrackDefinition) {
    const currentFolderPath = (item as any).folderPath || [];
    const currentFolder = currentFolderPath.length > 0 ? currentFolderPath[0] : '';

    const options = [{ label: this.translate.instant('ARCHIVE.ALL'), value: '' }];
    this.fs.virtualFolders.forEach(f => options.push({ label: f, value: f }));

    const popover = await this.popoverController.create({
      component: FolderMovePopover,
      componentProps: { folders: options, selectedFolder: currentFolder },
      cssClass: 'confirm-popover'
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();

    if (data !== null) { // El usuario pulsó OK
      const index = this.fs.collection.indexOf(item);
      if (index > -1) {
        (this.fs.collection[index] as any).folderPath = data ? [data] : [];
        await this.fs.storeSet('collection', this.fs.collection);
        this.fs.displayToast('ARCHIVE.TRACK_UPDATED', 'success');
      }
    }
  }
 
}
