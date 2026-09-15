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
 *   - `clientes`/`fornecedores` leitura USER+ADMIN (SPEC-M5 §3.6/CA-10) — só `authGuard`, SEM
 *             `adminGuard` (a escrita é barrada por RBAC no back — FC-07). Componentes são
 *             placeholders da T-M5-6; a lista real chega em T-M5-7/T-M5-9.
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
        path: 'eventos',
        loadComponent: () => import('./features/eventos/eventos').then((m) => m.Eventos),
      },
      {
        path: 'movimentacoes',
        loadComponent: () =>
          import('./features/movimentacoes/movimentacoes').then((m) => m.Movimentacoes),
      },
      {
        path: 'clientes',
        loadComponent: () => import('./features/clientes/clientes').then((m) => m.Clientes),
      },
      {
        path: 'fornecedores',
        loadComponent: () =>
          import('./features/fornecedores/fornecedores').then((m) => m.Fornecedores),
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        // Configurações (SPEC-M6 §3.15, CA-30): área de SISTEMA, exclusiva de ADMIN. Rota FILHA de
        // propósito — Relatórios (M7) e futuras seções entram aqui sem `MatTabs`. O `adminGuard`
        // cobre o grupo inteiro; o RBAC efetivo continua sendo do back (FC-07).
        path: 'configuracoes',
        canActivate: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'cores' },
          {
            path: 'cores',
            loadComponent: () =>
              import('./features/configuracoes/cores/cores').then((m) => m.Cores),
          },
        ],
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
