import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/** Rota pública de login: não recebe header nem tratamento de 401 (evita loop). */
const ROTA_LOGIN = '/auth/login';

/**
 * Interceptor HTTP funcional (SPEC-M1 §3.6, CA-13):
 * - injeta `Authorization: Bearer <token>` quando há token e a rota NÃO é a de login;
 * - `401` → `logout()` + navega para `/login`;
 * - `403` → snackbar de permissão (NÃO desloga);
 * - a rota pública de login passa intacta (o erro volta ao componente de login).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Restrinja credenciais e tratamento de sessão à origem e ao caminho da nossa API.
  const api = new URL(environment.apiBaseUrl, window.location.origin);
  const destino = new URL(req.url, window.location.origin);
  const pertenceApi = destino.origin === api.origin &&
    (destino.pathname === api.pathname || destino.pathname.startsWith(api.pathname + '/'));
  if (!pertenceApi) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  const ehLogin = destino.pathname === api.pathname + ROTA_LOGIN;
  const token = auth.token();

  const requisicao =
    token && !ehLogin
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(requisicao).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (!ehLogin && erro.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      } else if (!ehLogin && erro.status === 403) {
        snackBar.open('Você não tem permissão para esta ação.', 'Fechar', {
          duration: 5000,
        });
      }
      return throwError(() => erro);
    }),
  );
};
