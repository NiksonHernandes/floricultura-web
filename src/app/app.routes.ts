import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

/**
 * Rotas da aplicação (SPEC-M1 §3.6; SPEC-M1.1 §3.4, AD-SQ-24).
 * - `''` → `/login` (a tela de login, T-M1-8, redireciona a home se já autenticado).
 * - `login`        público (T-M1-8 preenche).
 * - `usuarios`     protegida por autenticação + papel ADMIN. A troca de senha forçada foi
 *                  descontinuada (AD-SQ-24): sem `senhaProvisoriaGuard` no encadeamento.
 * - `trocar-senha` protegida por autenticação; ação VOLUNTÁRIA de troca de senha e destino
 *                  stopgap do `USER` no M1 (não há home ainda). Ninguém é retido aqui.
 * - `health`       preservada do M0 (prova de integração; NÃO remover).
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
