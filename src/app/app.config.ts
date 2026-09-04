import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { EventosService } from './features/eventos/eventos.service';

// Locale pt-BR precisa ser registrado antes de qualquer DatePipe/DecimalPipe com locale 'pt-BR'
// (SPEC-M3 §3.7 Ajuste 2 / CA-14). Sem isso o DatePipe quebra em runtime ao formatar em pt-BR.
registerLocaleData(localePt, 'pt-BR');

/**
 * Configuração raiz da aplicação (standalone).
 * - provideHttpClient + authInterceptor: injeta o Bearer e trata 401/403 (SPEC-M1 §3.6).
 * - provideAppInitializer: reidrata o perfil via `GET /auth/me` no boot se houver token.
 * - provideAnimationsAsync: habilita animações do Angular Material (carregamento sob demanda).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    provideAppInitializer(() => inject(AuthService).reidratar()),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    // Eventos: provido no app (não `providedIn:'root'`) para que `produtos`/`produto-form` possam
    // optar por NÃO carregá-lo nos seus testes (inject opcional → null), preservando os specs do
    // M2/M3 intactos (anti-burla). A app real resolve o serviço por este provider (SPEC-M4 §3.2).
    EventosService,
  ],
};
