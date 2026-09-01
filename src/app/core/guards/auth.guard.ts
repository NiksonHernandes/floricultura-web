import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Guarda de autenticação (SPEC-M1 §3.6, CA-13): sem token no storage,
 * redireciona para `/login`; com token, libera a rota.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.token()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
