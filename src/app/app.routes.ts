import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'health' },
  {
    path: 'health',
    // Prova de integração front↔API (SPEC-M0 §3.5, T-M0-5). Lazy-loaded.
    loadComponent: () => import('./features/health/health').then((m) => m.Health),
  },
];
