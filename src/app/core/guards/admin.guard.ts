import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../services/auth.service';

/**
 * Guarda de papel ADMIN (SPEC-M1 §3.6, CA-13): exige `role === 'ADMIN'` no perfil
 * corrente; caso contrário avisa (snackbar 403) e redireciona para a home.
 * O RBAC efetivo é do back — esta guarda apenas orienta a UX (§9).
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  if (auth.ehAdmin()) {
    return true;
  }
  snackBar.open('Você não tem permissão para esta ação.', 'Fechar', {
    duration: 5000,
  });
  return router.createUrlTree(['/']);
};
