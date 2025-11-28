import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tab1',
    loadComponent: () => import('./tab1/tab1.page').then((m) => m.Tab1Page),
  },
  {
    path: 'archive',
    loadComponent: () => import('./archive/archive.page').then((m) => m.ArchivePage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'canvas',
    loadComponent: () => import('./canvas/canvas.component').then((m) => m.CanvasComponent),
  },
  {
    path: '',
    redirectTo: 'tab1',
    pathMatch: 'full',  // 👈 necesario
  }
];



