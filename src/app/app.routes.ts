import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

/**
 * Rotas da aplicação (SPEC-M1 §3.6).
 * - `''` → `/login` (a tela de login, T-M1-8, redireciona a home se já autenticado).
 * - `login`        público (T-M1-8 preenche).
 * - `usuarios`     protegida por autenticação + papel ADMIN (T-M1-9 preenche).
 * - `trocar-senha` protegida por autenticação; alvo do 1º login forçado (T-M1-10).
 * - `health`       preservada do M0 (prova de integração; NÃO remover).
 *
 * Os componentes de auth/usuários são PLACEHOLDERS do T-M1-7 (lazy) — as telas reais
 * chegam nas tasks T-M1-8/9/10 sem alterar este wiring.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'usuarios',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
  },
  {
    path: 'trocar-senha',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/trocar-senha/trocar-senha').then((m) => m.TrocarSenha),
  },
  {
    path: 'health',
    // Prova de integração front↔API (SPEC-M0 §3.5, T-M0-5). Lazy-loaded.
    loadComponent: () => import('./features/health/health').then((m) => m.Health),
  },
  { path: '**', redirectTo: 'login' },
];
