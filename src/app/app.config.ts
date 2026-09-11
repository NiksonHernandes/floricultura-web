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
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  provideNativeDateAdapter,
} from '@angular/material/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { EventosService } from './features/eventos/eventos.service';
import { FornecedoresService } from './features/fornecedores/fornecedores.service';
import { CoresService } from './features/configuracoes/cores/cores.service';
import { PT_BR_DATE_FORMATS, PtBrDateAdapter } from './core/date/pt-br-date-adapter';

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
    // Datepicker pt-BR (SPEC-M4.1 §4.3, T-M4.1-4): adapter nativo + override `dd/MM/yyyy` estrito.
    // `provideNativeDateAdapter` traz a base; sobrescrevemos `DateAdapter`/`MAT_DATE_FORMATS` com a
    // variante pt-BR e fixamos o locale para nomes de mês/dia em português.
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: PtBrDateAdapter },
    { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' },
    { provide: MAT_DATE_FORMATS, useValue: PT_BR_DATE_FORMATS },
    // Eventos: provido no app (não `providedIn:'root'`) para que `produtos`/`produto-form` possam
    // optar por NÃO carregá-lo nos seus testes (inject opcional → null), preservando os specs do
    // M2/M3 intactos (anti-burla). A app real resolve o serviço por este provider (SPEC-M4 §3.2).
    EventosService,
    // Fornecedores: MESMO padrão (SPEC-M5.1 HISTÓRIA #5/AD-SQ-72) — provido aqui (não `root`) para que
    // a lista-mãe `produtos` o injete opcional (null nos specs herdados → nenhum GET; anti-burla).
    FornecedoresService,
    // Cores: MESMO padrão (SPEC-M6 §3.15/T-M6-06a) — provido aqui, não `providedIn:'root'`. Quando
    // o `produto-form` passar a consumir o catálogo (T-M6-09a), os specs herdados do M2/M3 que não
    // registram o serviço recebem `null` no inject opcional e seguem sem disparar `GET /cores`
    // (anti-burla: nenhum teste herdado precisa mudar).
    CoresService,
  ],
};
