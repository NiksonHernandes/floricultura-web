import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

/**
 * Rotas da aplicação (SPEC-M2 §4, AD-SQ-33 — resolve a DT-M1-1).
 *
 * - `login`   PÚBLICA e **fora** do shell (sem sidenav/toolbar por baixo → um único `<h1>`
 *             no DOM; sem `position:fixed` sobre um shell montado — CA-18).
 * - `health`  prova de integração front↔API do M0 (standalone, fora do shell; NÃO remover).
 * - Shell (`layout/shell`): parent das rotas AUTENTICADAS. `authGuard` cobre o grupo; sem
 *             token → `/login`. Home pós-login = `/produtos` (ADMIN e USER — CA-16).
 *   - `produtos`     Home (todos os autenticados).
 *   - `usuarios`     protegida por `adminGuard` (ADMIN); o item some do menu p/ USER (CA-17).
 *   - `trocar-senha` ação VOLUNTÁRIA de troca de senha (AD-SQ-24); ninguém é retido aqui.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'health',
    loadComponent: () => import('./features/health/health').then((m) => m.Health),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'produtos' },
      {
        path: 'produtos',
        loadComponent: () => import('./features/produtos/produtos').then((m) => m.Produtos),
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'trocar-senha',
        loadComponent: () =>
          import('./features/auth/trocar-senha/trocar-senha').then((m) => m.TrocarSenha),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
