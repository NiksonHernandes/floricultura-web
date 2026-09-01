import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Guarda de senha provisória (SPEC-M1 §3.6, CA-14 · §10 item 16 "1º login forçado").
 *
 * Enquanto o perfil corrente tiver `senhaProvisoria === true`, qualquer rota protegida
 * é desviada para `/trocar-senha` — o usuário fica BLOQUEADO de navegar até trocar a senha.
 * A própria `/trocar-senha` (e `/login`) NÃO recebe esta guarda, senão o fluxo se prenderia.
 *
 * O enforcement real fica na UI (o back não bloqueia rotas por `senha_provisoria`, §4);
 * após a troca o `AuthService` zera a flag no `usuarioAtual` e a navegação é liberada.
 */
export const senhaProvisoriaGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.usuarioAtual()?.senhaProvisoria) {
    return router.createUrlTree(['/trocar-senha']);
  }
  return true;
};
